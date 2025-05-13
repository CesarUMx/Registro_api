// src/utils/response.js

/**
 * Envía respuesta de éxito unificada.
 * @param {Response} res - objeto Express response
 * @param {any} data - payload de datos
 * @param {number} status - código HTTP (por defecto 200)
 */
function resSuccess(res, data, status = 200) {
    return res.status(status).json({ ok: true, data });
  }
  
  /**
   * Envía respuesta de error unificada.
   * @param {Response} res - objeto Express response
   * @param {string|Error} error - mensaje o Error
   * @param {number} status - código HTTP (por defecto 500)
   */
  function resError(res, error, status = 500) {
    const message = error instanceof Error ? error.message : error;
    return res.status(status).json({ ok: false, error: message });
  }
  
  module.exports = { resSuccess, resError };
  