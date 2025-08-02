// src/controllers/registroVisitantesController.js
const {
  addVisitorToRegistro,
  getVisitorsByRegistroId,
  updateRegistroVisitante,
  deleteRegistroVisitante,
  checkCardInUse
} = require('../models/registroVisitantesModel');

const { getRegistroById } = require('../models/registroModel');
const { getVisitorById } = require('../models/visitorModel');

/**
 * Obtiene todos los visitantes asociados a un registro
 * GET /registros/:id/visitantes
 */
async function getVisitantesByRegistroId(req, res, next) {
  try {
    const registroId = parseInt(req.params.id, 10);
    
    // Verificar que el registro exista
    const registro = await getRegistroById(registroId);
    if (!registro) {
      return res.status(404).json({
        ok: false,
        error: 'Registro no encontrado',
        code: 'REGISTRO_NOT_FOUND'
      });
    }
    
    // Obtener visitantes asociados
    const visitantes = await getVisitorsByRegistroId(registroId);
    
    return res.status(200).json({
      ok: true,
      visitantes
    });
  } catch (error) {
    console.error('Error en getVisitantesByRegistroId:', error);
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error al obtener visitantes del registro',
      code: error.code || 'SERVER_ERROR'
    });
  }
}

/**
 * Añade un visitante a un registro existente
 * POST /registros/:id/visitantes
 */
async function addVisitanteToRegistro(req, res, next) {
  try {
    const registroId = parseInt(req.params.id, 10);
    const { visitor_id, is_driver, tag_type, card_number } = req.body;
    
    // Verificar que el registro exista
    const registro = await getRegistroById(registroId);
    if (!registro) {
      return res.status(404).json({
        ok: false,
        error: 'Registro no encontrado',
        code: 'REGISTRO_NOT_FOUND'
      });
    }
    
    // Verificar que el visitante exista
    const visitor = await getVisitorById(visitor_id);
    if (!visitor) {
      return res.status(404).json({
        ok: false,
        error: 'Visitante no encontrado',
        code: 'VISITOR_NOT_FOUND'
      });
    }
    
    // Obtener el número de visitante (el siguiente disponible)
    const visitantes = await getVisitorsByRegistroId(registroId);
    const visitorNumber = visitantes.length + 1;
    
    // Generar etiqueta para el visitante
    const visitorTag = `${registro.registration_code}-V${String(visitantes.length + 1).padStart(2, '0')}`;
    
    // Añadir visitante al registro
    const nuevoVisitante = await addVisitorToRegistro({
      registro_id: registroId,
      visitor_id,
      visitor_number: visitorNumber,
      is_driver: is_driver || false,
      visitor_tag: visitorTag,
      tag_type: tag_type || 'etiqueta',
      card_number: tag_type === 'tarjeta' ? card_number : null
    });
    
    return res.status(201).json({
      ok: true,
      visitante: nuevoVisitante
    });
  } catch (error) {
    console.error('Error en addVisitanteToRegistro:', error);
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error al añadir visitante al registro',
      code: error.code || 'SERVER_ERROR'
    });
  }
}

/**
 * Actualiza la información de un visitante en un registro
 * PUT /registros/visitantes/:id
 */
async function updateVisitanteRegistro(req, res, next) {
  try {
    const visitanteId = parseInt(req.params.id, 10);
    const { tag_type, card_number } = req.body;
    
    // Actualizar visitante
    const visitanteActualizado = await updateRegistroVisitante(visitanteId, {
      tag_type,
      card_number: tag_type === 'tarjeta' ? card_number : null
    });
    
    return res.status(200).json({
      ok: true,
      visitante: visitanteActualizado
    });
  } catch (error) {
    console.error('Error en updateVisitanteRegistro:', error);
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error al actualizar visitante del registro',
      code: error.code || 'SERVER_ERROR'
    });
  }
}

/**
 * Elimina un visitante de un registro
 * DELETE /registros/visitantes/:id
 */
async function deleteVisitanteRegistro(req, res, next) {
  try {
    const visitanteId = parseInt(req.params.id, 10);
    
    // Eliminar visitante
    await deleteRegistroVisitante(visitanteId);
    
    return res.status(200).json({
      ok: true,
      message: 'Visitante eliminado del registro correctamente'
    });
  } catch (error) {
    console.error('Error en deleteVisitanteRegistro:', error);
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error al eliminar visitante del registro',
      code: error.code || 'SERVER_ERROR'
    });
  }
}

/**
 * Verifica si una tarjeta ya está en uso
 * GET /registros/check-card/:cardNumber
 */
async function checkCardNumberInUse(req, res, next) {
  try {
    const { cardNumber } = req.params;
    const excludeRegistroId = req.query.excludeRegistroId ? parseInt(req.query.excludeRegistroId, 10) : null;
    
    // Verificar si la tarjeta está en uso
    const cardInUse = await checkCardInUse(cardNumber, excludeRegistroId);
    
    return res.status(200).json({
      ok: true,
      inUse: !!cardInUse,
      registro: cardInUse
    });
  } catch (error) {
    console.error('Error en checkCardNumberInUse:', error);
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error al verificar tarjeta',
      code: error.code || 'SERVER_ERROR'
    });
  }
}

module.exports = {
  getVisitantesByRegistroId,
  addVisitanteToRegistro,
  updateVisitanteRegistro,
  deleteVisitanteRegistro,
  checkCardNumberInUse
};
