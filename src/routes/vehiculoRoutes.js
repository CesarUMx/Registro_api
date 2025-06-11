const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const { verifyJWT, requireRole } = require('../middlewares/auth');

const {
  postVehiculo,
  getVehiculos,
  getVehiculoByIdHandler,
  deleteVehiculoHandler,
  putVehiculo,
  searchVehiculoHandler
} = require('../controllers/vehiculoController');

router.use(verifyJWT);

router.post('/', requireRole(['admin', 'sysadmin']), upload.single('foto_placa'), postVehiculo);
router.get('/', getVehiculos); // visitante_id requerido
router.get('/:id', getVehiculoByIdHandler);
router.delete('/:id', requireRole(['admin', 'sysadmin']), deleteVehiculoHandler);
router.put('/:id', requireRole(['admin', 'sysadmin']), upload.single('foto_placa'), putVehiculo);
router.get('/search', searchVehiculoHandler);


module.exports = router;
