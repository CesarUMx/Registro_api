const pool = require('../config/db');
const { withTransaction } = require('../utils/controllerHelpers');
const { generatePreregistroCode, generateVisitorTag } = require('../utils/codeGenerator');

/**
 * Crear un nuevo preregistro
 */
async function crearPreregistro({
  admin_id,
  scheduled_entry_time,
  scheduled_exit_time,
  reason,
  visitantes = [],
  vehiculos = [],
  marbetes = [], // Array de números de marbete para cada vehículo
  token_unico = null,
  estado_token = null
}) {
  return withTransaction(async (client) => {
    try {
      // Crear el preregistro principal
      const preregistroQuery = `
        INSERT INTO preregistros (admin_id, scheduled_entry_time, scheduled_exit_time, reason, status, token_unico, estado_token)
        VALUES ($1, $2, $3, $4, 'pendiente', $5, $6)
        RETURNING *
      `;
      
      const preregistroResult = await client.query(preregistroQuery, [
        admin_id,
        scheduled_entry_time,
        scheduled_exit_time,
        reason,
        token_unico,
        estado_token
      ]);
      
      const preregistro = preregistroResult.rows[0];
      
      // Generar y actualizar el código del preregistro
      const codigoPreregistro = generatePreregistroCode(preregistro.id);
      await client.query(
        'UPDATE preregistros SET codigo = $1 WHERE id = $2',
        [codigoPreregistro, preregistro.id]
      );
      
      // Actualizar el objeto preregistro con el código generado
      preregistro.codigo = codigoPreregistro;
      
      // Asociar visitantes si se proporcionaron
      if (visitantes && visitantes.length > 0) {
        for (let i = 0; i < visitantes.length; i++) {
          const visitante_id = visitantes[i];
          const codigoVisitante = generateVisitorTag(codigoPreregistro, i + 1); // Usa el código del preregistro como base
          
          await client.query(
            'INSERT INTO preregistro_visitantes (preregistro_id, visitante_id, codigo_visitante) VALUES ($1, $2, $3)',
            [preregistro.id, visitante_id, codigoVisitante]
          );
        }
      }
      
      // Asociar vehículos si se proporcionaron
      if (vehiculos && vehiculos.length > 0) {
        for (let i = 0; i < vehiculos.length; i++) {
          const vehiculo_id = vehiculos[i];
          const numeroMarbete = marbetes && marbetes[i] ? marbetes[i] : null;
          
          await client.query(
            'INSERT INTO preregistro_vehiculos (preregistro_id, vehiculo_id, numero_marbete) VALUES ($1, $2, $3)',
            [preregistro.id, vehiculo_id, numeroMarbete]
          );
        }
      }
      
      return {
        success: true,
        preregistro,
        message: 'Preregistro creado exitosamente'
      };
      
    } catch (error) {
      console.error('Error al crear preregistro:', {
        message: error.message,
        code: error.code,
        detail: error.detail,
        stack: error.stack,
        params: { admin_id, scheduled_entry_time, scheduled_exit_time, reason }
      });
      
      // Crear error más específico según el tipo
      if (error.code === '23503') { // Foreign key violation
        const customError = new Error('Referencia inválida: admin_id, visitante_id o vehiculo_id no existe');
        customError.status = 400;
        customError.code = 'INVALID_REFERENCE';
        throw customError;
      }
      
      if (error.code === '23505') { // Unique violation
        const customError = new Error('Ya existe un preregistro con estos datos');
        customError.status = 409;
        customError.code = 'DUPLICATE_PREREGISTRO';
        throw customError;
      }
      
      // Error genérico de base de datos
      const customError = new Error('Error interno al crear el preregistro');
      customError.status = 500;
      customError.code = 'DATABASE_ERROR';
      customError.originalError = error;
      throw customError;
    }
  });
}

/**
 * Obtener todos los preregistros con paginación
 */
async function obtenerPreregistros({
  start = 0,
  length = 10,
  search = '',
  status = '',
  admin_id = null // Nuevo parámetro para filtrar por admin
}) {
  try {
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;
    
    // Filtro por admin_id (para usuarios admin que solo deben ver sus preregistros)
    if (admin_id) {
      whereClause += ` AND p.admin_id = $${paramIndex}`;
      params.push(admin_id);
      paramIndex++;
    }
    
    // Filtro por búsqueda de código
    if (search && search.trim()) {
      whereClause += ` AND p.codigo ILIKE $${paramIndex}`;
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }
    
    // Filtro por status
    if (status && status.trim()) {
      whereClause += ` AND p.status = $${paramIndex}`;
      params.push(status.trim());
      paramIndex++;
    }
    
    // Consulta principal con JOIN para obtener información del admin
    const query = `
      SELECT 
        p.*,
        u.name as admin_name,
        u.username as admin_username,
        COUNT(*) OVER() as total_count
      FROM preregistros p
      LEFT JOIN users u ON p.admin_id = u.id
      ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(length, start);
    
    const result = await pool.query(query, params);
    
    // Obtener visitantes y vehículos asociados para cada preregistro
    for (let preregistro of result.rows) {
      // Obtener visitantes asociados con sus códigos
      const visitantesQuery = `
        SELECT v.*, pv.codigo_visitante 
        FROM visitantes v
        JOIN preregistro_visitantes pv ON v.id = pv.visitante_id
        WHERE pv.preregistro_id = $1
      `;
      const visitantesResult = await pool.query(visitantesQuery, [preregistro.id]);
      preregistro.visitantes = visitantesResult.rows;
      
      // Obtener vehículos asociados con sus números de marbete
      const vehiculosQuery = `
        SELECT vh.*, pv.numero_marbete 
        FROM vehiculos vh
        JOIN preregistro_vehiculos pv ON vh.id = pv.vehiculo_id
        WHERE pv.preregistro_id = $1
      `;
      const vehiculosResult = await pool.query(vehiculosQuery, [preregistro.id]);
      preregistro.vehiculos = vehiculosResult.rows;
    }
    
    const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0;
    
    return {
      data: result.rows,
      recordsTotal: totalCount,
      recordsFiltered: totalCount
    };
    
  } catch (error) {
    console.error('Error al obtener preregistros:', {
      message: error.message,
      code: error.code,
      params: { start, length, search, status }
    });
    
    const customError = new Error('Error al consultar preregistros');
    customError.status = 500;
    customError.code = 'QUERY_ERROR';
    customError.originalError = error;
    throw customError;
  }
}

/**
 * Obtener preregistro por ID
 */
async function obtenerPreregistroPorId(id) {
  try {
    const query = `
      SELECT 
        p.*,
        u.name as admin_name,
        u.username as admin_username
      FROM preregistros p
      LEFT JOIN users u ON p.admin_id = u.id
      WHERE p.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const preregistro = result.rows[0];
    
    // Obtener visitantes asociados con sus códigos
    const visitantesQuery = `
      SELECT v.*, pv.codigo_visitante 
      FROM visitantes v
      JOIN preregistro_visitantes pv ON v.id = pv.visitante_id
      WHERE pv.preregistro_id = $1
    `;
    const visitantesResult = await pool.query(visitantesQuery, [id]);
    preregistro.visitantes = visitantesResult.rows;
    
    // Obtener vehículos asociados con sus números de marbete y etiquetas
    const vehiculosQuery = `
      SELECT vh.*, pv.numero_marbete, pv.etiqueta as codigo_vehiculo
      FROM vehiculos vh
      JOIN preregistro_vehiculos pv ON vh.id = pv.vehiculo_id
      WHERE pv.preregistro_id = $1
    `;
    const vehiculosResult = await pool.query(vehiculosQuery, [id]);
    preregistro.vehiculos = vehiculosResult.rows;
    
    return preregistro;
    
  } catch (error) {
    console.error('Error al obtener preregistro por ID:', {
      message: error.message,
      code: error.code,
      preregistroId: id
    });
    
    const customError = new Error('Error al consultar el preregistro');
    customError.status = 500;
    customError.code = 'QUERY_ERROR';
    customError.originalError = error;
    throw customError;
  }
}

/**
 * Actualizar estado de preregistro
 */
async function actualizarEstadoPreregistro(id, status, admin_id) {
  return withTransaction(async (client) => {
    try {
      // Actualizar el preregistro
      const updateQuery = `
        UPDATE preregistros 
        SET status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      
      const result = await client.query(updateQuery, [status, id]);
      
      if (result.rows.length === 0) {
        throw new Error('Preregistro no encontrado');
      }
      
      return result.rows[0];
      
    } catch (error) {
      console.error('Error al actualizar estado del preregistro:', error);
      throw error;
    }
  });
}

/**
 * Iniciar preregistro con datos del conductor y fotos
 */
async function iniciarPreregistro(id, datos) {
  return withTransaction(async (client) => {
    try {
      // 1. Actualizar el estado del preregistro a 'activo'
      const updatePreregistroQuery = `
        UPDATE preregistros 
        SET status = 'activo', updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;
      
      const preregistroResult = await client.query(updatePreregistroQuery, [id]);
      
      if (preregistroResult.rows.length === 0) {
        throw new Error('Preregistro no encontrado');
      }

      // 2. Actualizar las fotos del visitante seleccionado (solo si se proporcionan)
      if (datos.visitante_id && (datos.foto_persona || datos.foto_ine)) {
        const camposVisitante = [];
        const valoresVisitante = [];
        let contadorV = 1;

        if (datos.foto_persona) {
          camposVisitante.push(`foto_persona = $${contadorV}`);
          valoresVisitante.push(datos.foto_persona);
          contadorV++;
        }

        if (datos.foto_ine) {
          camposVisitante.push(`foto_ine = $${contadorV}`);
          valoresVisitante.push(datos.foto_ine);
          contadorV++;
        }

        if (camposVisitante.length > 0) {
          valoresVisitante.push(datos.visitante_id);
          
          const updateVisitanteQuery = `
            UPDATE preregistro_visitantes 
            SET ${camposVisitante.join(', ')}
            WHERE id = $${contadorV}
          `;
          
          await client.query(updateVisitanteQuery, valoresVisitante);
        }
      }

      // 3. Actualizar la foto de placa del vehículo (solo si se proporciona)
      if (datos.vehiculo_id && datos.foto_placa) {
        const updateVehiculoQuery = `
          UPDATE preregistro_vehiculos 
          SET foto_placa = $1
          WHERE id = $2
        `;
        
        await client.query(updateVehiculoQuery, [datos.foto_placa, datos.vehiculo_id]);
      }

      // 4. Registrar evento en bitácora: entrada_caseta
      if (datos.guardia_id) {
        const insertBitacoraQuery = `
          INSERT INTO bitacora_preregistros (
            preregistro_id, 
            tipo_evento, 
            visitante_id, 
            vehiculo_id, 
            guardia_id, 
            notas
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `;
        
        await client.query(insertBitacoraQuery, [
          id,
          'entrada_caseta',
          datos.visitante_id || null,
          datos.vehiculo_id || null,
          datos.guardia_id,
          'Preregistro iniciado - Entrada a caseta autorizada'
        ]);
      }
      
      return preregistroResult.rows[0];
      
    } catch (error) {
      console.error('Error al iniciar preregistro:', error);
      throw error;
    }
  });
}

/**
 * Obtener preregistro por token único
 */
async function obtenerPreregistroPorToken(token) {
  return withTransaction(async (client) => {
    try {
      const query = `
        SELECT 
          p.id,
          p.codigo,
          p.admin_id,
          p.scheduled_entry_time,
          p.scheduled_exit_time,
          p.reason,
          p.status,
          p.token_unico,
          p.estado_token,
          p.created_at,
          p.updated_at,
          u.name as admin_name
        FROM preregistros p
        LEFT JOIN users u ON u.id = p.admin_id
        WHERE p.token_unico = $1
      `;
      
      const result = await client.query(query, [token]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return result.rows[0];
      
    } catch (error) {
      console.error('Error en obtenerPreregistroPorToken:', error);
      throw error;
    }
  });
}

/**
 * Actualizar estado del token de preregistro
 */
async function actualizarEstadoToken(token, nuevoEstado) {
  return withTransaction(async (client) => {
    try {
      const query = `
        UPDATE preregistros 
        SET estado_token = $1, updated_at = CURRENT_TIMESTAMP
        WHERE token_unico = $2
        RETURNING *
      `;
      
      const result = await client.query(query, [nuevoEstado, token]);
      
      if (result.rows.length === 0) {
        const error = new Error('Token no encontrado');
        error.status = 404;
        throw error;
      }
      
      return result.rows[0];
      
    } catch (error) {
      console.error('Error en actualizarEstadoToken:', error);
      throw error;
    }
  });
}

/**
 * Completar preregistro asociando visitantes y vehículos existentes
 * @param {Object} params - Parámetros para completar el preregistro
 * @param {number} params.preregistro_id - ID del preregistro
 * @param {string} params.codigo_preregistro - Código del preregistro para generar códigos de visitante
 * @param {Array<number>} params.visitantes - Array de IDs de visitantes
 * @param {Array<number>} params.vehiculos - Array de IDs de vehículos
 * @param {string} params.token - Token único para marcar como usado
 * @returns {Promise<Object>} Resultado de la operación
 */
async function completarPreregistroConVisitantesYVehiculos({ 
  preregistro_id, 
  codigo_preregistro, 
  visitantes = [], 
  vehiculos = [],
  token
}) {
  return withTransaction(async (client) => {
    try {
      // Insertar visitantes en preregistro_visitantes
      for (let i = 0; i < visitantes.length; i++) {
        const visitanteId = visitantes[i];
        const codigoVisitante = generateVisitorTag(codigo_preregistro, i + 1);
        await client.query(
          `INSERT INTO preregistro_visitantes (preregistro_id, visitante_id, codigo_visitante)
           VALUES ($1, $2, $3)`,
          [preregistro_id, visitanteId, codigoVisitante]
        );
      }
      
      // Insertar vehículos en preregistro_vehiculos si existen
      // El numero_marbete se deja en null - lo asigna el guardia después
      for (let i = 0; i < vehiculos.length; i++) {
        const vehiculoId = vehiculos[i];
        await client.query(
          `INSERT INTO preregistro_vehiculos (preregistro_id, vehiculo_id, numero_marbete)
           VALUES ($1, $2, $3)`,
          [preregistro_id, vehiculoId, null]
        );
      }
      
      // Marcar el token como usado para evitar reutilización
      await actualizarEstadoToken(token, 'usado');
      
      return {
        preregistro_id,
        visitantes_asociados: visitantes.length,
        vehiculos_asociados: vehiculos.length,
        mensaje: 'Preregistro completado exitosamente'
      };
      
    } catch (error) {
      console.error('Error en completarPreregistroConVisitantesYVehiculos:', error);
      throw error;
    }
  });
}

/**
 * Verificar qué fotos ya existen para un visitante y vehículo específicos
 * usando las relaciones de preregistro
 */
async function verificarFotosExistentes(preregistroVisitanteId, preregistroVehiculoId = null) {
  return withTransaction(async (client) => {
    try {
      const resultado = {
        visitante: null,
        vehiculo: null,
        necesita_foto_persona: false,
        necesita_foto_ine: false,
        necesita_foto_placa: false
      };

      // Verificar fotos del visitante usando JOIN con tabla visitantes
      if (preregistroVisitanteId) {
        const visitanteQuery = `
          SELECT v.foto_persona, v.foto_ine, v.nombre, v.id as visitante_id
          FROM preregistro_visitantes pv
          JOIN visitantes v ON pv.visitante_id = v.id
          WHERE pv.id = $1
        `;
        const visitanteResult = await client.query(visitanteQuery, [preregistroVisitanteId]);
        
        if (visitanteResult.rows.length === 0) {
          throw new Error('Visitante de preregistro no encontrado');
        }

        resultado.visitante = visitanteResult.rows[0];
        resultado.necesita_foto_persona = !resultado.visitante.foto_persona;
        resultado.necesita_foto_ine = !resultado.visitante.foto_ine;
      }

      // Verificar fotos del vehículo usando JOIN con tabla vehiculos
      if (preregistroVehiculoId) {
        const vehiculoQuery = `
          SELECT veh.foto_placa, veh.placa, veh.id as vehiculo_id
          FROM preregistro_vehiculos pv
          JOIN vehiculos veh ON pv.vehiculo_id = veh.id
          WHERE pv.id = $1
        `;
        const vehiculoResult = await client.query(vehiculoQuery, [preregistroVehiculoId]);
        
        if (vehiculoResult.rows.length === 0) {
          throw new Error('Vehículo de preregistro no encontrado');
        }
        
        resultado.vehiculo = vehiculoResult.rows[0];
        resultado.necesita_foto_placa = !resultado.vehiculo.foto_placa;
      }
      
      return resultado;
      
    } catch (error) {
      console.error('Error al verificar fotos existentes:', error);
      throw error;
    }
  });
}

/**
 * Verificar qué fotos faltan para iniciar un preregistro
 */
async function verificarFotosFaltantes(preregistroId) {
  return withTransaction(async (client) => {
    try {
      // Obtener datos del preregistro con visitantes y vehículos usando JOINs correctos
      const preregistroQuery = `
        SELECT 
          p.*,
          json_agg(
            DISTINCT jsonb_build_object(
              'id', pv.id,
              'visitante_id', v.id,
              'nombre', v.nombre,
              'foto_persona', v.foto_persona,
              'foto_ine', v.foto_ine,
              'fotos_faltantes', ARRAY[
                CASE WHEN v.foto_persona IS NULL OR v.foto_persona = '' THEN 'foto_persona' END,
                CASE WHEN v.foto_ine IS NULL OR v.foto_ine = '' THEN 'foto_ine' END
              ]::text[]
            )
          ) FILTER (WHERE pv.id IS NOT NULL) as visitantes,
          json_agg(
            DISTINCT jsonb_build_object(
              'id', pveh.id,
              'vehiculo_id', veh.id,
              'placa', veh.placa,
              'foto_placa', veh.foto_placa,
              'fotos_faltantes', ARRAY[
                CASE WHEN veh.foto_placa IS NULL OR veh.foto_placa = '' THEN 'foto_placa' END
              ]::text[]
            )
          ) FILTER (WHERE pveh.id IS NOT NULL) as vehiculos
        FROM preregistros p
        LEFT JOIN preregistro_visitantes pv ON p.id = pv.preregistro_id
        LEFT JOIN visitantes v ON pv.visitante_id = v.id
        LEFT JOIN preregistro_vehiculos pveh ON p.id = pveh.preregistro_id
        LEFT JOIN vehiculos veh ON pveh.vehiculo_id = veh.id
        WHERE p.id = $1
        GROUP BY p.id
      `;
      
      const result = await client.query(preregistroQuery, [preregistroId]);
      
      if (result.rows.length === 0) {
        throw new Error('Preregistro no encontrado');
      }
      
      const preregistro = result.rows[0];
      const visitantes = preregistro.visitantes || [];
      const vehiculos = preregistro.vehiculos || [];
      
      // Validar que haya al menos un visitante
      if (visitantes.length === 0) {
        return {
          preregistro,
          fotos_faltantes: {
            visitantes: [],
            vehiculos: [],
            requiere_fotos: false
          },
          error: 'NO_VISITANTES',
          message: 'No hay visitantes registrados en este preregistro'
        };
      }
      
      // Verificar fotos faltantes
      const fotosFaltantes = {
        visitantes: [],
        vehiculos: [],
        requiere_fotos: false
      };
      
      // Verificar visitantes - solo requerir foto_ine, foto_persona no es obligatoria
      visitantes.forEach(visitante => {
        const faltantes = [];
        // No requerimos foto_persona para iniciar preregistro
        // if (!visitante.foto_persona) faltantes.push('foto_persona');
        if (!visitante.foto_ine) faltantes.push('foto_ine');
        
        if (faltantes.length > 0) {
          fotosFaltantes.visitantes.push({
            id: visitante.id,
            nombre: visitante.nombre,
            fotos_faltantes: faltantes
          });
          fotosFaltantes.requiere_fotos = true;
        }
      });
      
      // Verificar vehículos
      vehiculos.forEach(vehiculo => {
        if (!vehiculo.foto_placa) {
          fotosFaltantes.vehiculos.push({
            id: vehiculo.id,
            placa: vehiculo.placa,
            fotos_faltantes: ['foto_placa']
          });
          fotosFaltantes.requiere_fotos = true;
        }
      });
      
      return {
        preregistro,
        fotos_faltantes: fotosFaltantes
      };
      
    } catch (error) {
      console.error('Error al verificar fotos faltantes:', error);
      throw error;
    }
  });
}

/**
 * Iniciar preregistro actualizando fotos en las tablas correctas
 */
async function iniciarPreregistroConFotos(preregistroId, visitanteId, vehiculoId, fotos, guardiaId) {
  return withTransaction(async (client) => {
    try {
      // 1. Obtener los IDs de las tablas de relación del preregistro
      const relacionesQuery = `
        SELECT 
          pv.id as preregistro_visitante_id,
          pveh.id as preregistro_vehiculo_id
        FROM preregistros p
        LEFT JOIN preregistro_visitantes pv ON p.id = pv.preregistro_id AND pv.visitante_id = $2
        LEFT JOIN preregistro_vehiculos pveh ON p.id = pveh.preregistro_id AND ($3::int IS NULL OR pveh.vehiculo_id = $3)
        WHERE p.id = $1
      `;
      
      const relacionesResult = await client.query(relacionesQuery, [preregistroId, visitanteId, vehiculoId]);
      
      if (relacionesResult.rows.length === 0) {
        throw new Error('No se encontraron las relaciones del preregistro');
      }
      
      const { preregistro_visitante_id, preregistro_vehiculo_id } = relacionesResult.rows[0];
      
      // 2. Verificar qué fotos ya existen
      const fotosExistentes = await verificarFotosExistentes(preregistro_visitante_id, preregistro_vehiculo_id);
      
      // 3. Actualizar fotos del visitante si es necesario
      if (fotos.fotoPersona || fotos.fotoIne) {
        const updateVisitanteFields = [];
        const updateVisitanteValues = [];
        let paramIndex = 1;
        
        if (fotos.fotoPersona && fotosExistentes.necesita_foto_persona) {
          updateVisitanteFields.push(`foto_persona = $${paramIndex++}`);
          updateVisitanteValues.push(fotos.fotoPersona);
        }
        
        if (fotos.fotoIne && fotosExistentes.necesita_foto_ine) {
          updateVisitanteFields.push(`foto_ine = $${paramIndex++}`);
          updateVisitanteValues.push(fotos.fotoIne);
        }
        
        if (updateVisitanteFields.length > 0) {
          const updateVisitanteQuery = `
            UPDATE visitantes 
            SET ${updateVisitanteFields.join(', ')}
            WHERE id = $${paramIndex}
          `;
          updateVisitanteValues.push(visitanteId);
          
          await client.query(updateVisitanteQuery, updateVisitanteValues);
        }
      }
      
      // 4. Actualizar foto del vehículo si es necesario
      if (vehiculoId && fotos.fotoPlaca && fotosExistentes.necesita_foto_placa) {
        const updateVehiculoQuery = `
          UPDATE vehiculos 
          SET foto_placa = $1
          WHERE id = $2
        `;
        
        await client.query(updateVehiculoQuery, [fotos.fotoPlaca, vehiculoId]);
      }
      
      // 5. Actualizar estado del preregistro a 'activo'
      const updatePreregistroQuery = `
        UPDATE preregistros 
        SET status = 'activo', updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;
      
      const preregistroResult = await client.query(updatePreregistroQuery, [preregistroId]);
      const preregistroActualizado = preregistroResult.rows[0];
      
      // 6. Registrar evento en bitácora
      const bitacoraQuery = `
        INSERT INTO bitacora_preregistros (preregistro_id, evento, visitante_id, vehiculo_id, guardia_id, created_at)
        VALUES ($1, 'entrada_caseta', $2, $3, $4, NOW())
      `;
      
      await client.query(bitacoraQuery, [preregistroId, visitanteId, vehiculoId, guardiaId]);
      
      return {
        preregistro: preregistroActualizado,
        fotos_existentes: fotosExistentes
      };
      
    } catch (error) {
      console.error('Error al iniciar preregistro con fotos:', error);
      throw error;
    }
  });
}

/**
 * Cargar fotos de visitante (foto_persona y/o foto_ine)
 */
async function cargarFotoVisitante(visitanteId, fotos) {
  return withTransaction(async (client) => {
    try {
      // Primero verificar si el visitante existe en la tabla visitantes
      const checkVisitanteQuery = 'SELECT * FROM visitantes WHERE id = $1';
      const checkVisitanteResult = await client.query(checkVisitanteQuery, [visitanteId]);
      
      // Si el visitante existe en la tabla visitantes, actualizar ahí
      if (checkVisitanteResult.rows.length > 0) {
        // Construir la consulta dinámicamente según las fotos proporcionadas
        const campos = [];
        const valores = [];
        let contador = 1;

        if (fotos.foto_persona) {
          campos.push(`foto_persona = $${contador}`);
          valores.push(fotos.foto_persona);
          contador++;
        }

        if (fotos.foto_ine) {
          campos.push(`foto_ine = $${contador}`);
          valores.push(fotos.foto_ine);
          contador++;
        }

        if (campos.length === 0) {
          throw new Error('No se proporcionaron fotos para actualizar');
        }

        // Agregar timestamp y visitante ID
        campos.push(`fecha_update = NOW()`);
        valores.push(visitanteId);

        const updateQuery = `
          UPDATE visitantes 
          SET ${campos.join(', ')}
          WHERE id = $${contador}
        `;

        const result = await client.query(updateQuery, valores);
        
        return {
          success: true,
          message: 'Fotos del visitante actualizadas correctamente',
          visitanteId,
          fotosActualizadas: Object.keys(fotos)
        };
      } else {
        // Si no existe en visitantes, buscar en preregistro_visitantes
        const checkPreregistroQuery = `
          SELECT pv.*, v.nombre 
          FROM preregistro_visitantes pv
          LEFT JOIN visitantes v ON pv.visitante_id = v.id
          WHERE pv.visitante_id = $1
        `;
        const checkPreregistroResult = await client.query(checkPreregistroQuery, [visitanteId]);
        
        if (checkPreregistroResult.rows.length === 0) {
          throw new Error(`No se encontró el visitante con ID: ${visitanteId} ni en visitantes ni en preregistro_visitantes`);
        }
        
        // Crear el visitante en la tabla visitantes primero
        const preregistroVisitante = checkPreregistroResult.rows[0];
        
        const insertVisitanteQuery = `
          INSERT INTO visitantes (nombre, foto_persona, foto_ine, fecha_create, fecha_update)
          VALUES ($1, $2, $3, NOW(), NOW())
          RETURNING id
        `;
        
        const insertResult = await client.query(insertVisitanteQuery, [
          preregistroVisitante.nombre || 'Visitante',
          fotos.foto_persona || null,
          fotos.foto_ine || null
        ]);
        
        const nuevoVisitanteId = insertResult.rows[0].id;
        
        // Actualizar la referencia en preregistro_visitantes
        const updatePreregistroQuery = `
          UPDATE preregistro_visitantes 
          SET visitante_id = $1
          WHERE visitante_id = $2
        `;
        
        await client.query(updatePreregistroQuery, [nuevoVisitanteId, visitanteId]);
        
        return {
          success: true,
          message: 'Visitante creado y fotos actualizadas correctamente',
          visitanteId: nuevoVisitanteId,
          fotosActualizadas: Object.keys(fotos)
        };
      }
    } catch (error) {
      console.error('❌ Error en cargarFotoVisitante:', error);
      throw error;
    }
  });
}

/**
 * Cargar foto de placa de vehículo
 */
async function cargarFotoVehiculo(vehiculoId, fotoPlaca) {
  return withTransaction(async (client) => {
    try {
      
      // Primero verificar si el vehículo existe en la tabla vehiculos
      const checkVehiculoQuery = 'SELECT * FROM vehiculos WHERE id = $1';
      const checkVehiculoResult = await client.query(checkVehiculoQuery, [vehiculoId]);
      
      // Si el vehículo existe en la tabla vehiculos, actualizar ahí
      if (checkVehiculoResult.rows.length > 0) {
        const updateQuery = `
          UPDATE vehiculos 
          SET foto_placa = $1
          WHERE id = $2
        `;

        const result = await client.query(updateQuery, [fotoPlaca, vehiculoId]);

        return {
          success: true,
          message: 'Foto del vehículo actualizada correctamente',
          vehiculoId,
          fotoActualizada: 'foto_placa'
        };
      } else {
        // Si no existe en vehiculos, buscar en preregistro_vehiculos
        const checkPreregistroQuery = `
          SELECT pv.*, v.placa 
          FROM preregistro_vehiculos pv
          LEFT JOIN vehiculos v ON pv.vehiculo_id = v.id
          WHERE pv.vehiculo_id = $1
        `;
        const checkPreregistroResult = await client.query(checkPreregistroQuery, [vehiculoId]);
        
        if (checkPreregistroResult.rows.length === 0) {
          throw new Error(`No se encontró el vehículo con ID: ${vehiculoId} ni en vehiculos ni en preregistro_vehiculos`);
        }
        
        // Crear el vehículo en la tabla vehiculos primero
        const preregistroVehiculo = checkPreregistroResult.rows[0];
        
        const insertVehiculoQuery = `
          INSERT INTO vehiculos (placa, foto_placa, fecha_create, fecha_update)
          VALUES ($1, $2, NOW(), NOW())
          RETURNING id
        `;
        
        const insertResult = await client.query(insertVehiculoQuery, [
          preregistroVehiculo.placa || 'SIN-PLACA',
          fotoPlaca
        ]);
        
        const nuevoVehiculoId = insertResult.rows[0].id;
        
        // Actualizar la referencia en preregistro_vehiculos
        const updatePreregistroQuery = `
          UPDATE preregistro_vehiculos 
          SET vehiculo_id = $1
          WHERE vehiculo_id = $2
        `;
        
        await client.query(updatePreregistroQuery, [nuevoVehiculoId, vehiculoId]);
        
        return {
          success: true,
          message: 'Vehículo creado y foto actualizada correctamente',
          vehiculoId: nuevoVehiculoId,
          fotoActualizada: 'foto_placa'
        };
      }
    } catch (error) {
      console.error('❌ Error en cargarFotoVehiculo:', error);
      throw error;
    }
  });
}

/**
 * Iniciar preregistro y registrar entrada_caseta para múltiples visitantes y vehículos
 * @param {number} preregistroId - ID del preregistro a iniciar
 * @param {Array<number>} visitantesIds - Array de IDs de visitantes para registrar entrada_caseta
 * @param {number} guardiaId - ID del guardia que inicia el preregistro
 * @returns {Promise<Object>} Resultado de la operación
 */
async function iniciarPreregistroMultiple(preregistroId, visitantesIds, guardiaId) {
  return withTransaction(async (client) => {
    try {
      // 1. Actualizar estado del preregistro a 'iniciado'
      const updatePreregistroQuery = `
        UPDATE preregistros 
        SET status = 'iniciado', updated_at = NOW() 
        WHERE id = $1 
        RETURNING *
      `;
      
      const preregistroResult = await client.query(updatePreregistroQuery, [preregistroId]);
      
      if (preregistroResult.rows.length === 0) {
        throw new Error(`No se encontró el preregistro con ID ${preregistroId}`);
      }
      
      const preregistro = preregistroResult.rows[0];
      const codigoPreregistro = preregistro.codigo;
      
      // 2. Registrar entrada_caseta en la bitácora para cada visitante y generar etiquetas
      const resultadosVisitantes = [];
      let visitanteCounter = 1; // Contador para generar etiquetas secuenciales
      
      for (const visitanteId of visitantesIds) {
        // Verificar que el visitante exista y esté asociado al preregistro
        const checkVisitanteQuery = `
          SELECT v.*, pv.etiqueta
          FROM visitantes v
          JOIN preregistro_visitantes pv ON v.id = pv.visitante_id
          WHERE pv.preregistro_id = $1 AND v.id = $2
        `;
        
        const visitanteResult = await client.query(checkVisitanteQuery, [preregistroId, visitanteId]);
        
        if (visitanteResult.rows.length === 0) {
          console.warn(`El visitante con ID ${visitanteId} no está asociado al preregistro ${preregistroId}`);
          continue; // Saltar este visitante y continuar con el siguiente
        }
        
        const visitante = visitanteResult.rows[0];
        
        // Generar etiqueta si no existe
        let etiqueta = visitante.etiqueta;
        if (!etiqueta) {
          // Importar la función generateVisitorTag
          const { generateVisitorTag } = require('../utils/codeGenerator');
          etiqueta = generateVisitorTag(codigoPreregistro, visitanteCounter);
          
          // Actualizar la etiqueta en la tabla preregistro_visitantes
          const updateEtiquetaQuery = `
            UPDATE preregistro_visitantes
            SET etiqueta = $1
            WHERE preregistro_id = $2 AND visitante_id = $3
            RETURNING *
          `;
          
          await client.query(updateEtiquetaQuery, [etiqueta, preregistroId, visitanteId]);
          visitanteCounter++;
        }
        
        // Registrar entrada_caseta en la bitácora para el visitante
        const bitacoraVisitanteQuery = `
          INSERT INTO bitacora_preregistros (
            preregistro_id, 
            visitante_id, 
            guardia_id, 
            tipo_evento, 
            timestamp
          )
          VALUES ($1, $2, $3, 'entrada_caseta', NOW())
          RETURNING *
        `;
        
        const bitacoraVisitanteResult = await client.query(bitacoraVisitanteQuery, [
          preregistroId,
          visitanteId,
          guardiaId
        ]);
        
        resultadosVisitantes.push({
          visitante_id: visitanteId,
          etiqueta: etiqueta,
          bitacora: bitacoraVisitanteResult.rows[0]
        });
      }
      
      // 3. Obtener todos los vehículos asociados al preregistro y registrar entrada_caseta para cada uno
      const vehiculosQuery = `
        SELECT v.*, pv.numero_marbete, pv.etiqueta
        FROM vehiculos v
        JOIN preregistro_vehiculos pv ON v.id = pv.vehiculo_id
        WHERE pv.preregistro_id = $1
      `;
      
      const vehiculosResult = await client.query(vehiculosQuery, [preregistroId]);
      const resultadosVehiculos = [];
      
      let vehiculoCounter = 1; // Contador para generar etiquetas secuenciales de vehículos
      
      for (const vehiculo of vehiculosResult.rows) {
        // Generar etiqueta para el vehículo si no existe
        let etiqueta = vehiculo.etiqueta;
        if (!etiqueta) {
          // Importar la función generateVisitorTag
          const { generateVisitorTag } = require('../utils/codeGenerator');
          // Usamos el mismo formato pero cambiamos V por A para indicar que es un vehículo (carro)
          etiqueta = generateVisitorTag(codigoPreregistro, vehiculoCounter).replace('-V', '-A');
          
          // Actualizar la etiqueta en la tabla preregistro_vehiculos
          const updateEtiquetaVehiculoQuery = `
            UPDATE preregistro_vehiculos
            SET etiqueta = $1
            WHERE preregistro_id = $2 AND vehiculo_id = $3
            RETURNING *
          `;
          
          await client.query(updateEtiquetaVehiculoQuery, [etiqueta, preregistroId, vehiculo.id]);
          vehiculoCounter++;
        }
        
        // Registrar entrada_caseta en la bitácora para el vehículo
        const bitacoraVehiculoQuery = `
          INSERT INTO bitacora_preregistros (
            preregistro_id, 
            vehiculo_id, 
            guardia_id, 
            tipo_evento, 
            timestamp
          )
          VALUES ($1, $2, $3, 'entrada_caseta', NOW())
          RETURNING *
        `;
        
        const bitacoraVehiculoResult = await client.query(bitacoraVehiculoQuery, [
          preregistroId,
          vehiculo.id,
          guardiaId
        ]);
        
        resultadosVehiculos.push({
          vehiculo_id: vehiculo.id,
          etiqueta: etiqueta,
          numero_marbete: vehiculo.numero_marbete,
          bitacora: bitacoraVehiculoResult.rows[0]
        });
      }
      
      return {
        preregistro: preregistroResult.rows[0],
        resultadosVisitantes,
        resultadosVehiculos
      };
    } catch (error) {
      console.error('Error al iniciar preregistro múltiple:', error);
      throw error;
    }
  });
}

/**
 * Obtener un visitante por su ID
 * @param {number} id - ID del visitante
 * @returns {Promise<Object>} - Datos del visitante
 */
async function getVisitanteById(id) {
  try {
    const query = `
      SELECT 
        pv.*,
        v.nombre,
        v.apellido,
        v.email,
        v.telefono,
        v.foto_ine,
        v.foto_persona,
        p.id AS preregistro_id,
        p.status AS preregistro_status
      FROM 
        preregistro_visitantes pv
      JOIN 
        visitantes v ON pv.visitante_id = v.id
      JOIN 
        preregistros p ON pv.preregistro_id = p.id
      WHERE 
        pv.visitante_id = $1
      ORDER BY 
        p.created_at DESC
      LIMIT 1
    `;
    
    const result = await pool.query(query, [id]);
    return result.rows[0];
  } catch (error) {
    console.error('Error al obtener visitante por ID:', error);
    throw error;
  }
}

/**
 * Obtener un vehículo por su ID
 * @param {number} id - ID del vehículo
 * @returns {Promise<Object>} - Datos del vehículo
 */
async function getVehiculoById(id) {
  try {
    const query = `
      SELECT 
        pv.*,
        v.placa,
        v.marca,
        v.modelo,
        v.color,
        v.foto_placa,
        p.id AS preregistro_id,
        p.status AS preregistro_status
      FROM 
        preregistro_vehiculos pv
      JOIN 
        vehiculos v ON pv.vehiculo_id = v.id
      JOIN 
        preregistros p ON pv.preregistro_id = p.id
      WHERE 
        pv.vehiculo_id = $1
      ORDER BY 
        p.created_at DESC
      LIMIT 1
    `;
    
    const result = await pool.query(query, [id]);
    return result.rows[0];
  } catch (error) {
    console.error('Error al obtener vehículo por ID:', error);
    throw error;
  }
}

/**
 * Actualizar el estatus de un preregistro
 * @param {number} preregistroId - ID del preregistro
 * @param {string} estatus - Nuevo estatus
 * @returns {Promise<Object>} - Preregistro actualizado
 */
async function updatePreregistroStatus(preregistroId, estatus) {
  try {
    const client = await pool.connect();
    try {
      const query = `
        UPDATE preregistros
        SET estatus = $1
        WHERE id = $2
        RETURNING *
      `;
      
      const result = await client.query(query, [estatus, preregistroId]);
      return result.rows[0];
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error al actualizar estatus del preregistro:', error);
    throw error;
  }
}

/**
 * Obtener preregistro por código
 * @param {string} codigo - Código del preregistro (ej: PRE29YAM)
 * @returns {Promise<Object>} - Datos del preregistro con sus visitantes y vehículos
 */
async function obtenerPreregistroPorCodigo(codigo) {
  try {
    // Obtener el preregistro por código
    const preregistroResult = await pool.query(
      `SELECT p.*, u.name as admin_nombre
       FROM preregistros p
       LEFT JOIN users u ON p.admin_id = u.id
       WHERE p.codigo = $1`,
      [codigo]
    );
    
    if (preregistroResult.rows.length === 0) {
      const error = new Error(`No se encontró el preregistro con código ${codigo}`);
      error.status = 404;
      throw error;
    }
    
    const preregistro = preregistroResult.rows[0];
    
    // Obtener visitantes asociados
    const visitantesResult = await pool.query(
      `SELECT v.*, pv.codigo_visitante, pv.id as preregistro_visitante_id
       FROM visitantes v
       JOIN preregistro_visitantes pv ON v.id = pv.visitante_id
       WHERE pv.preregistro_id = $1
       ORDER BY pv.id`,
      [preregistro.id]
    );
    
    // Obtener vehículos asociados
    const vehiculosResult = await pool.query(
      `SELECT v.*, pv.numero_marbete, pv.id as preregistro_vehiculo_id
       FROM vehiculos v
       JOIN preregistro_vehiculos pv ON v.id = pv.vehiculo_id
       WHERE pv.preregistro_id = $1
       ORDER BY pv.id`,
      [preregistro.id]
    );
    
    // Formatear el resultado
    return {
      ...preregistro,
      admin_nombre_completo: `${preregistro.admin_nombre || ''} ${preregistro.admin_apellido || ''}`.trim(),
      visitantes: visitantesResult.rows,
      vehiculos: vehiculosResult.rows
    };
    
  } catch (error) {
    console.error('Error al obtener preregistro por código:', error);
    throw error;
  }
}

/**
 * Obtener visitante específico de un preregistro por su número
 * @param {number} preregistroId - ID del preregistro
 * @param {string} numeroVisitante - Número del visitante (ej: V01)
 * @returns {Promise<Object>} - Datos del visitante
 */
async function obtenerVisitantePreregistro(preregistroId, numeroVisitante) {
  try {
    const result = await pool.query(
      `SELECT v.*, pv.codigo_visitante, pv.id as preregistro_visitante_id
       FROM visitantes v
       JOIN preregistro_visitantes pv ON v.id = pv.visitante_id
       WHERE pv.preregistro_id = $1 AND pv.codigo_visitante LIKE $2
       LIMIT 1`,
      [preregistroId, `%${numeroVisitante}`]
    );
    
    if (result.rows.length === 0) {
      const error = new Error(`No se encontró el visitante ${numeroVisitante} para el preregistro ${preregistroId}`);
      error.status = 404;
      throw error;
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error al obtener visitante de preregistro:', error);
    throw error;
  }
}

/**
 * Obtener vehículo específico de un preregistro por su número
 * @param {number} preregistroId - ID del preregistro
 * @param {string} numeroVehiculo - Número del vehículo (ej: A01)
 * @returns {Promise<Object>} - Datos del vehículo
 */
async function obtenerVehiculoPreregistro(preregistroId, numeroVehiculo) {
  try {
    const result = await pool.query(
      `SELECT v.*, pv.etiqueta, pv.id as preregistro_vehiculo_id
       FROM vehiculos v
       JOIN preregistro_vehiculos pv ON v.id = pv.vehiculo_id
       WHERE pv.preregistro_id = $1 AND pv.etiqueta LIKE $2
       LIMIT 1`,
      [preregistroId, `%${numeroVehiculo}`]
    );
    
    if (result.rows.length === 0) {
      const error = new Error(`No se encontró el vehículo ${numeroVehiculo} para el preregistro ${preregistroId}`);
      error.status = 404;
      throw error;
    }
    
    return result.rows[0];
  } catch (error) {
    console.error('Error al obtener vehículo de preregistro:', error);
    throw error;
  }
}

/**
 * Obtiene las etiquetas generadas para los visitantes de un preregistro
 * @param {number} preregistroId - ID del preregistro
 * @param {Array<number>} visitantesIds - Array con IDs de visitantes
 * @returns {Promise<Array>} - Array con información de etiquetas de visitantes
 */
async function obtenerEtiquetasVisitantes(preregistroId, visitantesIds) {
  return withTransaction(async (client) => {
    try {
      // Obtener el código del preregistro
      const preregistroQuery = `
        SELECT codigo FROM preregistros WHERE id = $1
      `;
      
      const preregistroResult = await client.query(preregistroQuery, [preregistroId]);
      
      if (preregistroResult.rows.length === 0) {
        throw new Error(`No se encontró el preregistro con ID ${preregistroId}`);
      }
      
      const codigoPreregistro = preregistroResult.rows[0].codigo;
      
      // Obtener información de los visitantes y sus etiquetas
      const visitantesQuery = `
        SELECT v.id as visitante_id, v.nombre, pv.etiqueta
        FROM visitantes v
        JOIN preregistro_visitantes pv ON v.id = pv.visitante_id
        WHERE pv.preregistro_id = $1 AND v.id = ANY($2)
      `;
      
      const visitantesResult = await client.query(visitantesQuery, [preregistroId, visitantesIds]);
      
      return visitantesResult.rows.map(v => ({
        visitante_id: v.visitante_id,
        nombre: v.nombre,
        etiqueta: v.etiqueta
      }));
      
    } catch (error) {
      console.error('Error al obtener etiquetas de visitantes:', error);
      throw error;
    }
  });
}

module.exports = {
  // Funciones CRUD básicas (manteniendo nombres que usa el controlador)
  crearPreregistro,
  obtenerPreregistros,
  obtenerPreregistroPorId,
  obtenerPreregistroPorCodigo,
  actualizarEstadoPreregistro,
  
  // Alias para compatibilidad con controlador
  getAllPreregistros: obtenerPreregistros,
  getPreregistroById: obtenerPreregistroPorId,
  createPreregistro: crearPreregistro,
  updatePreregistro: actualizarEstadoPreregistro,
  deletePreregistro: actualizarEstadoPreregistro,
  
  // Funciones específicas para tokens y completado
  obtenerPreregistroPorToken,
  actualizarEstadoToken,
  completarPreregistroConVisitantesYVehiculos,
  
  // Funciones para manejo de fotos
  verificarFotosExistentes,
  verificarFotosFaltantes,
  iniciarPreregistroConFotos,
  cargarFotoVisitante,
  cargarFotoVehiculo,
  iniciarPreregistroMultiple,
  
  // Funciones para eventos por escaneo QR
  getVisitanteById,
  getVehiculoById,
  updatePreregistroStatus,
  obtenerPreregistroPorCodigo,
  obtenerVisitantePreregistro,
  obtenerVehiculoPreregistro,
  obtenerEtiquetasVisitantes
};
