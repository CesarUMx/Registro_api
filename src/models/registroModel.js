// src/models/registroModel.js
const pool = require('../config/db');

async function createRegistro({ preregistro_id, guard_user_id, contact_id, reason }) {
  const { rows } = await pool.query(
    `INSERT INTO registro
       (preregistro_id, guard_user_id, contact_id, reason)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [preregistro_id, guard_user_id, contact_id, reason]
  );
  return rows[0];
}

async function getAllRegistros() {
  const { rows } = await pool.query(
    `SELECT * FROM registro ORDER BY entered_at DESC`
  );
  return rows;
}

async function getRegistroById(id) {
  const { rows } = await pool.query(
    `SELECT * FROM registro WHERE id = $1`, [id]
  );
  return rows[0];
}

async function updateRegistroById(id, data) {
  const keys   = Object.keys(data);
  const sets   = keys.map((k,i) => `${k} = $${i+1}`).join(',');
  const values = keys.map(k => data[k]);

  const { rows } = await pool.query(
    `UPDATE registro
        SET ${sets}, updated_at = now()
      WHERE id = $${keys.length + 1}
      RETURNING *`,
    [...values, id]
  );
  return rows[0];
}

async function deleteRegistroById(id) {
  await pool.query(`DELETE FROM registro WHERE id = $1`, [id]);
}

module.exports = {
  createRegistro,
  getAllRegistros,
  getRegistroById,
  updateRegistroById,
  deleteRegistroById
};
