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
  marbetes = [] // Array de números de marbete para cada vehículo
}) {
  return withTransaction(async (client) => {
    try {
      // Crear el preregistro principal
      const preregistroQuery = `
        INSERT INTO preregistros (admin_id, scheduled_entry_time, scheduled_exit_time, reason, status)
        VALUES ($1, $2, $3, $4, 'pendiente')
        RETURNING *
      `;
      
      const preregistroResult = await client.query(preregistroQuery, [
        admin_id,
        scheduled_entry_time,
        scheduled_exit_time,
        reason
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
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
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
  
    
    await client.query('COMMIT');
    
    return result.rows[0];
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al actualizar estado de preregistro:', {
      message: error.message,
      code: error.code,
      params: { id, status, admin_id }
    });
    
    if (error.code === '23503') { // Foreign key violation
      const customError = new Error('Preregistro o admin no encontrado');
      customError.status = 404;
      customError.code = 'NOT_FOUND';
      throw customError;
    }
    
    const customError = new Error('Error interno al actualizar el preregistro');
    customError.status = 500;
    customError.code = 'DATABASE_ERROR';
    customError.originalError = error;
    throw customError;
  } finally {
    client.release();
  }
}

module.exports = {
  crearPreregistro,
  obtenerPreregistros,
  obtenerPreregistroPorId,
  actualizarEstadoPreregistro
};
