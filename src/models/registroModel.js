const pool = require('../config/db');
const {
    generateRegistrationCode,
    generateDriverTag,
    generateSpecialTag,
    generateVisitorTag
} = require('../utils/codeGenerator');
const { validateTarjetaDisponible } = require('../utils/modelsHelpers');

async function crearRegistroYConductor({ idVehiculo, idVisitanteConductor, tipoVisitanteConductor, nVisitantes, idGuardiaCaseta, tagType, nTarjeta = null, idPreregistro = null }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let tipo_r = 'completo';

        if (tipoVisitanteConductor === 'proveedor' || tipoVisitanteConductor === 'taxi o uber') {
            tipo_r = 'proveedor';
        }

        // 1. Insertar el registro (sin code_registro aún)
        const resultRegistro = await client.query(
            `INSERT INTO registro (
         id_preregistro,
         id_vehiculo,
         id_guardia_caseta,
         hora_entrada_caseta,
         n_visitantes,
         estatus,
         tipo_r
       ) VALUES ($1, $2, $3, NOW(), $4, 'en caseta', $5)
       RETURNING id`,
            [idPreregistro, idVehiculo, idGuardiaCaseta, nVisitantes, tipo_r]
        );

        const registroId = resultRegistro.rows[0].id;

        // 2. Generar y actualizar code_registro
        const codeRegistro = generateRegistrationCode(registroId);
        await client.query(
            `UPDATE registro SET code_registro = $1 WHERE id = $2`,
            [codeRegistro, registroId]
        );

        // 3. Insertar conductor en registro_visitantes
        const codigoConductor = (['proveedor', 'taxi o uber'].includes(tipoVisitanteConductor))
            ? generateSpecialTag(codeRegistro, 'PROV')
            : generateDriverTag(codeRegistro);
        await client.query(
            `INSERT INTO registro_visitantes (
         registro_id,
         id_visitante,
         codigo,
         tag_type,
         n_tarjeta
       ) VALUES ($1, $2, $3, $4, $5)`,
            [registroId, idVisitanteConductor, codigoConductor, tagType, nTarjeta]
        );

        await client.query('COMMIT');

        return {
            registro_id: registroId,
            code_registro: codeRegistro,
            codigo_conductor: codigoConductor
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function agregarVisitantesEdificio(registroId, visitantes, idGuardiaEntrada, edificio, idPersonaVisitar = null, motivo = null) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Obtener registro base
        const { rows } = await client.query(
            `SELECT * FROM registro WHERE id = $1`,
            [registroId]
        );

        if (rows.length === 0) {
            throw Object.assign(new Error('Registro no encontrado'), { status: 404 });
        }

        const registro = rows[0];

        if (registro.estatus !== 'en caseta') {
            throw Object.assign(new Error('El registro no está en estado válido para entrada a edificio'), {
                status: 400,
                code: 'INVALID_STATUS'
            });
        }

        // 2. Verificar que no excedan n_visitantes
        const { rows: actuales } = await client.query(
            `SELECT COUNT(*)::int as total FROM registro_visitantes WHERE registro_id = $1`,
            [registroId]
        );

        const totalActual = actuales[0].total;
        console.log('Total actual:', totalActual);

        // Buscar id del conductor ya registrado
        const conductorRes = await client.query(
            `SELECT id_visitante FROM registro_visitantes
   WHERE registro_id = $1 AND codigo LIKE '%-CND'`,
            [registroId]
        );

        const idConductor = conductorRes.rows[0]?.id_visitante;

        // Verificar si en esta entrada también se está usando al conductor
        let nuevos = 0;
        for (const v of visitantes) {
            // Solo cuenta si NO es el conductor
            if (v.id_visitante !== idConductor) {
                nuevos++;
            }
        }
        console.log('Nuevos:', nuevos);

        const totalPrevisto = totalActual + nuevos;
        console.log('Total previsto:', totalPrevisto);

        if (totalPrevisto > registro.n_visitantes) {
            throw Object.assign(new Error(`Se excede el número de personas que pueden ingresar al edificio. Ya hay ${totalActual} y se intentan agregar ${nuevos}, el conductor ya se cuenta`), {
                status: 400,
                code: 'LIMIT_EXCEEDED'
            });
        }

        let codigos = [];

        // 3. Insertar visitantes
        for (let i = 0; i < visitantes.length; i++) {
            const v = visitantes[i];
            if (v.tag_type === 'tarjeta' && v.n_tarjeta) {
                await validateTarjetaDisponible(v.n_tarjeta, client);
            }
            const codigo = generateVisitorTag(registro.code_registro, totalPrevisto + i + 1);
            codigos.push({ id_visitante: v.id_visitante, codigo });

            await client.query(
                `INSERT INTO registro_visitantes (
             registro_id, id_visitante, codigo, tag_type, n_tarjeta
           ) VALUES ($1, $2, $3, $4, $5)`,
                [registroId, v.id_visitante, codigo, v.tag_type, v.n_tarjeta || null]
            );
        }

        console.log('persona a visitar:', idPersonaVisitar);

        // 4. Actualizar hora y guardia
        await client.query(
            `UPDATE registro
         SET hora_entrada_edificio = NOW(),
             id_guardia_edificio = $1,
             edificio = $2,
             id_persona_a_visitar = $3,
             motivo = $4,
             estatus = 'en edificio'
         WHERE id = $5`,
            [idGuardiaEntrada, edificio, idPersonaVisitar, motivo, registroId]
        );

        await client.query('COMMIT');
        return { ok: true, message: 'Visitantes registrados en edificio', codigos };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function crearRegistroPeatonal({ visitantes, edificio, motivo, idPersonaVisitar = null, idGuardiaEntrada }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Crear registro
        const result = await client.query(
            `INSERT INTO registro (
           hora_entrada_edificio,
           id_guardia_edificio,
           edificio,
           motivo,
           id_persona_a_visitar,
           estatus,
           n_visitantes,
           tipo_r
         ) VALUES (
           NOW(), $1, $2, $3, $4, 'en edificio', $5, 'peatonal'
         ) RETURNING id`,
            [idGuardiaEntrada, edificio, motivo, idPersonaVisitar, visitantes.length]
        );

        const registroId = result.rows[0].id;

        // 2. Generar code_registro y actualizar
        const codeRegistro = generateRegistrationCode(registroId);
        await client.query(
            `UPDATE registro SET code_registro = $1 WHERE id = $2`,
            [codeRegistro, registroId]
        );

        // 3. Insertar visitantes
        const codigos = [];

        for (let i = 0; i < visitantes.length; i++) {
            const v = visitantes[i];
            if (v.tag_type === 'tarjeta' && v.n_tarjeta) {
                await validateTarjetaDisponible(v.n_tarjeta, client);
            }
            const codigo = generateSpecialTag(codeRegistro, `P${String(i + 1).padStart(2, '0')}`);
            codigos.push({ id_visitante: v.id_visitante, codigo });

            await client.query(
                `INSERT INTO registro_visitantes (
             registro_id, id_visitante, codigo, tag_type, n_tarjeta
           ) VALUES ($1, $2, $3, $4, $5)`,
                [registroId, v.id_visitante, codigo, v.tag_type, v.n_tarjeta || null]
            );
        }

        await client.query('COMMIT');

        return {
            registro_id: registroId,
            code_registro: codeRegistro,
            codigos
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function buscarRegistroPorCodigo(code_registro) {
    const { rows } = await pool.query(
        `SELECT * FROM registro WHERE code_registro = $1`,
        [code_registro]
    );

    if (rows.length === 0) {
        const error = new Error('Registro no encontrado');
        error.status = 404;
        error.code = 'REGISTRO_NO_ENCONTRADO';
        throw error;
    }

    const registro = rows[0];

    // Consultar visitantes excluyendo al conductor
    const { rows: visitantes } = await pool.query(
        `SELECT rv.id, rv.id_visitante, rv.codigo, v.nombre
       FROM registro_visitantes rv
       JOIN visitantes v ON v.id = rv.id_visitante
       WHERE rv.registro_id = $1
         AND rv.codigo ~ '-[VP][0-9]{2}$'`,
        [registro.id]
    );

    const tipo = registro.id_vehiculo ? 'vehicular' : 'peatonal';

    return {
        id: registro.id,
        code_registro: registro.code_registro,
        estatus: registro.estatus,
        tipo,
        n_visitantes: registro.n_visitantes,
        hora_entrada_edificio: registro.hora_entrada_edificio,
        visitantes
    };
}

async function salidaEdificio(registroId, cantidad, notas, userId, salida_vehiculo) {
    const { rows } = await pool.query(
        `SELECT id, id_vehiculo, n_visitantes, hora_entrada_edificio, hora_salida_edificio
       FROM registro
       WHERE id = $1`,
        [registroId]
    );

    if (rows.length === 0) {
        const error = new Error('Registro no encontrado');
        error.status = 404;
        error.code = 'REGISTRO_NO_ENCONTRADO';
        throw error;
    }

    const registro = rows[0];

    if (!registro.hora_entrada_edificio) {
        const error = new Error('El registro aún no ha ingresado al edificio');
        error.status = 400;
        error.code = 'SIN_ENTRADA_EDIFICIO';
        throw error;
    }

    if (registro.hora_salida_edificio) {
        const error = new Error('Este registro ya tiene registrada una salida del edificio');
        error.status = 400;
        error.code = 'YA_SALIO_EDIFICIO';
        throw error;
    }

    // Contar visitantes que entraron al edificio (códigos -Vxx o -Pxx)
    const { rows: countRows } = await pool.query(
        `SELECT COUNT(*) AS total
       FROM registro_visitantes
       WHERE registro_id = $1
         AND codigo ~ '-[VP][0-9]{2}$'`,
        [registroId]
    );

    const totalEsperado = parseInt(countRows[0].total);

    if (cantidad !== totalEsperado) {
        const error = new Error(`La cantidad de personas entregadas (${cantidad}) no coincide con las que ingresaron (${totalEsperado})`);
        error.status = 400;
        error.code = 'CANTIDAD_NO_COINCIDE';
        throw error;
    }

    let estatus;

    if (registro.id_vehiculo || salida_vehiculo) {
        // Vehicular → sigue en tránsito
        estatus = 'transito';
    } else {
        // Peatonal → validar si todos salieron
        if (cantidad !== registro.n_visitantes) {
            const error = new Error(`Solo han salido ${cantidad} de ${registro.n_visitantes} visitantes registrados`);
            error.status = 400;
            error.code = 'VISITANTES_INCOMPLETOS';
            throw error;
        }
        estatus = 'completo';
    }

    let nuevaNota = null;
    if (notas) {
        nuevaNota = `Notas del edificio: ${notas}`;
    }

    await pool.query(
        `UPDATE registro
           SET hora_salida_edificio = NOW(),
               estatus = $1,
               notas = COALESCE($2, notas),
               id_guardia_edificio_salida = $3,
               n_salieron = $4
           WHERE id = $5`,
        [estatus, nuevaNota, userId, cantidad, registroId]
    );

    return { estatus };
}

async function salidaCaseta(registroId, idGuardia, notas, salieron) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Obtener registro
        const res = await client.query(
            'SELECT id, estatus, n_visitantes, n_salieron FROM registro WHERE id = $1 FOR UPDATE',
            [registroId]
        );

        if (res.rows.length === 0) {
            const error = new Error('Registro no encontrado');
            error.status = 404;
            error.code = 'REGISTRO_NOT_FOUND';
            throw error;
        }

        const registro = res.rows[0];

        // 2. Validar estatus permitido
        if (!['transito', 'en caseta'].includes(registro.estatus)) {
            const error = new Error(`No se puede marcar salida para un registro con estatus "${registro.estatus}"`);
            error.status = 400;
            error.code = 'ESTATUS_INVALIDO';
            throw error;
        }

        // 3. Validar número de salidas
        if (salieron !== registro.n_visitantes) {
            const error = new Error(`Estan saliendo ${salieron} de ${registro.n_visitantes} personas de la caseta`);
            error.status = 400;
            error.code = 'SALIDAS_INCOMPLETAS';
            throw error;
        }

        const notaTexto = typeof notas === 'string' ? notas : '';
        console.log(notaTexto);

        // 4. Actualizar registro
        await client.query(`
        UPDATE registro
        SET hora_salida_caseta = NOW(),
            id_guardia_caseta_salida = $1,
            estatus = 'completo',
            notas = CONCAT(COALESCE(notas, ''), ' | Notas caseta: ', $2::text),
            n_salieron = $4
        WHERE id = $3
      `, [idGuardia, notaTexto, registroId, salieron]);

        await client.query('COMMIT');

        return { ok: true };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function obtenerListadoRegistrosDataTable({ start, length, search, filtros }) {
    const params = [];
    let where = 'WHERE TRUE'; // base neutra

    // Búsqueda solo en code_registro
    if (search) {
        params.push(`%${search}%`);
        where += ` AND r.code_registro ILIKE $${params.length}`;
    }

    // Filtros
    if (filtros.estatus) {
        params.push(filtros.estatus);
        where += ` AND r.estatus = $${params.length}`;
    }
    if (filtros.tipo_r) {
        params.push(filtros.tipo_r);
        where += ` AND r.tipo_r = $${params.length}`;
    }
    if (filtros.edificio) {
        params.push(filtros.edificio);
        where += ` AND r.edificio = $${params.length}`;
    }

    // Total general
    const total = await pool.query(`SELECT COUNT(*) FROM registro`);
    // Total con filtros
    const totalFiltrado = await pool.query(`
      SELECT COUNT(*) FROM registro r
      LEFT JOIN users u ON u.id = r.id_persona_a_visitar
      ${where}
    `, params);

    // Consulta final paginada
    params.push(length, start);
    const registros = await pool.query(`
      SELECT r.id, r.code_registro, r.edificio, r.n_visitantes,
             u.name AS persona_a_visitar, r.estatus, r.tipo_r
      FROM registro r
      LEFT JOIN users u ON u.id = r.id_persona_a_visitar
      ${where}
      ORDER BY r.fecha_create DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);

    return {
        recordsTotal: parseInt(total.rows[0].count),
        recordsFiltered: parseInt(totalFiltrado.rows[0].count),
        data: registros.rows
    };
}

async function obtenerDetalleRegistro(id) {
    // 1. Registro principal
    const result = await pool.query(`
      SELECT 
        r.id,
        r.code_registro,
        r.estatus,
        r.tipo_r,
        r.edificio,
        r.n_visitantes,
        r.n_salieron,
        r.motivo,
        r.notas,
        r.id_persona_a_visitar,
        r.hora_entrada_caseta,
        r.hora_entrada_edificio,
        r.hora_salida_edificio,
        r.hora_salida_caseta,
        r.fecha_create,
        r.fecha_update,
        r.id_vehiculo,
        r.id_guardia_caseta,
        r.id_guardia_edificio,
        r.id_guardia_caseta_salida,
        r.id_guardia_edificio_salida,
        u.name AS persona_a_visitar
      FROM registro r
      LEFT JOIN users u ON u.id = r.id_persona_a_visitar
      WHERE r.id = $1
    `, [id]);

    const registro = result.rows[0];
    if (!registro) return null;

    // 2. Visitantes
    const visitantesRes = await pool.query(`
      SELECT 
        rv.id,
        rv.codigo,
        rv.tag_type,
        rv.n_tarjeta,
        v.nombre AS nombre_visitante,
        v.telefono,
        v.empresa,
        v.tipo,
        v.foto_persona,
        v.foto_ine,
        v.activo
      FROM registro_visitantes rv
      JOIN visitantes v ON v.id = rv.id_visitante
      WHERE rv.registro_id = $1
      ORDER BY rv.codigo
    `, [id]);

    // 3. Vehículo
    let vehiculo = null;
    if (registro.id_vehiculo) {
        const vehiculoRes = await pool.query(`
        SELECT 
          v.id,
          v.placa,
          v.foto_placa
        FROM vehiculos v
        WHERE v.id = $1
      `, [registro.id_vehiculo]);

        vehiculo = vehiculoRes.rows[0] || null;
    }

    return {
        registro,
        visitantes: visitantesRes.rows,
        vehiculo
    };
}

async function asociarVehiculoARegistro(code_registro, id_vehiculo, id_visitante) {
    const client = await pool.connect();
    let status = 'transito';
    try {
        await client.query('BEGIN');

        const { rows } = await client.query(`
        SELECT id, estatus, n_visitantes, code_registro
        FROM registro
        WHERE code_registro = $1
        FOR UPDATE
      `, [code_registro]);

        if (rows.length === 0) {
            throw new Error('Registro no encontrado');
        }

        const registro = rows[0];

        if (registro.estatus !== 'en edificio' && registro.estatus !== 'transito') {
            throw new Error('Solo se puede asociar un vehículo a un registro que esté en edificio');
        }

        if (registro.estatus === 'en edificio') {
            status = 'uber en espera';
        }

        const codigoConductor = generateDriverTag(registro.code_registro);

        // Insertar visitante (conductor)
        await client.query(`
        INSERT INTO registro_visitantes (
          registro_id, id_visitante, codigo, tag_type
        ) VALUES ($1, $2, $3, 'etiqueta')
      `, [registro.id, id_visitante, codigoConductor]);

        // Aumentar n_visitantes
        const nuevoTotal = registro.n_visitantes + 1;

        await client.query(`
            UPDATE registro
            SET id_vehiculo = $1,
                estatus = $4,
                hora_entrada_caseta = NOW(),
                n_visitantes = $2
            WHERE id = $3
          `, [id_vehiculo, nuevoTotal, registro.id, status]);

        await client.query('COMMIT');

        return { message: 'Vehículo y conductor asociados correctamente' };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function nombreVisitante(idVisitante) {
    const res = await pool.query(`SELECT nombre FROM visitantes WHERE id = $1`, [idVisitante]);
    return res.rows[0].nombre;
}

module.exports = {
    crearRegistroYConductor,
    agregarVisitantesEdificio,
    crearRegistroPeatonal,
    buscarRegistroPorCodigo,
    salidaEdificio,
    salidaCaseta,
    obtenerListadoRegistrosDataTable,
    obtenerDetalleRegistro,
    asociarVehiculoARegistro,
    nombreVisitante
};
