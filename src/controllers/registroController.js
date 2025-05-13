// src/controllers/registroController.js
const pool = require('../config/db');
const contactModel = require('../models/contactModel');
const {
  createRegistro,
  getAllRegistros,
  getRegistroById,
  updateRegistroById,
  deleteRegistroById
} = require('../models/registroModel');

/**
 * POST /registros
 * Creado por guardias. Crea primero un contact y luego el registro.
 */
async function createRegistroByGuard(req, res, next) {
  try {
    await pool.query('BEGIN');

    // 1) Crear contacto a partir de los datos e imágenes
    const contactId = await contactModel.createContact({
      driver_name:      req.body.driver_name,
      id_photo_path:    `uploads/${req.files.idPhoto[0].filename}`,
      plate_photo_path: `uploads/${req.files.platePhoto[0].filename}`,
      phone:            req.body.phone,
      email:            req.body.email,
      company:          req.body.company,
      type:             req.body.type
    });

    // 2) Insertar el registro en puerta
    const registro = await createRegistro({
      preregistro_id:  req.body.preregistro_id || null,
      guard_user_id:   req.user.userId,
      contact_id:      contactId,
      reason:          req.body.reason
    });

    await pool.query('COMMIT');
    res.status(201).json({ ok: true, data: registro });
  } catch (err) {
    await pool.query('ROLLBACK');
    next(err);
  }
}

/**
 * GET /registros
 * Admin/sysadmin listan todos.
 */
async function listRegistros(req, res, next) {
  try {
    const registros = await getAllRegistros();
    res.json({ ok: true, data: registros });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /registros/:id
 */
async function showRegistro(req, res, next) {
  try {
    const registro = await getRegistroById(req.params.id);
    if (!registro) return res.status(404).json({ ok:false, error:'No encontrado' });
    res.json({ ok: true, data: registro });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /registros/:id
 * Actualiza campos dinámicos (ej. exited_at o reason).
 */
async function editRegistro(req, res, next) {
  try {
    const payload = {};
    if (req.body.exited_at) payload.exited_at = req.body.exited_at;
    if (req.body.reason)    payload.reason     = req.body.reason;
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ ok:false, error:'Nada para actualizar' });
    }

    const updated = await updateRegistroById(req.params.id, payload);
    if (!updated) return res.status(404).json({ ok:false, error:'No encontrado' });
    res.json({ ok: true, data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /registros/:id
 */
async function removeRegistro(req, res, next) {
  try {
    await deleteRegistroById(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createRegistroByGuard,
  listRegistros,
  showRegistro,
  editRegistro,
  removeRegistro
};
