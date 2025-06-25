const express = require('express');
const router = express.Router();
const { verifyJWT } = require('../middlewares/auth');
const { postRegistroEntradaCaseta, patchEntradaEdificio, postEntradaPeatonal,
    getRegistroPorCodigo, patchSalidaEdificio, patchSalidaCaseta, 
    getRegistrosListado, getRegistroDetalle, patchAsociarVehiculo,
    getRegistroPublico
} = require('../controllers/registroController');

// Ruta pública para obtener detalles de un registro por código (sin autenticación)
router.get('/publico/:codigo', getRegistroPublico);

// Proteger el resto de rutas con JWT
router.use(verifyJWT);

// Entrada por caseta (registro inicial vehicular)
router.post('/entrada-caseta', postRegistroEntradaCaseta);

// Entrada por edificio (agregar visitantes)
router.patch('/:id/entrada-edificio', patchEntradaEdificio);

// Entrada por edificio peatonal
router.post('/entrada-edificio', postEntradaPeatonal);

// Buscar registro por código
router.get('/codigo/:code_registro', getRegistroPorCodigo);

// Salida del edificio
router.patch('/:id/salida-edificio', patchSalidaEdificio);

// Salida por caseta
router.patch('/:id/salida-caseta', patchSalidaCaseta);

// Listado de registros
router.post('/', getRegistrosListado);

// Detalle de un registro
router.get('/:id', getRegistroDetalle);

router.patch('/asociar-vehiculo', patchAsociarVehiculo);

module.exports = router;
