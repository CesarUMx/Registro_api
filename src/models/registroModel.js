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
  nVisitantes,
  idGuardiaCaseta,
  tagType,
  nTarjeta,
  idPreregistro,
  numMarbete,
  motivo
}) {
  
  return withTransaction(async (client) => {
    // Determinar tipo de registro
    let tipo_r = 'completo';
    if (['proveedor', 'taxi o uber'].includes(tipoVisitanteConductor)) {
      tipo_r = 'proveedor';
    }

    // Insertar registro principal
    const result = await client.query(
      `INSERT INTO registro (
         id_preregistro,
         id_guardia_caseta,
         hora_entrada_caseta,
         n_visitantes,
         estatus,
         tipo_r,
         motivo
       ) VALUES ($1, $2, NOW(), $3, 'iniciado', $4, $5)
       RETURNING id`,
      [idPreregistro, idGuardiaCaseta, nVisitantes, tipo_r, motivo]
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

    // ⚠️ Ya NO validamos estatus global del registro
    // Solo verificamos número de visitantes que ya ingresaron
    const { rows: actuales } = await client.query(
      `SELECT COUNT(*)::int as total FROM registro_visitantes WHERE registro_id = $1 AND hora_entrada_edificio IS NOT NULL`,
      [registroId]
    );
    const totalActual = actuales[0].total;

    const conductorRes = await client.query(
      `SELECT id_visitante FROM registro_visitantes
         WHERE registro_id = $1 AND codigo LIKE '%-CND'`,
      [registroId]
    );
    const idConductor = conductorRes.rows[0]?.id_visitante;

    const totalPrevisto = totalActual + visitantes.length;

    if (totalPrevisto > registro.n_visitantes) {
      throw Object.assign(new Error(`Se excede el número de personas que pueden ingresar al edificio. Ya hay ${totalActual} y se intentan agregar ${visitantes.length}, el conductor ya se cuenta`), {
        status: 400,
        code: 'LIMIT_EXCEEDED'
      });
    }

    let codigos = [];

    for (let i = 0; i < visitantes.length; i++) {
      const v = visitantes[i];

      if (v.id_visitante === idConductor) {
        await client.query(
          `UPDATE registro_visitantes
             SET hora_entrada_edificio = NOW(), estatus = 'en edificio'
             WHERE registro_id = $1 AND id_visitante = $2`,
          [registroId, idConductor]
        );
        continue;
      }

      if (v.tag_type === 'tarjeta' && v.n_tarjeta) {
        await validateTarjetaDisponible(v.n_tarjeta, client);
      }

      const codigo = generateVisitorTag(registro.code_registro, i + 1);
      codigos.push({ id_visitante: v.id_visitante, codigo });

      await client.query(
        `INSERT INTO registro_visitantes (
            registro_id, id_visitante, codigo, tag_type, n_tarjeta,
            estatus, hora_entrada_edificio
          ) VALUES ($1, $2, $3, $4, $5, 'en edificio', NOW())`,
        [registroId, v.id_visitante, codigo, v.tag_type, v.n_tarjeta || null]
      );
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

async function crearRegistroPeatonal({ visitantes, edificio, motivo, idPersonaVisitar = null, idGuardiaEntrada }) {
  return withTransaction(async (client) => {
    // 1. Crear registro principal con estatus 'iniciado'
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
         NOW(), $1, $2, $3, $4, 'iniciado', $5, 'peatonal'
       )
       RETURNING id`,
      [idGuardiaEntrada, edificio, motivo, idPersonaVisitar, visitantes.length]
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

      await client.query(
        `INSERT INTO registro_visitantes (
           registro_id,
           id_visitante,
           codigo,
           tag_type,
           n_tarjeta,
           estatus,
           hora_entrada_edificio
         ) VALUES ($1, $2, $3, $4, $5, 'en edificio', NOW())`,
        [registroId, v.id_visitante, codigo, v.tag_type, v.n_tarjeta || null]
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
    visitantes
  };
}

async function salidaEdificio(registroId, visitantes, notas = '', userId, salida_vehiculo = false, completo = false) {
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

      // 2️⃣ Si no espera vehículo, ya terminó su proceso → marcar como completo
      if ((!salida_vehiculo && registro.tipo_r === 'peatonal') || completo) {
        await client.query(`
          UPDATE registro_visitantes
          SET estatus = 'completo'
          WHERE registro_id = $1 AND id_visitante = $2
        `, [registroId, visitanteId]);
      }
    }

    // 3️⃣ Agregar nota al registro
    if (notas && notas.trim() !== '') {
      await client.query(`
        UPDATE registro
        SET notas = CONCAT(COALESCE(notas, ''), ' | Notas edificio: ', $1::text),
            id_guardia_edificio_salida = $2
        WHERE id = $3
      `, [notas, userId, registroId]);
    }

    // 4️⃣ Intentar cerrar el registro si ya salieron todos del edificio y NO esperan vehículo
    let cerrado = false;
    if ((!salida_vehiculo && registro.tipo_r === 'peatonal') || completo) {
      cerrado = await actualizarSalida(visitantes.length, registroId, client, "edificio");
    }

    return {
      ok: true,
      message: cerrado
        ? 'Registro finalizado correctamente'
        : `Salida registrada para ${visitantes.length} visitante(s)`
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

async function registrarSalidaCasetaParcial(registroId, visitanteIds = [], vehiculoId, notas, guardiaId) {
  return withTransaction(async (client) => {
    if (!Array.isArray(visitanteIds) || visitanteIds.length === 0) {
      throw Object.assign(new Error('Debes enviar al menos un visitante'), {
        status: 400,
        code: 'SIN_VISITANTES'
      });
    }

    if (!vehiculoId) {
      throw Object.assign(new Error('Debes indicar el ID del vehículo que sale'), {
        status: 400,
        code: 'VEHICULO_FALTANTE'
      });
    }

    // 1️⃣ Registrar salida de visitantes
    for (const id_visitante of visitanteIds) {
      await actualizarVisitanteEvento({
        registroId,
        visitanteId: id_visitante,
        evento: 'salida_caseta'
      });
    }

    // 2️⃣ Registrar salida del vehículo
    await client.query(`
      UPDATE registro_vehiculos
      SET hora_salida = NOW()
      WHERE registro_id = $1 AND vehiculo_id = $2
    `, [registroId, vehiculoId]);

    // 3️⃣ Agregar nota (si viene)
    if (notas && notas.trim() !== '') {
      await client.query(`
        UPDATE registro
        SET notas = CONCAT(COALESCE(notas, ''), ' | Nota salida parcial: ', $1::text), 
            id_guardia_caseta_salida = $3,
            hora_salida_caseta = NOW()
        WHERE id = $2
      `, [notas.trim(), registroId, guardiaId]);
    }

    // 4️⃣ Verificar si ya todos salieron
    const cerrado = await actualizarSalida(visitanteIds.length, registroId, client, "caseta");

    return {
      ok: true,
      cerrado,
      message: cerrado
        ? 'Registro finalizado: todos salieron por caseta'
        : 'Salida parcial registrada (visitantes + vehículo)'
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
  nombreVisitante,
  registrarSalidaCasetaParcial,
};
