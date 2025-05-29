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
  (req, res, next) => {
    return removeDriverFromVisitor(req, res, next);
  }
);

// Establecer un conductor como principal para un visitante
router.put(
  '/visitors/:visitorId/drivers/:driverId/primary',
  verifyJWT,
  requireRole('sysadmin', 'admin', 'guard'),
  makePrimaryDriver
);

// Ruta de prueba para verificar que el enrutador está funcionando
router.get('/test-visitor-driver-route', (req, res) => {
  res.json({ ok: true, message: 'Ruta de prueba funcionando correctamente' });
});

// Ruta alternativa para eliminar asociaciones
router.delete('/eliminar-asociacion/:visitorId/:driverId', verifyJWT, requireRole('sysadmin', 'admin'), async (req, res, next) => {
  try {
    const { visitorId, driverId } = req.params;
    
    await removeDriverFromVisitor(req, res, next);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
