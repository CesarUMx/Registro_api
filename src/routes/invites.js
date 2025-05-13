// src/routes/invites.js
const router           = require('express').Router();
const { verifyJWT, requireRole } = require('../middlewares/auth');
const { createNewInvite }        = require('../controllers/inviteController');

// POST /invites → sólo admins o sysadmins pueden generar invites
router.post(
  '/',
  verifyJWT,
  requireRole('admin','sysadmin'),
  createNewInvite
);

module.exports = router;
