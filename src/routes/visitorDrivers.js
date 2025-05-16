const router = require('express').Router();
const {
  verifyJWT,
  requireRole
} = require('../middlewares/auth');
const {
  addDriverToVisitor,
  removeDriverFromVisitor,
  listDriversForVisitor,
  makePrimaryDriver
} = require('../controllers/visitorDriverController');

// Listar conductores asociados a un visitante
router.get(
  '/visitors/:visitorId/drivers',
  verifyJWT,
  listDriversForVisitor
);

// Asociar un conductor a un visitante
router.post(
  '/visitors/:visitorId/drivers',
  verifyJWT,
  requireRole('sysadmin', 'admin', 'guard'),
  addDriverToVisitor
);

// Eliminar la asociación entre un conductor y un visitante
router.delete(
  '/visitors/:visitorId/drivers/:driverId',
  verifyJWT,
  requireRole('sysadmin', 'admin'),
  removeDriverFromVisitor
);

// Establecer un conductor como principal para un visitante
router.put(
  '/visitors/:visitorId/drivers/:driverId/primary',
  verifyJWT,
  requireRole('sysadmin', 'admin', 'guard'),
  makePrimaryDriver
);

module.exports = router;
