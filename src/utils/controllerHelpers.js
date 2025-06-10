// src/utils/controllerHelpers.js
const pool = require('../config/db');

/**
 * Ejecuta una función dentro de una transacción de base de datos
 * @param {Function} callback - Función a ejecutar dentro de la transacción
 * @returns {Promise<any>} - Resultado de la función callback
 */
async function withTransaction(callback) {
  try {
    await pool.query('BEGIN');
    const result = await callback();
    await pool.query('COMMIT');
    return result;
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

/**
 * Valida que el tipo de guardia sea uno de los permitidos
 * @param {Object} user - Usuario actual
 * @param {Array<string>} allowedTypes - Tipos de guardia permitidos
 * @param {number} statusCode - Código de estado HTTP en caso de error
 * @throws {Error} Si el tipo de guardia no está permitido
 */
function validateGuardType(user, allowedTypes, statusCode = 403) {
  if (!allowedTypes.includes(user.guard_type)) {
    const error = new Error(`Solo los guardias de tipo ${allowedTypes.join(', ')} pueden realizar esta acción`);
    error.status = statusCode;
    error.code = 'UNAUTHORIZED_GUARD_TYPE';
    throw error;
  }
}

/**
 * Maneja errores de manera estándar para respuestas HTTP
 * @param {Object} res - Objeto de respuesta Express
 * @param {Error} error - Error a manejar
 * @returns {Object} Respuesta HTTP con el error formateado
 */
function handleError(res, error) {
  console.error('Error:', error);
  return res.status(error.status || 500).json({
    ok: false,
    error: error.message || 'Error interno del servidor',
    code: error.code || 'SERVER_ERROR'
  });
}

module.exports = {
  withTransaction,
  validateGuardType,
  handleError
};
