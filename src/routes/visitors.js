const router = require('express').Router();
const {
  verifyJWT,
  requireRole,
  requireGuardType
} = require('../middlewares/auth');
const {
  listVisitors,
  showVisitor,
  createNewVisitor,
  editVisitor,
  removeVisitor,
  searchVisitorsByName
} = require('../controllers/visitorController');
const upload = require('../middlewares/upload');

// Listar todos los visitantes
router.get(
  '/',
  verifyJWT,
  listVisitors
);

// Buscar visitantes por nombre
router.get(
  '/search',
  verifyJWT,
  searchVisitorsByName
);

// Obtener un visitante específico
router.get(
  '/:id',
  verifyJWT,
  showVisitor
);

// Crear un nuevo visitante
router.post(
  '/',
  verifyJWT,
  requireRole('sysadmin', 'admin', 'guardia'),
  requireGuardType('entrada', 'supervisor'),
  upload.fields([
    { name: 'idPhoto', maxCount: 1 }
  ]),
  createNewVisitor
);

// Actualizar un visitante existente
router.put(
  '/:id',
  verifyJWT,
  requireRole('sysadmin', 'admin'),
  upload.fields([
    { name: 'idPhoto', maxCount: 1 }
  ]),
  editVisitor
);

// Eliminar un visitante
router.delete(
  '/:id',
  verifyJWT,
  requireRole('sysadmin'),
  removeVisitor
);

module.exports = router;
