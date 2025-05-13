const pool = require('../config/db');

async function getAllContacts() {
  const { rows } = await pool.query(`
    SELECT id, driver_name, id_photo_path, plate_photo_path,
           phone, email, company, type, created_at, updated_at
    FROM contacts
    ORDER BY created_at DESC
  `);
  return rows;
}

async function getContactById(id) {
  const { rows } = await pool.query(`
    SELECT * FROM contacts WHERE id = $1
  `, [id]);
  return rows[0];
}

async function createContact({ driver_name, id_photo_path, plate_photo_path, phone, email, company, type }) {
  const { rows } = await pool.query(`
    INSERT INTO contacts
      (driver_name, id_photo_path, plate_photo_path, phone, email, company, type)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7)
    RETURNING *
  `, [driver_name, id_photo_path, plate_photo_path, phone, email, company, type]);
  return rows[0];
}

async function updateContact(id, { driver_name, id_photo_path, plate_photo_path, phone, email, company, type }) {
  const { rows } = await pool.query(`
    UPDATE contacts
    SET driver_name = $2,
        id_photo_path = $3,
        plate_photo_path = $4,
        phone = $5,
        email = $6,
        company = $7,
        type = $8,
        updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [id, driver_name, id_photo_path, plate_photo_path, phone, email, company, type]);
  return rows[0];
}

async function deleteContact(id) {
  await pool.query(`DELETE FROM contacts WHERE id = $1`, [id]);
  return;
}

module.exports = {
  getAllContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact
};
