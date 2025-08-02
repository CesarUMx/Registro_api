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

// Upload espera dos campos de imagen: foto_persona y foto_ine
const multerFields = upload.fields([
  { name: 'foto_ine', maxCount: 1 }
]);

const multerFieldsFotoPersona = upload.fields([
  { name: 'foto_persona', maxCount: 1 }
]);

router.post('/', verifyJWT, multerFields, postVisitante);
router.get('/', verifyJWT, getVisitantes);
router.get('/:id', verifyJWT, getVisitanteByIdHandler);
router.put('/:id', verifyJWT, multerFields, putVisitante);
router.delete('/:id', verifyJWT, requireRole('sysadmin'), deleteVisitanteHandler);
router.patch('/:id/foto-persona', verifyJWT, multerFieldsFotoPersona, updateVisitanteFotoPersona);

module.exports = router;
