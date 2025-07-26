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

module.exports = {
  crearPreregistro,
  obtenerPreregistros,
  obtenerPreregistroPorId,
  obtenerPreregistroPorToken,
  actualizarEstadoToken,
  completarPreregistroConDatos,
  completarPreregistroConVisitantesYVehiculos,
  actualizarEstadoPreregistro
};
