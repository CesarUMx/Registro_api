const express = require('express');
const router = express.Router();
const { getBitacoraPreregistro, getUltimoEventoRegistrado, registrarEvento } = require('../controllers/bitacoraController');
const { verifyJWT } = require('../middlewares/auth');

// Rutas protegidas con autenticación
router.use(verifyJWT);

// Obtener la bitácora completa de un preregistro
router.get('/preregistro/:id', getBitacoraPreregistro);

// Obtener el último evento registrado para un preregistro/visitante/vehículo
router.get('/ultimo-evento', getUltimoEventoRegistrado);

// Registrar un nuevo evento en la bitácora
router.post('/registrar', registrarEvento);

module.exports = router;
