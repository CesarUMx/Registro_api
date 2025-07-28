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
    
    // Obtener vehículos asociados con sus números de marbete
    const vehiculosQuery = `
      SELECT vh.*, pv.numero_marbete 
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
 * Completar preregistro con datos del visitante y vehículo
 */
async function completarPreregistroConDatos({ preregistro_id, visitante_id, vehiculo_id, token }) {
  return withTransaction(async (client) => {
    try {
      // Asociar visitante al preregistro
      await client.query(
        `INSERT INTO preregistro_visitantes (preregistro_id, visitante_id)
         VALUES ($1, $2)
         ON CONFLICT (preregistro_id, visitante_id) DO NOTHING`,
        [preregistro_id, visitante_id]
      );
      
      // Asociar vehículo al preregistro si se proporciona
      if (vehiculo_id) {
        await client.query(
          `INSERT INTO preregistro_vehiculos (preregistro_id, vehiculo_id)
           VALUES ($1, $2)
           ON CONFLICT (preregistro_id, vehiculo_id) DO NOTHING`,
          [preregistro_id, vehiculo_id]
        );
      }
      
      return {
        preregistro_id,
        visitantes_asociados: 1,
        vehiculos_asociados: vehiculo_id ? 1 : 0,
        mensaje: 'Preregistro completado exitosamente'
      };
      
    } catch (error) {
      console.error('Error en completarPreregistroConDatos:', error);
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
      
      // Verificar visitantes
      visitantes.forEach(visitante => {
        const faltantes = [];
        if (!visitante.foto_persona) faltantes.push('foto_persona');
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

module.exports = {
  // Funciones CRUD básicas (manteniendo nombres que usa el controlador)
  crearPreregistro,
  obtenerPreregistros,
  obtenerPreregistroPorId,
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
  verificarFotosFaltantes,
  verificarFotosExistentes,
  iniciarPreregistroConFotos
};
