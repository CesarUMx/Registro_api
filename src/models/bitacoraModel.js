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

module.exports = {
  obtenerBitacoraPreregistro
};
