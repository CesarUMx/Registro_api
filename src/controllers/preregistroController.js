const inviteModel = require('../models/invitePreregistroModel');
const {
  getAllPreregistros,
  getPreregistroById,
  updatePreregistroById,
  deletePreregistroById,
  getPreregistrosByAdmin
} = require('../models/preregistroModel');

/**
 * GET /preregistros
 */
async function listPreregistros(req, res, next) {
  try {
    let rows;
    if (req.user.role === 'sysadmin') {
      // sysadmin ve todos
      rows = await getAllPreregistros();
    } else {
      // admin ve solo los suyos
      rows = await getPreregistrosByAdmin(req.user.userId);
    }
    res.json({ ok: true, data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /preregistros/:id
 */
async function showPreregistro(req, res, next) {
  try {
    const row = await getPreregistroById(req.params.id);
    if (!row) return res.status(404).json({ ok:false, error:'No encontrado' });
    res.json({ ok: true, data: row });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /preregistros
 * Crea contacto + preregistro. Solo admin.
 */
async function createPreregistroByAdmin(req, res, next) {
  try {
    const adminId = req.user.userId;
    // 1) Crear contacto
    const contactId = await inviteModel.createContact({
      driver_name: req.body.driver_name,
      id_photo:    req.files.idPhoto[0].filename,
      plate_photo: req.files.platePhoto[0].filename,
      phone:       req.body.phone,
      email:       req.body.email,
      company:     req.body.company,
      type:        req.body.type
    });

    // 2) Crear preregistro
    const preregistro = await inviteModel.createPreregistro({
      admin_id:       adminId,
      invite_id:      null,
      contact_id:     contactId,
      scheduled_date: req.body.scheduled_date,
      reason:         req.body.reason
    });

    res.status(201).json({ ok:true, data: preregistro });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /preregistros/:id
 * Actualiza solo fecha y/o motivo.
 */
async function editPreregistro(req, res, next) {
  try {
    const payload = {};
    if (req.body.scheduled_date) payload.scheduled_date = req.body.scheduled_date;
    if (req.body.reason)         payload.reason         = req.body.reason;
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ ok:false, error:'Nada para actualizar' });
    }

    const updated = await updatePreregistroById(req.params.id, payload);
    if (!updated) return res.status(404).json({ ok:false, error:'No encontrado' });
    res.json({ ok:true, data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /preregistros/:id
 */
async function removePreregistro(req, res, next) {
  try {
    await deletePreregistroById(req.params.id);
    res.json({ ok:true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listPreregistros,
  showPreregistro,
  createPreregistroByAdmin,
  editPreregistro,
  removePreregistro
};
