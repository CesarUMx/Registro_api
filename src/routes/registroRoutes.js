const express = require('express');
const router = express.Router();
const { verifyJWT } = require('../middlewares/auth');
const { postRegistroEntradaCaseta, patchEntradaEdificio, postEntradaPeatonal,
    patchSalidaEdificio, patchSalidaCaseta, 
    getRegistrosListado, getRegistroDetalle, patchAsociarVehiculo,
    getRegistroPublico, patchSalidaCasetaParcial, patchCargarVisitantes,
    getVisitantesByRegistroId, getRegistroPorCodigo, getRegistrosHoyCount,
    getRegistrosActivosCount
} = require('../controllers/registroController');

// Ruta pública para obtener detalles de un registro por código (sin autenticación)
router.get('/publico/:codigo', getRegistroPublico);

// Proteger el resto de rutas con JWT
router.use(verifyJWT);

// Entrada por caseta (registro inicial vehicular)
router.post('/entrada-caseta', postRegistroEntradaCaseta);

// Entrada por edificio (agregar visitantes)
router.patch('/:id/entrada-edificio', patchEntradaEdificio);

// Entrada peatonal por caseta
router.post('/entrada-peatonal', postEntradaPeatonal);

// Buscar registro por código
router.get('/codigo/:code_registro', getRegistroPorCodigo);

// Salida del edificio
router.patch('/:id/salida-edificio', patchSalidaEdificio);

// Salida por caseta
router.patch('/:id/salida-caseta', patchSalidaCaseta);

// Salida parcial por caseta
router.patch('/:id/salida-caseta-parcial', patchSalidaCasetaParcial);

// Cargar visitantes (sin edificio, persona a visitar ni motivo)
router.patch('/:id/cargar-visitantes', patchCargarVisitantes);

// Listado de registros
router.post('/', getRegistrosListado);

// Obtener conteo de registros de hoy
router.get('/hoy/count', getRegistrosHoyCount);

// Obtener conteo de registros activos
router.get('/activos/count', getRegistrosActivosCount);

// Detalle de un registro
router.get('/:id', getRegistroDetalle);

// Obtener visitantes de un registro
router.get('/:id/visitantes', getVisitantesByRegistroId);

router.patch('/asociar-vehiculo', patchAsociarVehiculo);

module.exports = router;
