const { obtenerBitacoraPreregistro, crearRegistroBitacora, getUltimoEvento } = require('../models/bitacoraModel');
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
      ok: true,
      data: bitacora
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * Obtener el último evento registrado para una combinación de preregistro, visitante y/o vehículo
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
async function getUltimoEventoRegistrado(req, res) {
  try {
    const { preregistro_id, visitante_id, vehiculo_id } = req.query;
    
    // Validar que al menos uno de los parámetros esté presente
    if (!preregistro_id && !visitante_id && !vehiculo_id) {
      return res.status(400).json({
        ok: false,
        message: 'Se requiere al menos un parámetro de búsqueda (preregistro_id, visitante_id o vehiculo_id)'
      });
    }
    
    // Convertir los IDs a números si están presentes
    const params = {};
    if (preregistro_id) params.preregistro_id = parseInt(preregistro_id, 10);
    if (visitante_id) params.visitante_id = parseInt(visitante_id, 10);
    if (vehiculo_id) params.vehiculo_id = parseInt(vehiculo_id, 10);
    
    const ultimoEvento = await getUltimoEvento(params);
    
    res.status(200).json({
      ok: true,
      data: ultimoEvento
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * Registrar un nuevo evento en la bitácora de preregistros
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
async function registrarEvento(req, res) {
  try {
    const { preregistro_id, visitante_id, vehiculo_id, notas } = req.body;
    const tipo = req.user.guard_type;
    
    // Obtener el último evento para validar la transición
    const params = {};
    if (preregistro_id) params.preregistro_id = preregistro_id;
    if (visitante_id) params.visitante_id = visitante_id;
    if (vehiculo_id) params.vehiculo_id = vehiculo_id;
    
    const ultimoEvento = await getUltimoEvento(params);
    
    // Validar la transición de estados
    let siguienteEstado = '';

    if (tipo === 'caseta') {
      if (ultimoEvento && ultimoEvento.tipo_evento === 'entrada_caseta') {
        siguienteEstado = 'salida_caseta';
      } else if (ultimoEvento && ultimoEvento.tipo_evento === 'salida_caseta') {
        siguienteEstado = 'entrada_caseta';
      } else if (ultimoEvento && ultimoEvento.tipo_evento === 'salida_edificio') {
        siguienteEstado = 'salida_caseta';
      } else {
        siguienteEstado = 'null';
      }
    } else if (tipo === 'entrada') {
      if (ultimoEvento && ultimoEvento.tipo_evento === 'entrada_edificio') {
        siguienteEstado = 'salida_edificio';
      } else if (ultimoEvento && ultimoEvento.tipo_evento === 'salida_edificio') {
        siguienteEstado = 'entrada_edificio';
      } else if (ultimoEvento && ultimoEvento.tipo_evento === 'entrada_caseta') {
        siguienteEstado = 'entrada_edificio';
      } else {
        siguienteEstado = 'null';
      }
    }

    if (siguienteEstado === 'null') {
      return res.status(400).json({
        ok: false,
        error: 'No se puede registrar un evento'
      });
    }
    
    // Crear el registro en la bitácora
    const nuevoRegistro = await crearRegistroBitacora({
      preregistro_id,
      visitante_id,
      vehiculo_id,
      tipo_evento: siguienteEstado,
      usuario_id: req.user.userId,
      detalles: notas || ''
    });
    
    res.status(201).json({
      ok: true,
      message: 'Evento registrado correctamente',
      data: nuevoRegistro
    });
  } catch (error) {
    handleError(res, error);
  }
}

module.exports = {
  getBitacoraPreregistro,
  getUltimoEventoRegistrado,
  registrarEvento
};
