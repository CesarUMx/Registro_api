const pool = require('../config/db');
const {
  generateRegistrationCode,
  generateDriverTag,
  generateSpecialTag,
  generateVisitorTag
} = require('../utils/codeGenerator');
const { validateTarjetaDisponible, actualizarSalida } = require('../utils/modelsHelpers');
const { withTransaction } = require('../utils/controllerHelpers');

async function crearRegistroYConductor({
  vehiculo_id,
  idVisitanteConductor,
  tipoVisitanteConductor,
  tipoVisitanteNoRegistrado,
  nVisitantes,
  idGuardiaCaseta,
  tagType,
  nTarjeta,
  numMarbete,
  motivo
}) {

  return withTransaction(async (client) => {
    // Determinar tipo de registro
    let tipo_r = 'completo';
    if (['proveedor', 'taxi o uber'].includes(tipoVisitanteConductor)) {
      tipo_r = 'proveedor';
    } else if (tipoVisitanteConductor === 'no registrado') {
      tipo_r = 'no_registrado';
    }

    // Insertar registro principal
    const result = await client.query(
      `INSERT INTO registro (
         id_guardia_caseta,
         hora_entrada_caseta,
         n_visitantes,
         estatus,
         tipo_r,
         motivo,
         tipo_no_reguistardo
       ) VALUES ($1, NOW(), $2, 'iniciado', $3, $4, $5)
       RETURNING id`,
      [idGuardiaCaseta, nVisitantes, tipo_r, motivo, tipoVisitanteNoRegistrado]
    );

    const registroId = result.rows[0].id;
    const codeRegistro = generateRegistrationCode(registroId);

    await client.query(
      `UPDATE registro SET code_registro = $1 WHERE id = $2`,
      [codeRegistro, registroId]
    );

    // Insertar conductor
    const codigoConductor = (['proveedor', 'taxi o uber'].includes(tipoVisitanteConductor))
      ? generateSpecialTag(codeRegistro, 'PROV')
      : generateDriverTag(codeRegistro);

    await client.query(
      `INSERT INTO registro_visitantes (
         registro_id,
         id_visitante,
         codigo,
         tag_type,
         n_tarjeta,
         estatus,
         hora_entrada_caseta
       ) VALUES ($1, $2, $3, $4, $5, 'en caseta', NOW())`,
      [registroId, idVisitanteConductor, codigoConductor, tagType, nTarjeta]
    );

    // Si se recibió un vehículo, lo asociamos
    if (vehiculo_id) {
      await client.query(
        `INSERT INTO registro_vehiculos (
           registro_id,
           vehiculo_id,
           hora_entrada,
           num_marbete
         ) VALUES ($1, $2, NOW(), $3)`,
        [registroId, vehiculo_id, numMarbete]
      );
    }

    return {
      registro_id: registroId,
      code_registro: codeRegistro,
      codigo_conductor: codigoConductor
    };
  });
}

async function agregarVisitantesEdificio(registroId, visitantes, idGuardiaEntrada, edificio, idPersonaVisitar = null, motivo = null) {

  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM registro WHERE id = $1`, [registroId]);
    if (rows.length === 0) {
      throw Object.assign(new Error('Registro no encontrado'), { status: 404 });
    }

    const registro = rows[0];

    // Verificar que los visitantes ya estén registrados
    for (const v of visitantes) {
      const { rows: visitanteRows } = await client.query(
        `SELECT * FROM registro_visitantes WHERE registro_id = $1 AND id_visitante = $2`,
        [registroId, v.id_visitante]
      );

      if (visitanteRows.length === 0) {
        throw Object.assign(new Error(`El visitante con ID ${v.id_visitante} no está registrado en este registro`), {
          status: 400,
          code: 'VISITOR_NOT_FOUND'
        });
      }
    }

    // Obtener información del conductor si existe
    const conductorRes = await client.query(
      `SELECT id_visitante FROM registro_visitantes
         WHERE registro_id = $1 AND codigo LIKE '%-CND'`,
      [registroId]
    );
    const idConductor = conductorRes.rows[0]?.id_visitante;

    let codigos = [];

    // Actualizar cada visitante seleccionado
    for (const v of visitantes) {
      // Validar tarjeta si es necesario (solo si se proporciona tag_type)
      if (v.tag_type === 'tarjeta' && v.n_tarjeta) {
        await validateTarjetaDisponible(v.n_tarjeta, client);
      }

      // Primero obtener el código actual del visitante
      const { rows: visitanteActual } = await client.query(
        `SELECT codigo FROM registro_visitantes WHERE registro_id = $1 AND id_visitante = $2`,
        [registroId, v.id_visitante]
      );

      if (visitanteActual.length === 0) {
        throw Object.assign(new Error(`El visitante con ID ${v.id_visitante} no está registrado en este registro`), {
          status: 400,
          code: 'VISITOR_NOT_FOUND'
        });
      }

      // Guardar el código para devolverlo en la respuesta
      codigos.push({ id_visitante: v.id_visitante, codigo: visitanteActual[0].codigo });

      // Actualizar el registro del visitante - solo actualizar tag_type y n_tarjeta si se proporcionan
      if (v.tag_type && v.n_tarjeta !== undefined) {
        await client.query(
          `UPDATE registro_visitantes
           SET hora_entrada_edificio = NOW(), 
               estatus = 'en edificio', 
               tag_type = $3, 
               n_tarjeta = $4
           WHERE registro_id = $1 AND id_visitante = $2`,
          [registroId, v.id_visitante, v.tag_type, v.n_tarjeta || null]
        );
      } else {
        // Solo actualizar hora y estatus si no se proporcionan tag_type/n_tarjeta
        await client.query(
          `UPDATE registro_visitantes
           SET hora_entrada_edificio = NOW(), 
               estatus = 'en edificio'
           WHERE registro_id = $1 AND id_visitante = $2`,
          [registroId, v.id_visitante]
        );
      }
    }

    // ✅ Solo se actualizan datos administrativos, no hora ni estatus
    await client.query(
      `UPDATE registro
         SET edificio = $1,
             id_persona_a_visitar = $2,
             motivo = $3,
             id_guardia_edificio = $4,
             hora_entrada_edificio = NOW()
         WHERE id = $5`,
      [edificio, idPersonaVisitar, motivo, idGuardiaEntrada, registroId]
    );

    return { ok: true, message: 'Visitantes registrados en edificio', codigos, code_registro: registro.code_registro };
  });
}

async function crearRegistroPeatonal({ visitantes, idGuardiaCaseta, destino = 'edificio' }) {
  return withTransaction(async (client) => {
    // 1. Crear registro principal con estatus 'iniciado'
    const result = await client.query(
      `INSERT INTO registro (
         hora_entrada_caseta,
         id_guardia_caseta,
         estatus,
         n_visitantes,
         tipo_r
       ) VALUES (
         NOW(), $1, 'iniciado', $2, 'peatonal'
       )
       RETURNING id`,
      [idGuardiaCaseta, visitantes.length]
    );

    const registroId = result.rows[0].id;

    // 2. Generar code_registro
    const codeRegistro = generateRegistrationCode(registroId);
    await client.query(
      `UPDATE registro SET code_registro = $1 WHERE id = $2`,
      [codeRegistro, registroId]
    );

    // 3. Insertar cada visitante con hora_entrada_edificio
    const codigos = [];

    for (let i = 0; i < visitantes.length; i++) {
      const v = visitantes[i];

      if (v.tag_type === 'tarjeta' && v.n_tarjeta) {
        await validateTarjetaDisponible(v.n_tarjeta, client);
      }

      const codigo = generateSpecialTag(codeRegistro, `P${String(i + 1).padStart(2, '0')}`);
      codigos.push({ id_visitante: v.id_visitante, codigo });

      // Determinar el estatus según el destino
      // Si es edificio -> 'en caseta', si es cafeteria o alumno -> el nombre del destino
      const estatus = destino === 'edificio' ? 'en caseta' : destino;

      await client.query(
        `INSERT INTO registro_visitantes (
           registro_id,
           id_visitante,
           codigo,
           tag_type,
           n_tarjeta,
           estatus,
           hora_entrada_caseta
         ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [registroId, v.id_visitante, codigo, v.tag_type, v.n_tarjeta || null, estatus]
      );
    }

    return {
      registro_id: registroId,
      code_registro: codeRegistro,
      codigos
    };
  });
}

async function buscarRegistroPorCodigo(code_registro) {
  return withTransaction(async (client) => {
    // Obtener información principal del registro
    const resRegistro = await client.query(`
      SELECT r.id, r.tipo_r, r.estatus, r.code_registro, r.notas,
             r.hora_entrada_caseta, r.hora_salida_caseta,
             r.hora_entrada_edificio, r.hora_salida_edificio,
             r.n_visitantes, r.n_salieron, r.edificio, r.motivo,
             r.id_persona_a_visitar, u.name AS persona_a_visitar,
             r.fecha_create, r.fecha_update
      FROM registro r
      LEFT JOIN users u ON u.id = r.id_persona_a_visitar
      WHERE r.code_registro = $1
    `, [code_registro]);

    if (resRegistro.rows.length === 0) {
      const error = new Error('Registro no encontrado');
      error.status = 404;
      error.code = 'REGISTRO_NO_ENCONTRADO';
      throw error;
    }

    const registro = resRegistro.rows[0];

    // Obtener todos los visitantes con información completa y estatus
    const resVisitantes = await client.query(`
      SELECT rv.id as registro_visitante_id,
             rv.id_visitante,
             rv.codigo,
             rv.hora_entrada_caseta,
             rv.hora_salida_caseta,
             rv.hora_entrada_edificio,
             rv.hora_salida_edificio,
             rv.estatus,
             rv.n_tarjeta,
             rv.tag_type,
             v.nombre,
             v.tipo,
             v.empresa,
             v.telefono,
             v.foto_persona,
             v.foto_ine
      FROM registro_visitantes rv
      INNER JOIN visitantes v ON rv.id_visitante = v.id
      WHERE rv.registro_id = $1
      ORDER BY rv.codigo
    `, [registro.id]);

    // Obtener todos los vehículos asociados
    const resVehiculos = await client.query(`
      SELECT rv.vehiculo_id AS id,
             rv.hora_entrada,
             rv.hora_salida,
             rv.num_marbete,
             v.placa,
             v.foto_placa
      FROM registro_vehiculos rv
      INNER JOIN vehiculos v ON rv.vehiculo_id = v.id
      WHERE rv.registro_id = $1
    `, [registro.id]);

    // Determinar el tipo de registro
    const tipo = resVehiculos.rows.length > 0 ? 'vehicular' : 'peatonal';

    return {
      ...registro,
      tipo,
      visitantes: resVisitantes.rows,
      vehiculos: resVehiculos.rows
    };
  });
}

async function salidaEdificio(registroId, visitantes, notas = '', userId, salida_vehiculo = false) {
  return withTransaction(async (client) => {
    const resRegistro = await client.query(`
      SELECT id, tipo_r, estatus
      FROM registro
      WHERE id = $1
    `, [registroId]);

    if (resRegistro.rows.length === 0) {
      throw Object.assign(new Error('Registro no encontrado'), {
        status: 404,
        code: 'REGISTRO_NO_ENCONTRADO'
      });
    }

    const registro = resRegistro.rows[0];

    if (registro.estatus === 'completo') {
      throw Object.assign(new Error('El registro ya fue finalizado'), {
        status: 400,
        code: 'YA_COMPLETADO'
      });
    }

    for (const v of visitantes) {
      const visitanteId = v.id_visitante;
      const status_actual = await client.query(`
        SELECT estatus
        FROM registro_visitantes
        WHERE registro_id = $1 AND id_visitante = $2
      `, [registroId, visitanteId]);

      if (status_actual.rows.length === 0) {
        throw Object.assign(new Error('Visitante no encontrado'), {
          status: 404,
          code: 'VISITANTE_NO_ENCONTRADO'
        });
      }

      const status = status_actual.rows[0].estatus;

      if (status !== 'en edificio') {
        throw Object.assign(new Error('El visitante ya salio del edificio'), {
          status: 400,
          code: 'YA_SALIO'
        });
      }

      const nuevoEstatus = salida_vehiculo
        ? 'uber en espera'
        : 'salio del edificio';

      // 1️⃣ Marcar salida del edificio
      await actualizarVisitanteEvento({
        registroId: registroId,
        visitanteId: visitanteId,
        evento: 'salida_edificio',
        estatus: nuevoEstatus
      });
    }

    // 2️⃣ Agregar nota al registro
    if (notas && notas.trim() !== '') {
      await client.query(`
        UPDATE registro
        SET notas = CONCAT(COALESCE(notas, ''), ' | Notas edificio: ', $1::text),
            id_guardia_edificio_salida = $2,
            hora_salida_edificio = NOW()
        WHERE id = $3
      `, [notas, userId, registroId]);
    }

    return {
      ok: true,
      message: `Salida registrada para ${visitantes.length} visitante(s)`
    };
  });
}

async function salidaCaseta(registroId, idGuardia, notas, n_salen) {
  return withTransaction(async (client) => {
    const res = await client.query(`
      SELECT id, estatus, n_visitantes
      FROM registro
      WHERE id = $1
      FOR UPDATE
    `, [registroId]);

    if (res.rows.length === 0) {
      throw Object.assign(new Error('Registro no encontrado'), {
        status: 404,
        code: 'REGISTRO_NOT_FOUND'
      });
    }

    const registro = res.rows[0];

    if (registro.estatus === 'completo') {
      throw Object.assign(new Error('El registro ya fue finalizado'), {
        status: 400,
        code: 'YA_COMPLETADO'
      });
    }

    // validamos las personas que saldran 
    if (n_salen === registro.n_visitantes) {

      //traen los id de los visitantes y vehiculos
      const visitantes = await client.query(`
      SELECT id_visitante
      FROM registro_visitantes
      WHERE registro_id = $1
    `, [registroId]);

      const vehiculos = await client.query(`
      SELECT vehiculo_id
      FROM registro_vehiculos
      WHERE registro_id = $1
    `, [registroId]);

      // cambiamos estatus y agregamos hora de salida
      for (const v of vehiculos.rows) {
        await client.query(`
          UPDATE registro_vehiculos
          SET hora_salida = NOW()
          WHERE registro_id = $1 AND vehiculo_id = $2
        `, [registroId, v.vehiculo_id]);
      }
      for (const v of visitantes.rows) {
        await actualizarVisitanteEvento({
          registroId,
          visitanteId: v.id_visitante,
          evento: 'salida_caseta'
        });
      }

      // intentar cerrar el registro
      await actualizarSalida(n_salen, registroId, client, "caseta");

      await client.query(`
        UPDATE registro
        SET id_guardia_caseta_salida = $1,
        notas = CONCAT(COALESCE(notas, ''), ' | Nota salida caseta: ', $2::text)
        WHERE id = $3
      `, [idGuardia, notas, registroId]);

    } else {
      throw Object.assign(new Error('El número de personas que salen no coincide con el número de personas que entraron'), {
        status: 400,
        code: 'PERSONAS_NO_COINCIDEN'
      });
    }

    return {
      ok: true,
      message: 'Registro finalizado correctamente por caseta'
    };
  });
}

async function registrarSalidaCasetaParcial(registroId, visitantes = [], vehiculoId = null, notas = '', guardiaId) {
  return withTransaction(async (client) => {
    // Validar que hay visitantes seleccionados
    if (!Array.isArray(visitantes) || visitantes.length === 0) {
      throw Object.assign(new Error('Debes seleccionar al menos un visitante para registrar salida'), {
        status: 400,
        code: 'SIN_VISITANTES'
      });
    }

    // 1️⃣ Registrar salida de visitantes
    for (const visitante of visitantes) {
      // Verificar que el objeto visitante tenga la propiedad id_visitante
      if (!visitante || !visitante.id_visitante) {
        console.warn('Objeto visitante inválido:', visitante);
        continue; // Saltamos este visitante
      }

      await actualizarVisitanteEvento({
        registroId,
        visitanteId: visitante.id_visitante,
        evento: 'salida_caseta'
      });
    }

    // 2️⃣ Registrar salida del vehículo (si se proporciona)
    if (vehiculoId) {
      await client.query(`
        UPDATE registro_vehiculos
        SET hora_salida = NOW()
        WHERE registro_id = $1 AND vehiculo_id = $2
      `, [registroId, vehiculoId]);
    }

    // 3️⃣ Actualizar registro con notas y guardia
    await client.query(`
      UPDATE registro
      SET 
        notas = CASE WHEN $1 <> '' THEN CONCAT(COALESCE(notas, ''), ' | Nota salida parcial: ', $1::text) ELSE notas END,
        id_guardia_caseta_salida = $3,
        hora_salida_caseta = NOW()
      WHERE id = $2
    `, [notas.trim(), registroId, guardiaId]);

    // 4️⃣ Verificar si ya todos salieron
    const cerrado = await actualizarSalida(visitantes.length, registroId, client, "caseta");

    // Preparar mensaje de respuesta
    let mensajeSalida = 'Salida parcial registrada';
    if (visitantes.length > 0) {
      mensajeSalida += ` (${visitantes.length} visitante(s))`;
    }
    if (vehiculoId) {
      mensajeSalida += ' y vehículo';
    }

    return {
      ok: true,
      cerrado,
      message: cerrado
        ? 'Registro finalizado: todos salieron por caseta'
        : mensajeSalida
    };
  });
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
             u.name AS persona_a_visitar, r.estatus, r.tipo_r,
             (
               SELECT json_agg(json_build_object(
                 'estatus', rv.estatus
               ))
               FROM registro_visitantes rv
               WHERE rv.registro_id = r.id
             ) AS visitantes
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

async function obtenerDetalleRegistro(registroId) {
  return withTransaction(async (client) => {
    const resRegistro = await client.query(`
      SELECT r.id, r.tipo_r, r.estatus, r.code_registro, r.notas,
             r.hora_entrada_caseta, r.hora_salida_caseta,
             r.hora_entrada_edificio, r.hora_salida_edificio,
             r.n_visitantes, r.n_salieron, r.edificio, r.motivo,
             r.id_persona_a_visitar, u.name AS persona_a_visitar
      FROM registro r
      LEFT JOIN users u ON u.id = r.id_persona_a_visitar
      WHERE r.id = $1
    `, [registroId]);

    if (resRegistro.rows.length === 0) {
      throw Object.assign(new Error('Registro no encontrado'), {
        status: 404,
        code: 'NO_EXISTE'
      });
    }

    const registro = resRegistro.rows[0];

    // Obtener visitantes
    const resVisitantes = await client.query(`
      SELECT rv.*, v.nombre, v.tipo, v.empresa, v.foto_persona, v.foto_ine
      FROM registro_visitantes rv
      INNER JOIN visitantes v ON rv.id_visitante = v.id
      WHERE rv.registro_id = $1
    `, [registroId]);

    // Obtener todos los vehículos asociados
    const resVehiculos = await client.query(`
      SELECT
        rv.vehiculo_id AS id,
        v.foto_placa,
        v.placa,
        rv.hora_entrada,
        rv.hora_salida,
        rv.num_marbete
      FROM registro_vehiculos rv
      INNER JOIN vehiculos v ON rv.vehiculo_id = v.id
      WHERE rv.registro_id = $1
    `, [registroId]);

    return {
      ...registro,
      visitantes: resVisitantes.rows,
      vehiculos: resVehiculos.rows
    };
  });
}

async function asociarVehiculoARegistro(codeRegistro, vehiculoId, guardiaId, id_visitante, tag_type, n_tarjeta, num_marbete) {
  return withTransaction(async (client) => {
    //buscar registro
    const registro = await client.query(`
      SELECT id FROM registro WHERE code_registro = $1
    `, [codeRegistro]);

    if (registro.rows.length === 0) {
      throw Object.assign(new Error('Registro no encontrado'), {
        status: 404,
        code: 'NO_EXISTE'
      });
    }

    const registroId = registro.rows[0].id;

    // Insertar el vehículo en la tabla de asociación
    await client.query(`
      INSERT INTO registro_vehiculos (
        registro_id,
        vehiculo_id,
        hora_entrada,
        num_marbete
      ) VALUES ($1, $2, NOW(), $3)
    `, [registroId, vehiculoId, num_marbete]);

    const codigoConductor = generateDriverTag(codeRegistro);

    // Insertar el visitante en la tabla de asociación
    await client.query(`
        INSERT INTO registro_visitantes (
          registro_id,
          id_visitante,
          codigo,
          tag_type,
          n_tarjeta,
          estatus,
          hora_entrada_caseta
        ) VALUES ($1, $2, $3, $4, $5, 'en caseta', NOW())
      `, [registroId, id_visitante, codigoConductor, tag_type, n_tarjeta]);

    // traer n_visitantes para sumar uno
    const nVisitantes = await client.query(`
      SELECT n_visitantes FROM registro WHERE id = $1
    `, [registroId]);

    // Agregar nota opcional y auditoría
    await client.query(`
      UPDATE registro
      SET notas = CONCAT(COALESCE(notas, ''), ' | Vehículo adicional vinculado'),
          id_guardia_caseta = $1,
          n_visitantes = $2
      WHERE id = $3
    `, [guardiaId, nVisitantes.rows[0].n_visitantes + 1, registroId]);

    return { registro_id: registroId, code_registro: codeRegistro, codigo_conductor: codigoConductor };
  });
}

async function nombreVisitante(idVisitante) {
  const res = await pool.query(`SELECT nombre FROM visitantes WHERE id = $1`, [idVisitante]);
  return res.rows[0].nombre;
}

async function actualizarVisitanteEvento({ registroId, visitanteId, evento, estatus = null }) {
  const campos = {
    entrada_caseta: 'hora_entrada_caseta',
    entrada_edificio: 'hora_entrada_edificio',
    salida_edificio: 'hora_salida_edificio',
    salida_caseta: 'hora_salida_caseta',
  };

  const nuevosEstatus = {
    entrada_caseta: 'en caseta',
    entrada_edificio: 'en edificio',
    salida_edificio: 'salio del edificio',
    salida_caseta: 'completo',
  };

  const campoHora = campos[evento];
  let nuevoEstatus = nuevosEstatus[evento];

  if (estatus !== undefined && estatus !== null) {
    nuevoEstatus = estatus;
  }

  if (!campoHora || !nuevoEstatus) {
    throw new Error(`Evento no válido: ${evento}`);
  }

  const query = `
      UPDATE registro_visitantes
      SET
        ${campoHora} = NOW(),
        estatus = $1
      WHERE
        registro_id = $2 AND id_visitante = $3
    `;

  await pool.query(query, [nuevoEstatus, registroId, visitanteId]);
}

async function cargarVisitantes(registroId, visitantes, idGuardia) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM registro WHERE id = $1`, [registroId]);
    if (rows.length === 0) {
      throw Object.assign(new Error('Registro no encontrado'), { status: 404 });
    }

    const registro = rows[0];

    // Verificar número de visitantes que ya se cargaron
    const { rows: actuales } = await client.query(
      `SELECT COUNT(*)::int as total FROM registro_visitantes WHERE registro_id = $1`,
      [registroId]
    );
    const totalActual = actuales[0].total;

    // Obtener el conductor si existe
    const conductorRes = await client.query(
      `SELECT id_visitante FROM registro_visitantes
         WHERE registro_id = $1 AND codigo LIKE '%-CND'`,
      [registroId]
    );
    const idConductor = conductorRes.rows[0]?.id_visitante;

    const totalPrevisto = totalActual + visitantes.length;

    if (totalPrevisto > registro.n_visitantes) {
      throw Object.assign(new Error(`Se excede el número de personas permitidas. Ya hay ${totalActual} y se intentan agregar ${visitantes.length}`), {
        status: 400,
        code: 'LIMIT_EXCEEDED'
      });
    }

    let codigos = [];

    for (let i = 0; i < visitantes.length; i++) {
      const v = visitantes[i];

      // Validar que el visitante no sea el conductor
      if (v.id_visitante === idConductor) {
        throw Object.assign(new Error('El conductor ya está registrado'), {
          status: 400,
          code: 'DUPLICATE_DRIVER'
        });
      }

      // Validar tarjeta si es necesario
      if (v.tag_type === 'tarjeta' && v.n_tarjeta) {
        await validateTarjetaDisponible(v.n_tarjeta, client);
      }

      // Generar código para el visitante
      const codigo = generateVisitorTag(registro.code_registro, i + 1);
      codigos.push({ id_visitante: v.id_visitante, codigo });

      // Insertar el visitante en la tabla de registro_visitantes
      await client.query(
        `INSERT INTO registro_visitantes (
            registro_id, id_visitante, codigo, tag_type, n_tarjeta,
            estatus, hora_entrada_caseta
          ) VALUES ($1, $2, $3, $4, $5, 'en caseta', NOW())`,
        [registroId, v.id_visitante, codigo, v.tag_type || 'etiqueta', v.n_tarjeta || null]
      );
    }

    return { ok: true, message: 'Visitantes cargados correctamente', codigos, code_registro: registro.code_registro };
  });
}

/**
 * Obtiene los visitantes asociados a un registro específico
 * @param {number} registroId - ID del registro
 * @returns {Promise<Array>} - Lista de visitantes con sus datos
 */
async function obtenerVisitantesRegistro(registroId) {
  try {
    const query = `
      SELECT 
        rv.id_visitante,
        rv.id as id_registro_visitante,
        v.nombre,
        v.empresa,
        v.telefono,
        rv.estatus,
        rv.tag_type,
        rv.n_tarjeta
      FROM registro_visitantes rv
      JOIN visitantes v ON rv.id_visitante = v.id
      WHERE rv.registro_id = $1
      ORDER BY rv.id
    `;

    const result = await pool.query(query, [registroId]);
    return result.rows;
  } catch (error) {
    console.error('Error al obtener visitantes del registro:', error);
    throw error;
  }
}

// Crear un registro a partir de un código de persona (empleado o alumno)
async function crearRegistroDesdeCodigoPersona({
  datosPersona,
  tipoPersona,
  vehiculoId,
  visitanteId,
  guardiaId,
  tagType,
  nTarjeta
}) {
  return withTransaction(async (client) => {
    let motivo, idPersonaAVisitar = null;

    // Determinar los valores según el tipo de persona
    if (tipoPersona === 'empleado') {
      motivo = 'Recojer o dejar a empleado';
      idPersonaAVisitar = datosPersona.usuario.id; // Guardar ID del empleado
    } else if (tipoPersona === 'alumno') {
      motivo = `Recoger alumno ${datosPersona.alumno.nombre} con matrícula ${datosPersona.alumno.matricula}`;
    }

    // Insertar registro principal
    const result = await client.query(
      `INSERT INTO registro (
         id_guardia_caseta,
         hora_entrada_caseta,
         n_visitantes,
         estatus,
         tipo_r,
         motivo,
         id_persona_a_visitar
       ) VALUES ($1, NOW(), $2, 'iniciado', $3, $4, $5)
       RETURNING id`,
      [
        guardiaId,
        1, // Un solo visitante
        'proveedor', // Tipo de registro
        motivo,
        idPersonaAVisitar // Puede ser null para alumnos
      ]
    );

    const registroId = result.rows[0].id;
    const codeRegistro = generateRegistrationCode(registroId);

    await client.query(
      `UPDATE registro SET code_registro = $1 WHERE id = $2`,
      [codeRegistro, registroId]
    );

    // Insertar conductor/visitante
    const codigoConductor = generateDriverTag(codeRegistro);

    await client.query(
      `INSERT INTO registro_visitantes (
         registro_id,
         id_visitante,
         codigo,
         tag_type,
         n_tarjeta,
         estatus,
         hora_entrada_caseta
       ) VALUES ($1, $2, $3, $4, $5, 'en caseta', NOW())`,
      [registroId, visitanteId, codigoConductor, tagType, nTarjeta]
    );

    // Insertar el vehículo en la tabla de asociación
    await client.query(`
      INSERT INTO registro_vehiculos (
        registro_id,
        vehiculo_id,
        hora_entrada
      ) VALUES ($1, $2, NOW())
    `, [registroId, vehiculoId]);

    return {
      registro_id: registroId,
      code_registro: codeRegistro,
      codigo_conductor: codigoConductor
    };
  });
}

/**
 * Obtiene todos los visitantes que salieron del edificio hace más de X minutos pero no han salido por caseta
 * @param {number} minutos - Tiempo en minutos para considerar como demora
 * @returns {Promise<Array>} - Arreglo con los registros de visitantes demorados
 */
async function obtenerVisitantesDemoradosSinSalirCaseta(minutos = 10) {
  return withTransaction(async (client) => {
    // Consulta para obtener visitantes que salieron del edificio hace más de X minutos pero no han salido por caseta
    const query = `
      SELECT 
        r.id AS registro_id,
        rv.id AS registro_id_visitante,
        r.code_registro,
        r.edificio,
        v.nombre AS nombre_visitante,
        rv.hora_salida_edificio,
        COALESCE(rv.contador_alertas, 0) AS contador_alertas,
        EXTRACT(EPOCH FROM (NOW() - rv.hora_salida_edificio))/60 AS minutos_desde_salida
      FROM 
        registro_visitantes rv
      JOIN 
        registro r ON rv.registro_id = r.id
      JOIN 
        visitantes v ON rv.id_visitante = v.id
      LEFT JOIN 
        users u ON r.id_persona_a_visitar = u.id
      WHERE 
        rv.hora_salida_edificio IS NOT NULL
        AND rv.hora_salida_caseta IS NULL
        AND rv.estatus = 'salio del edificio'
        AND EXTRACT(EPOCH FROM (NOW() - rv.hora_salida_edificio))/60 > $1
      ORDER BY 
        rv.hora_salida_edificio ASC
    `;

    const result = await client.query(query, [minutos]);

    // Agrupar los resultados por registro para facilitar el procesamiento, pero mandando a los visitantes y los minutos de demora en n array
    const registrosMap = new Map();

    for (const row of result.rows) {
      const registroId = row.registro_id;

      if (!registrosMap.has(registroId)) {
        registrosMap.set(registroId, {
          registro_id: registroId,
          code_registro: row.code_registro,
          edificio: row.edificio || 'No especificado',
          visitantes: []
        });
      }

      registrosMap.get(registroId).visitantes.push({
        id_visitante: row.registro_id_visitante,
        nombre: row.nombre_visitante,
        minutos_desde_salida: Math.floor(row.minutos_desde_salida),
        contador_alertas: row.contador_alertas || 0,
        destino: row.destino || 'edificio' // Por defecto 'edificio' si no hay destino especificado
      });
    }

    return Array.from(registrosMap.values());
  });
}

/**
 * Incrementa el contador de alertas para los visitantes demorados
 * @param {number[]} registroIds - IDs de los registros a incrementar el contador
 * @returns {Promise<boolean>} - True si se actualizaron correctamente
 */
async function incrementarContadorAlertas(registroIds) {
  if (!registroIds || registroIds.length === 0) {
    return false;
  }

  return withTransaction(async (client) => {
    try {
      for (const registroId of registroIds) {
        await client.query('BEGIN');

        const contadorActual = await client.query(
          `SELECT contador_alertas FROM registro_visitantes WHERE id = $1 FOR UPDATE`,
          [registroId]
        );

        const contador = (contadorActual.rows[0].contador_alertas || 0) + 1;

        const result = await client.query(`
          UPDATE registro_visitantes
          SET contador_alertas = $1
          WHERE id = $2
          RETURNING id, contador_alertas
        `, [contador, registroId]);

        await client.query('COMMIT');
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error al incrementar contador de alertas:', error);
      return false;
    }

  });
}

/**
 * Marca los visitantes de un registro como alertados para evitar enviar múltiples alertas
 * Esta función es un alias de incrementarContadorAlertas para mantener compatibilidad
 * @param {number[]} registroIds - IDs de los registros a marcar como alertados
 * @returns {Promise<boolean>} - True si se actualizaron correctamente
 */
async function marcarVisitantesComoAlertados(registroIds) {
  return incrementarContadorAlertas(registroIds);
}

module.exports = {
  crearRegistroYConductor,
  agregarVisitantesEdificio,
  crearRegistroPeatonal,
  buscarRegistroPorCodigo,
  salidaEdificio,
  salidaCaseta,
  registrarSalidaCasetaParcial,
  obtenerListadoRegistrosDataTable,
  obtenerDetalleRegistro,
  asociarVehiculoARegistro,
  nombreVisitante,
  actualizarVisitanteEvento,
  cargarVisitantes,
  obtenerVisitantesRegistro,
  crearRegistroDesdeCodigoPersona,
  obtenerVisitantesDemoradosSinSalirCaseta,
  incrementarContadorAlertas,
  marcarVisitantesComoAlertados
};
