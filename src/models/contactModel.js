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

async function updateContact(id, data) {
  const keys   = Object.keys(data);
  const sets   = keys.map((k,i) => `${k}=$${i+1}`).join(',');
  const values = keys.map(k => data[k]);

  const { rows } = await pool.query(
    `UPDATE contacts
       SET ${sets}, updated_at=now()
     WHERE id=$${keys.length+1}
     RETURNING *`,
    [...values, id]
  );
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
