// src/routes/registros.js
const router = require('express').Router();
const { verifyJWT, requireRole } = require('../middlewares/auth');
const upload = require('../middlewares/upload');
const {
  createGateRegistroByGuard,
  updateWithBuildingEntryByGuard,
  registerBuildingExitByGuard,
  registerGateExitByGuard,
  createBuildingRegistroByGuard,
  completeRegistroAtGate,
  findRegistroByPreregistroCode,
  listRegistros,
  getRegistroById,
  updateRegistroById,
  deleteRegistroById
} = require('../controllers/registroController');

// Crear registro en caseta (primer filtro) con conductor opcional
router.post(
  '/gate',
  verifyJWT,
  requireRole('guardia'),
  upload.fields([
    // Para el visitante (opcional en este punto)
    { name: 'idPhoto', maxCount: 1 },
    // Para el conductor
    { name: 'driverIdPhoto', maxCount: 1 },
    { name: 'platePhoto', maxCount: 1 }
  ]),
  createGateRegistroByGuard
);

// Completar registro en entrada al edificio (segundo filtro)
router.put(
  '/:id/building-entry',
  verifyJWT,
  requireRole('guardia'),
  upload.fields([
    // Para el visitante
    { name: 'idPhoto', maxCount: 1 }
  ]),
  updateWithBuildingEntryByGuard
);

// Registrar salida del edificio
router.put(
  '/:id/building-exit',
  verifyJWT,
  requireRole('guardia'),
  registerBuildingExitByGuard
);

// Registrar salida de la caseta
router.put(
  '/:id/gate-exit',
  verifyJWT,
  requireRole('guardia'),
  registerGateExitByGuard
);

// Completar registro directamente en la caseta (sin entrar al edificio)
router.put(
  '/:id/complete-at-gate',
  verifyJWT,
  requireRole('guardia'),
  completeRegistroAtGate
);

// Crear registro directamente en la entrada al edificio (sin pasar por caseta)
router.post(
  '/building',
  verifyJWT,
  requireRole('guardia'),
  upload.fields([
    // Para el visitante
    { name: 'idPhoto', maxCount: 1 }
  ]),
  createBuildingRegistroByGuard
);

// Endpoint de prueba para verificar autenticación y tipo de guardia
router.get(
  '/test-auth',
  verifyJWT,
  (req, res) => {
    res.json({
      ok: true,
      message: 'Autenticación exitosa',
      user: {
        userId: req.user.userId,
        role: req.user.role,
        guard_type: req.user.guard_type || 'No definido'
      }
    });
  }
);

// Buscar registro por código de preregistro
router.get(
  '/preregistro/:code',
  verifyJWT,
  requireRole('guardia'),
  findRegistroByPreregistroCode
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
  getRegistroById
);

// Actualizar (admin/sysadmin)
router.put(
  '/:id',
  verifyJWT,
  requireRole('sysadmin', 'guardia'),
  updateRegistroById
);

// Eliminar (solo sysadmin)
router.delete(
  '/:id',
  verifyJWT,
  requireRole('sysadmin'),
  deleteRegistroById
);

module.exports = router;
