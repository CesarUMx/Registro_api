const express = require('express');
const router = express.Router();
const { verifyJWT, requireRole } = require('../middlewares/auth');
const {
  postCrearPreregistro,
  getPreregistros,
  getPreregistroPorId,
  patchEstadoPreregistro
} = require('../controllers/preregistroController');

// Middleware de autenticación para todas las rutas
router.use(verifyJWT);

// POST /api/preregistros - Crear nuevo preregistro (solo admin y sysadmin)
router.post('/', requireRole('admin', 'sysadmin'), postCrearPreregistro);

// POST /api/preregistros/list - Obtener lista de preregistros con paginación
router.post('/list', requireRole('admin', 'sysadmin', 'guardia'), getPreregistros);

// GET /api/preregistros/:id - Obtener preregistro por ID
router.get('/:id', requireRole('admin', 'sysadmin', 'guardia'), getPreregistroPorId);

// PATCH /api/preregistros/:id/status - Actualizar estado de preregistro
router.patch('/:id/status', requireRole('admin', 'sysadmin', 'guardia'), patchEstadoPreregistro);

module.exports = router;
