// src/models/userModel.js
const pool = require('../config/db');

async function findByUsername(username) {
  const res = await pool.query(`SELECT u.id, u.username, u.password_hash, r.name AS role
                                FROM users u
                                JOIN roles r ON r.id = u.role_id
                                WHERE u.username = $1`, [username]);
  return res.rows[0];
}

async function saveToken(id, token) {
  const res = await pool.query(
    `INSERT INTO tokens (user_id, token)
     VALUES ($1, $2)`,
    [id, token]
  );
}

async function revokeToken(token) {
  console.log('Intentando revocar token:', token.substring(0, 10) + '...');
  
  try {
    // Primero verificamos si la columna revoked existe en la tabla tokens
    const checkColumn = await pool.query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'tokens' AND column_name = 'revoked'`
    );
    
    console.log('Verificación de columna revoked:', checkColumn.rows);
    
    if (checkColumn.rows.length === 0) {
      console.log('La columna revoked no existe en la tabla tokens, intentando crearla...');
      // La columna no existe, intentamos crearla
      await pool.query(`ALTER TABLE tokens ADD COLUMN IF NOT EXISTS revoked BOOLEAN DEFAULT false`);
      console.log('Columna revoked creada correctamente');
    }
    
    // Ahora actualizamos el token
    const res = await pool.query(
      `UPDATE tokens SET revoked = true WHERE token = $1 RETURNING *`,
      [token]
    );
    
    console.log('Resultado de la actualización:', { rowCount: res.rowCount, rows: res.rows });
    return res.rowCount > 0;
  } catch (err) {
    console.error('Error al revocar token:', err);
    throw err;
  }
}

module.exports = { findByUsername, saveToken, revokeToken };
