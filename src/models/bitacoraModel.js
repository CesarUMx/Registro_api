const pool = require('../config/db');

/**
 * Obtener todos los registros de bitácora para un preregistro específico
 * @param {number} preregistroId - ID del preregistro
 * @returns {Promise<Array>} - Registros de bitácora con información detallada
 */
async function obtenerBitacoraPreregistro(preregistroId) {
  try {
    const query = `
      SELECT 
        bp.id,
        bp.preregistro_id,
        bp.visitante_id,
        bp.vehiculo_id,
        bp.guardia_id,
        bp.tipo_evento,
        bp.timestamp,
        bp.notas,
        v.nombre AS visitante_nombre,
        vh.placa AS vehiculo_placa,
        u.name AS guardia_nombre
      FROM 
        bitacora_preregistros bp
      LEFT JOIN 
        visitantes v ON bp.visitante_id = v.id
      LEFT JOIN 
        vehiculos vh ON bp.vehiculo_id = vh.id
      LEFT JOIN 
        users u ON bp.guardia_id = u.id
      WHERE 
        bp.preregistro_id = $1
      ORDER BY 
        bp.timestamp DESC
    `;

    const result = await pool.query(query, [preregistroId]);
    return result.rows;
  } catch (error) {
    console.error('Error al obtener bitácora de preregistro:', error);
    throw error;
  }
}

/**
 * Crear un nuevo registro en la bitácora de preregistros
 * @param {Object} datos - Datos del registro
 * @returns {Promise<Object>} - Registro creado
 */
async function crearRegistroBitacora(datos) {
  try {
    const { preregistro_id, visitante_id, vehiculo_id, tipo_evento, usuario_id, detalles } = datos;
    
    const query = `
      INSERT INTO bitacora_preregistros
        (preregistro_id, visitante_id, vehiculo_id, guardia_id, tipo_evento, notas)
      VALUES
        ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const values = [preregistro_id, visitante_id, vehiculo_id, usuario_id, tipo_evento, detalles];
    const result = await pool.query(query, values);
    
    return result.rows[0];
  } catch (error) {
    console.error('Error al crear registro en bitácora:', error);
    throw error;
  }
}

/**
 * Obtener el último evento registrado para un visitante
 * @param {number} visitanteId - ID del visitante
 * @returns {Promise<Object>} - Último evento registrado
 */
async function getUltimoEventoVisitante(visitanteId) {
  try {
    const query = `
      SELECT *
      FROM bitacora_preregistros
      WHERE visitante_id = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `;
    
    const result = await pool.query(query, [visitanteId]);
    return result.rows[0];
  } catch (error) {
    console.error('Error al obtener último evento de visitante:', error);
    throw error;
  }
}

/**
 * Obtener el último evento registrado para un vehículo
 * @param {number} vehiculoId - ID del vehículo
 * @returns {Promise<Object>} - Último evento registrado
 */
async function getUltimoEventoVehiculo(vehiculoId) {
  try {
    const query = `
      SELECT *
      FROM bitacora_preregistros
      WHERE vehiculo_id = $1
      ORDER BY timestamp DESC
      LIMIT 1
    `;
    
    const result = await pool.query(query, [vehiculoId]);
    return result.rows[0];
  } catch (error) {
    console.error('Error al obtener último evento de vehículo:', error);
    throw error;
  }
}

/**
 * Obtener el último evento registrado para una combinación de preregistro, visitante y/o vehículo
 * @param {Object} params - Parámetros de búsqueda
 * @param {number} params.preregistro_id - ID del preregistro (opcional)
 * @param {number} params.visitante_id - ID del visitante (opcional)
 * @param {number} params.vehiculo_id - ID del vehículo (opcional)
 * @returns {Promise<Object>} - Último evento registrado
 */
async function getUltimoEvento(params) {
  try {
    const { preregistro_id, visitante_id, vehiculo_id } = params;
    const conditions = [];
    const values = [];
    let paramIndex = 1;
    
    if (preregistro_id) {
      conditions.push(`preregistro_id = $${paramIndex}`);
      values.push(preregistro_id);
      paramIndex++;
    }
    
    if (visitante_id) {
      conditions.push(`visitante_id = $${paramIndex}`);
      values.push(visitante_id);
      paramIndex++;
    }
    
    if (vehiculo_id) {
      conditions.push(`vehiculo_id = $${paramIndex}`);
      values.push(vehiculo_id);
      paramIndex++;
    }
    
    // Si no hay condiciones, retornar null
    if (conditions.length === 0) {
      return null;
    }
    
    const whereClause = conditions.join(' AND ');
    
    const query = `
      SELECT *
      FROM bitacora_preregistros
      WHERE ${whereClause}
      ORDER BY timestamp DESC
      LIMIT 1
    `;
    
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error al obtener último evento:', error);
    throw error;
  }
}

module.exports = {
  obtenerBitacoraPreregistro,
  crearRegistroBitacora,
  getUltimoEventoVisitante,
  getUltimoEventoVehiculo,
  getUltimoEvento
};
