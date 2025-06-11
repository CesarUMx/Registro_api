const pool = require('../config/db');

async function createVisitante({ nombre, tipo, telefono, empresa, foto_persona, foto_ine }) {
  const result = await pool.query(
    `INSERT INTO visitantes (nombre, tipo, telefono, empresa, foto_persona, foto_ine)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [nombre, tipo, telefono, empresa, foto_persona, foto_ine]
  );
  return result.rows[0];
}

async function getVisitanteById(id) {
  const result = await pool.query(
    'SELECT * FROM visitantes WHERE activo = true AND id = $1',
    [id]
  );
  return result.rows[0];
}

async function searchVisitantes(query) {
    if (query && query.trim().length >= 2) {
      return (
        await pool.query(
          `SELECT id, nombre, telefono, empresa, tipo
           FROM visitantes
           WHERE activo = true AND (
           LOWER(nombre) LIKE LOWER($1)
           OR telefono ILIKE $1
           OR LOWER(empresa) LIKE LOWER($1)
           )
           ORDER BY nombre ASC
           LIMIT 10`,
          [`%${query}%`]
        )
      ).rows;
    } else {
      // traer todos si no hay búsqueda
      return (
        await pool.query(
          `SELECT id, nombre, telefono, empresa, tipo
           FROM visitantes
           WHERE activo = true
           ORDER BY nombre ASC`
        )
      ).rows;
    }
  }

async function updateVisitante(id, fields) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  const updates = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

  const result = await pool.query(
    `UPDATE visitantes SET ${updates} WHERE id = $${keys.length + 1} RETURNING *`,
    [...values, id]
  );
  return result.rows[0];
}

async function deleteVisitante(id) {
    const result = await pool.query(
      `UPDATE visitantes SET activo = false WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }
  

module.exports = {
  createVisitante,
  getVisitanteById,
  searchVisitantes,
  updateVisitante,
  deleteVisitante
};
