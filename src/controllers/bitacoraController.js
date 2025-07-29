const { obtenerBitacoraPreregistro } = require('../models/bitacoraModel');
const { handleError } = require('../utils/controllerHelpers');

/**
 * Obtener todos los registros de bitácora para un preregistro específico
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
async function getBitacoraPreregistro(req, res) {
  try {
    const { id } = req.params;
    
    if (!id) {
      const error = new Error('ID de preregistro no proporcionado');
      error.status = 400;
      throw error;
    }
    
    const bitacora = await obtenerBitacoraPreregistro(id);
    
    res.status(200).json({
      success: true,
      data: bitacora
    });
  } catch (error) {
    handleError(res, error);
  }
}

module.exports = {
  getBitacoraPreregistro
};
