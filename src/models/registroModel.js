const pool = require('../config/db');
const {
    generateRegistrationCode,
    generateDriverTag,
    generateSpecialTag,
    generateVisitorTag
} = require('../utils/codeGenerator');

async function crearRegistroYConductor({ idVehiculo, idVisitanteConductor, tipoVisitanteConductor, nVisitantes, idGuardiaCaseta, tagType, nTarjeta = null, idPreregistro = null }) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Insertar el registro (sin code_registro aún)
        const resultRegistro = await client.query(
            `INSERT INTO registro (
         id_preregistro,
         id_vehiculo,
         id_guardia_caseta,
         hora_entrada_caseta,
         n_visitantes,
         estatus
       ) VALUES ($1, $2, $3, NOW(), $4, 'en caseta')
       RETURNING id`,
            [idPreregistro, idVehiculo, idGuardiaCaseta, nVisitantes]
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
            throw Object.assign(new Error(`Se excede el número de personas que pueden ingresar al edificio. Ya hay ${totalActual} y se intentan agregar ${nuevos}`), {
                status: 400,
                code: 'LIMIT_EXCEEDED'
            });
        }

        let codigos = [];

        // 3. Insertar visitantes
        for (let i = 0; i < visitantes.length; i++) {
            const v = visitantes[i];
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
           n_visitantes
         ) VALUES (
           NOW(), $1, $2, $3, $4, 'en edificio', $5
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

async function salidaEdificio(registroId, cantidad, notas, userId) {
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

    if (registro.id_vehiculo) {
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
        const error = new Error(`Solo han salido ${salieron} de ${registro.n_visitantes} personas ${registro.estatus === 'transito' ? 'del edificio' : 'de la caseta'}`);
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
  

module.exports = {
    crearRegistroYConductor,
    agregarVisitantesEdificio,
    crearRegistroPeatonal,
    buscarRegistroPorCodigo,
    salidaEdificio,
    salidaCaseta
};
