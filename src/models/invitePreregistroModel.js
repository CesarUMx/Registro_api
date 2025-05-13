const pool = require('../config/db');

async function lockInviteByToken(token) {
  const res = await pool.query(
    `SELECT id, admin_id, used
     FROM preregistro_invites
     WHERE token = $1
     FOR UPDATE`,
    [token]
  );
  return res.rows[0];
}

async function markInviteUsed(inviteId) {
  await pool.query(
    `UPDATE preregistro_invites
       SET used = true, used_at = now()
     WHERE id = $1`,
    [inviteId]
  );
}

async function createContact(data) {
  const { driver_name, id_photo, plate_photo, phone, email, company, type } = data;
  const res = await pool.query(
    `INSERT INTO contacts
       (driver_name, id_photo_path, plate_photo_path, phone, email, company, type)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id`,
    [driver_name, id_photo, plate_photo, phone, email, company, type]
  );
  return res.rows[0].id;
}

async function createPreregistro(data) {
  const { admin_id, invite_id, contact_id, scheduled_date, reason } = data;
  const res = await pool.query(
    `INSERT INTO preregistro
       (admin_id, invite_id, contact_id, scheduled_date, reason)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [admin_id, invite_id, contact_id, scheduled_date, reason]
  );
  return res.rows[0];
}

module.exports = {
  lockInviteByToken,
  markInviteUsed,
  createContact,
  createPreregistro
};
