const pool   = require('../config/db');
const crypto = require('crypto');

async function createInvite(admin_id) {
  const token = crypto.randomBytes(32).toString('hex');
  const { rows } = await pool.query(
    `INSERT INTO preregistro_invites (admin_id, token)
     VALUES ($1, $2)
     RETURNING id, token, used, created_at`,
    [admin_id, token]
  );
  return rows[0];
}

module.exports = { createInvite };
