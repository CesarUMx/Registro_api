const pool = require('../config/db');

/**
 * Devuelve todos los preregistros.
 */
async function getAllPreregistros() {
  const { rows } = await pool.query(
    `SELECT * 
       FROM preregistro
      ORDER BY created_at DESC`
  );
  return rows;
}

/**
 * Devuelve los preregistros de un admin
 */
async function getPreregistrosByAdmin(adminId) {
  const { rows } = await pool.query(
    `SELECT *
       FROM preregistro
      WHERE admin_id = $1
      ORDER BY created_at DESC`,
    [adminId]
  );
  return rows;
}

/**
 * Devuelve un preregistro por su ID.
 */
async function getPreregistroById(id) {
  const { rows } = await pool.query(
    `SELECT * 
       FROM preregistro 
      WHERE id = $1`, 
    [id]
  );
  return rows[0];
}

/**
 * Actualiza campos dinámicos de un preregistro.
 */
async function updatePreregistroById(id, data) {
  const keys   = Object.keys(data);
  const sets   = keys.map((k,i) => `${k} = $${i+1}`).join(',');
  const values = keys.map(k => data[k]);

  const { rows } = await pool.query(
    `UPDATE preregistro
        SET ${sets}, updated_at = now()
      WHERE id = $${keys.length + 1}
      RETURNING *`,
    [...values, id]
  );
  return rows[0];
}

/**
 * Elimina un preregistro (y deja intacto el contacto).
 */
async function deletePreregistroById(id) {
  await pool.query(
    `DELETE FROM preregistro WHERE id = $1`,
    [id]
  );
}

module.exports = {
  getAllPreregistros,
  getPreregistroById,
  updatePreregistroById,
  deletePreregistroById,
  getPreregistrosByAdmin
};
