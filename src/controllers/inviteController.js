const { createInvite } = require('../models/inviteModel');

async function createNewInvite(req, res, next) {
  try {
    const adminId = req.user.userId;            // viene de verifyJWT
    const invite  = await createInvite(adminId);
    res.status(201).json({ ok: true, data: invite });
  } catch (err) {
    next(err);
  }
}

module.exports = { createNewInvite };
