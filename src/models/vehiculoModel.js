const pool = require('../config/db');

async function createVehiculo({ foto_placa, placa, id_visitante }) {
  const result = await pool.query(
    `INSERT INTO vehiculos (foto_placa, placa, id_visitante)
     VALUES ($1, $2, $3) RETURNING *`,
    [foto_placa, placa, id_visitante]
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
     WHERE id = $1 AND activo = true`,
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
      `SELECT * FROM vehiculos WHERE placa ILIKE $1 AND activo = true LIMIT 1`,
      [placa]
    );
    return result.rows[0];
  }
  

  
module.exports = {
    createVehiculo,
    getVehiculosByVisitante,
    getVehiculoById,
    deleteVehiculo,
    updateVehiculo,
    searchVehiculoByPlaca
}