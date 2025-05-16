// src/routes/registros.js
const router = require('express').Router();
const { verifyJWT, requireRole } = require('../middlewares/auth');
const upload = require('../middlewares/upload');
const {
  createRegistroByGuard,
  listRegistros,
  showRegistro,
  editRegistro,
  removeRegistro
} = require('../controllers/registroController');

// Crear registro en puerta con visitante y conductor opcional
router.post(
  '/',
  verifyJWT,
  requireRole('guardia'),
  upload.fields([
    // Para el visitante
    { name: 'idPhoto', maxCount: 1 },
    // Para el conductor (opcionales)
    { name: 'driverIdPhoto', maxCount: 1 },
    { name: 'platePhoto', maxCount: 1 }
  ]),
  createRegistroByGuard
);

// Listar (admin/sysadmin)
router.get(
  '/',
  verifyJWT,
  requireRole('sysadmin', 'guardia'),
  listRegistros
);

// Ver uno (admin/sysadmin)
router.get(
  '/:id',
  verifyJWT,
  requireRole('sysadmin', 'guardia'),
  showRegistro
);

// Actualizar (admin/sysadmin)
router.put(
  '/:id',
  verifyJWT,
  requireRole('sysadmin', 'guardia'),
  editRegistro
);

// Eliminar (solo sysadmin)
router.delete(
  '/:id',
  verifyJWT,
  requireRole('sysadmin'),
  removeRegistro
);

module.exports = router;
