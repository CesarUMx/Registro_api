const router = require('express').Router();
const upload = require('../middlewares/upload');
const { handleInvitePreregistro } = require('../controllers/invitePreregistroController');

// POST /preregistro/invite?token=XYZ
router.post(
  '/invite',
  // No verifyJWT: es público pero requiere token válido
  upload.fields([
    { name: 'idPhoto', maxCount: 1 },
    { name: 'platePhoto', maxCount: 1 }
  ]),
  handleInvitePreregistro
);

module.exports = router;
