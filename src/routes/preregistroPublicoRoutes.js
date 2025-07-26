const express = require('express');
const router = express.Router();
const upload = require('../middlewares/upload');
const {
  getPreregistroPorToken,
  postCompletarPreregistro,
  buscarVisitantesPublico,
  crearVisitantePublico,
  buscarVehiculoPublico,
  crearVehiculoPublico
} = require('../controllers/preregistroController');

// Configurar multer para manejar solo la foto de INE
const multerFieldsVisitante = upload.fields([
  { name: 'fotoIne', maxCount: 1 }
]);

// Configurar multer para manejar fotos de vehículo
const multerFieldsVehiculo = upload.fields([
  { name: 'fotoPlaca', maxCount: 1 }
]);

// GET /api/preregistro-publico/:token - Obtener datos del preregistro por token (público, sin autenticación)
router.get('/:token', getPreregistroPorToken);

// POST /api/preregistro-publico/:token/completar - Completar preregistro desde formulario público
router.post('/:token/completar', postCompletarPreregistro);

// GET /api/preregistro-publico/:token/buscar-visitantes - Buscar visitantes existentes (público)
router.get('/:token/buscar-visitantes', buscarVisitantesPublico);

// POST /api/preregistro-publico/:token/crear-visitante - Crear nuevo visitante (público)
router.post('/:token/crear-visitante', multerFieldsVisitante, crearVisitantePublico);

// GET /api/preregistro-publico/:token/buscar-vehiculo - Buscar vehículo por placa (público)
router.get('/:token/buscar-vehiculo', buscarVehiculoPublico);

// POST /api/preregistro-publico/:token/crear-vehiculo - Crear nuevo vehículo (público)
router.post('/:token/crear-vehiculo', multerFieldsVehiculo, crearVehiculoPublico);

module.exports = router;
