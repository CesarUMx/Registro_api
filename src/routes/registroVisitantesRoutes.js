// src/routes/registroVisitantesRoutes.js
const express = require('express');
const router = express.Router();
const { 
  getVisitantesByRegistroId,
  addVisitanteToRegistro,
  updateVisitanteRegistro,
  deleteVisitanteRegistro,
  checkCardNumberInUse
} = require('../controllers/registroVisitantesController');
const { verifyJWT } = require('../middlewares/auth');

// Rutas protegidas por autenticación
router.use(verifyJWT);

// Obtener visitantes de un registro
router.get('/registros/:id/visitantes', getVisitantesByRegistroId);

// Añadir un visitante a un registro
router.post('/registros/:id/visitantes', addVisitanteToRegistro);

// Actualizar un visitante de un registro
router.put('/registros/visitantes/:id', updateVisitanteRegistro);

// Eliminar un visitante de un registro
router.delete('/registros/visitantes/:id', deleteVisitanteRegistro);

// Verificar si una tarjeta está en uso
router.get('/registros/check-card/:cardNumber', checkCardNumberInUse);

module.exports = router;
