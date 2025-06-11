const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const { verifyJWT, requireRole } = require('../middlewares/auth');
const {
  postVisitante,
  getVisitantes,
  getVisitanteByIdHandler,
  putVisitante,
  deleteVisitanteHandler
} = require('../controllers/visitanteController');

// Upload espera dos campos de imagen: foto_persona y foto_ine
const multerFields = upload.fields([
  { name: 'foto_persona', maxCount: 1 },
  { name: 'foto_ine', maxCount: 1 }
]);

router.post('/', verifyJWT, multerFields, postVisitante);
router.get('/', verifyJWT, getVisitantes);
router.get('/:id', verifyJWT, getVisitanteByIdHandler);
router.put('/:id', verifyJWT, multerFields, putVisitante);
router.delete('/:id', verifyJWT, requireRole('sysadmin'), deleteVisitanteHandler);

module.exports = router;
