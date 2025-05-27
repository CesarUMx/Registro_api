const router = require('express').Router();
const {
  verifyJWT,
  requireRole,
  requireGuardType
} = require('../middlewares/auth');
const {
  listDrivers,
  showDriver,
  createNewDriver,
  editDriver,
  removeDriver,
  searchDriversByName,
  getDriversForVisitor
} = require('../controllers/driverController');
const upload = require('../middlewares/upload');

// Listar todos los conductores
router.get(
  '/',
  verifyJWT,
  listDrivers
);

// Buscar conductores por nombre
router.get(
  '/search',
  verifyJWT,
  searchDriversByName
);

// Obtener un conductor específico
router.get(
  '/:id',
  verifyJWT,
  showDriver
);

// Crear un nuevo conductor
router.post(
  '/',
  verifyJWT,
  requireRole('sysadmin', 'admin', 'guardia'),
  requireGuardType('caseta', 'supervisor'),
  upload.fields([
    { name: 'idPhoto', maxCount: 1 },
    { name: 'platePhoto', maxCount: 1 }
  ]),
  createNewDriver
);

// Actualizar un conductor existente
router.put(
  '/:id',
  verifyJWT,
  requireRole('sysadmin', 'admin'),
  upload.fields([
    { name: 'idPhoto', maxCount: 1 },
    { name: 'platePhoto', maxCount: 1 }
  ]),
  editDriver
);

// Eliminar un conductor
router.delete(
  '/:id',
  verifyJWT,
  requireRole('sysadmin'),
  removeDriver
);

module.exports = router;
