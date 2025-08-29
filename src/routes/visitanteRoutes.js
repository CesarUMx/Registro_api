const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const { verifyJWT, requireRole } = require('../middlewares/auth');
const {
  postVisitante,
  getVisitantes,
  getVisitanteByIdHandler,
  putVisitante,
  deleteVisitanteHandler,
  updateVisitanteFotoPersona
} = require('../controllers/visitanteController');

router.use(verifyJWT);

// Upload espera dos campos de imagen: foto_persona y foto_ine
const multerFields = upload.fields([
  { name: 'foto_ine', maxCount: 1 },
  { name: 'foto_persona', maxCount: 1 }
]);

const multerFieldsFotoPersona = upload.fields([
  { name: 'foto_persona', maxCount: 1 }
]);

router.post('/', multerFields, postVisitante);
router.get('/', getVisitantes);
router.get('/:id', getVisitanteByIdHandler);
router.put('/:id', multerFields, putVisitante);
router.delete('/:id', requireRole('sysadmin'), deleteVisitanteHandler);
router.patch('/:id/foto-persona', multerFieldsFotoPersona, updateVisitanteFotoPersona);

module.exports = router;
