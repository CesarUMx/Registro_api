// src/controllers/invitePreregistroController.js
const poolModel = require('../models/invitePreregistroModel');
const upload = require('../middlewares/upload');

async function handleInvitePreregistro(req, res, next) {
  const token = req.query.token || req.body.token;
  if (!token) return res.status(400).json({ ok:false, error:'Falta token de invitación' });

  try {
    await poolModel.pool.query('BEGIN');

    // 1. Bloquear y obtener invite
    const invite = await poolModel.lockInviteByToken(token);
    if (!invite) throw { status:404, message:'Invite no encontrado' };
    if (invite.used) throw { status:410, message:'Invite ya usado' };

    // 2. Crear contacto
    const contactId = await poolModel.createContact({
      driver_name:    req.body.driver_name,
      id_photo:       req.files.idPhoto[0].filename,
      plate_photo:    req.files.platePhoto[0].filename,
      phone:          req.body.phone,
      email:          req.body.email,
      company:        req.body.company,
      type:           req.body.type
    });

    // 3. Crear preregistro
    const preregistro = await poolModel.createPreregistro({
      admin_id:        invite.admin_id,
      invite_id:       invite.id,
      contact_id:      contactId,
      scheduled_date:  req.body.scheduled_date,
      reason:          req.body.reason
    });

    // 4. Marcar invite usado
    await poolModel.markInviteUsed(invite.id);

    await poolModel.pool.query('COMMIT');
    res.status(201).json({ ok:true, data: preregistro });
  } catch (err) {
    await poolModel.pool.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ ok:false, error: err.message });
    next(err);
  }
}

module.exports = { handleInvitePreregistro };
