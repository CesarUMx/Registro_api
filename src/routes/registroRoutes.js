const express = require('express');
const router = express.Router();
const { verifyJWT } = require('../middlewares/auth');
const { postRegistroEntradaCaseta, patchEntradaEdificio, postEntradaPeatonal, getRegistroPorCodigo, patchSalidaEdificio, patchSalidaCaseta } = require('../controllers/registroController');

// Proteger con JWT
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

module.exports = router;
