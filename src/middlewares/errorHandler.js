// src/middlewares/errorHandler.js
const { resError } = require('../utils/response');

/**
 * Captura errores lanzados con next(err) o excepciones no atrapadas.
 */
function errorHandler(err, req, res, next) {
  console.error(err);  // log para debugging
  // Si el controlador ya incluyó status en err.status, úsalo
  const status = err.statusCode || err.status || 500;
  const message = err.message || 'Error interno del servidor';
  return resError(res, message, status);
}

module.exports = errorHandler;
