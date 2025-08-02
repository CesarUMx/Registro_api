// routes/capturaRoutes.js
const express = require('express');
const router = express.Router();
const { capturarImagen } = require('../controllers/capturaController');

// Ruta: POST /api/captura/placa, /persona, /ine
router.post('/:tipo', capturarImagen);

module.exports = router;
