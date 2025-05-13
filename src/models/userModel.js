// src/models/userModel.js
const pool = require('../config/db');

async function findByUsername(username) {
  const res = await pool.query(`SELECT u.id, u.username, u.password_hash, r.name AS role
                                FROM users u
                                JOIN roles r ON r.id = u.role_id
                                WHERE u.username = $1`, [username]);
  return res.rows[0];
}

module.exports = { findByUsername };
