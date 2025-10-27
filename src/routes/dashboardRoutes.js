const express = require('express');
const router = express.Router();
const { verifyJWT } = require('../middlewares/auth');
const dashboardController = require('../controllers/dashboardController');

// Ruta para obtener todas las estadísticas del dashboard
router.get('/stats', verifyJWT, dashboardController.getDashboardStats);

module.exports = router;
