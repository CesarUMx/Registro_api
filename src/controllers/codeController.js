const { getDriverByTag } = require('../models/driverModel');
const { getVisitorByTag } = require('../models/visitorModel');
const { getRegistroByCode } = require('../models/registroModel');
const { generateDriverTag, generateVisitorTag } = require('../utils/codeGenerator');

/**
 * Busca información por código (conductor, visitante o registro)
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 */
async function getInfoByCode(req, res) {
  try {
    const { code } = req.params;
    
    if (!code) {
      return res.status(400).json({
        ok: false,
        error: 'El código es requerido',
        code: 'CODE_REQUIRED'
      });
    }
    
    // Verificar si es un código de conductor (termina en -CND)
    if (code.endsWith('-CND')) {
      const driver = await getDriverByTag(code);
      if (driver) {
        return res.status(200).json({
          ok: true,
          type: 'driver',
          data: driver
        });
      }
    }
    
    // Verificar si es un código de visitante (formato -V01, -V02, etc.)
    if (code.match(/-V\d+$/)) {
      const visitor = await getVisitorByTag(code);
      if (visitor) {
        return res.status(200).json({
          ok: true,
          type: 'visitor',
          data: visitor
        });
      }
    }
    
    // Verificar si es un código de registro
    const registro = await getRegistroByCode(code);
    if (registro) {
      return res.status(200).json({
        ok: true,
        type: 'registro',
        data: registro
      });
    }
    
    // Si no se encontró ninguna coincidencia
    return res.status(404).json({
      ok: false,
      error: 'No se encontró información para el código proporcionado',
      code: 'CODE_NOT_FOUND'
    });
  } catch (error) {
    console.error('Error en getInfoByCode:', error);
    return res.status(500).json({
      ok: false,
      error: 'Error al buscar información por código',
      code: 'SERVER_ERROR'
    });
  }
}

/**
 * Valida si un código es válido (existe en el sistema)
 * @param {Object} req - Request de Express
 * @param {Object} res - Response de Express
 */
async function validateCode(req, res) {
  try {
    const { code } = req.params;
    
    if (!code) {
      return res.status(400).json({
        ok: false,
        error: 'El código es requerido',
        code: 'CODE_REQUIRED'
      });
    }
    
    let isValid = false;
    let type = null;
    
    // Verificar si es un código de conductor
    if (code.endsWith('-CND')) {
      const driver = await getDriverByTag(code);
      if (driver) {
        isValid = true;
        type = 'driver';
      }
    }
    // Verificar si es un código de visitante
    else if (code.match(/-V\d+$/)) {
      const visitor = await getVisitorByTag(code);
      if (visitor) {
        isValid = true;
        type = 'visitor';
      }
    }
    // Verificar si es un código de registro
    else {
      const registro = await getRegistroByCode(code);
      if (registro) {
        isValid = true;
        type = 'registro';
      }
    }
    
    return res.status(200).json({
      ok: true,
      isValid,
      type
    });
  } catch (error) {
    console.error('Error en validateCode:', error);
    return res.status(500).json({
      ok: false,
      error: 'Error al validar el código',
      code: 'SERVER_ERROR'
    });
  }
}

module.exports = {
  getInfoByCode,
  validateCode
};
