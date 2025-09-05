const pool = require('../config/db');

async function createVehiculo({ foto_placa, placa }) {
  // Verificar primero si ya existe un vehículo con esta placa
  const checkResult = await pool.query(
    `SELECT id FROM vehiculos WHERE placa = $1 LIMIT 1`,
    [placa]
  );
  
  if (checkResult.rows.length > 0) {
    // Si ya existe un vehículo con esta placa, lanzar un error personalizado
    const error = new Error(`La placa ${placa} ya está registrada en el sistema`);
    error.status = 409; // Conflict status code
    error.code = 'PLACA_DUPLICADA';
    throw error;
  }
  
  // Si no existe, proceder con la inserción
  const result = await pool.query(
    `INSERT INTO vehiculos (foto_placa, placa)
     VALUES ($1, $2) RETURNING *`,
    [foto_placa, placa]
  );
  return result.rows[0];
}

async function getVehiculosByVisitante(visitante_id) {
  const result = await pool.query(
    `SELECT * FROM vehiculos
     WHERE id_visitante = $1 AND activo = true
     ORDER BY id DESC`,
    [visitante_id]
  );
  return result.rows;
}

async function getVehiculoById(id) {
  const result = await pool.query(
    `SELECT * FROM vehiculos
     WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

async function deleteVehiculo(id) {
  const result = await pool.query(
    `UPDATE vehiculos SET activo = false WHERE id = $1 RETURNING *`,
    [id]
  );
  return result.rows[0];
}

async function updateVehiculo(id, fields) {
    const keys = Object.keys(fields);
    const values = Object.values(fields);
  
    const updates = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
  
    const result = await pool.query(
      `UPDATE vehiculos SET ${updates} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );
    return result.rows[0];
  }

  async function searchVehiculoByPlaca(placa) {
    const result = await pool.query(
      `SELECT * FROM vehiculos WHERE placa LIKE $1 LIMIT 1`,
      [placa + '%']
    );
    return result.rows[0];
  }
  

  
/**
 * Crear o buscar vehículo (para preregistros públicos)
 */
async function crearOBuscarVehiculo(vehiculoData) {
  const { placas } = vehiculoData;
  
  // Primero buscar si ya existe por placas
  const vehiculoExistente = await searchVehiculoByPlaca(placas);
  
  if (vehiculoExistente) {
    // Si ya existe, devolverlo sin modificaciones
    return vehiculoExistente;
  }
  
  // Si no existe, crear nuevo vehículo (solo con placa)
  const result = await pool.query(
    `INSERT INTO vehiculos (placa)
     VALUES ($1)
     RETURNING *`,
    [placas]
  );
  
  return result.rows[0];
}

module.exports = {
    createVehiculo,
    getVehiculosByVisitante,
    getVehiculoById,
    deleteVehiculo,
    updateVehiculo,
    searchVehiculoByPlaca,
    crearOBuscarVehiculo
}