const express = require('express');
const router = express.Router();
const eventoController = require('../controllers/eventoController');
const { verifyJWT } = require('../middlewares/auth');

// Ruta para determinar el siguiente evento
router.get('/siguiente-evento/:tipo/:id', verifyJWT, eventoController.getSiguienteEvento);

// Ruta para registrar un evento
router.post('/registrar', verifyJWT, eventoController.registrarEvento);

module.exports = router;
