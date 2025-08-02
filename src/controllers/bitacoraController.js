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
    const { preregistro_id, tipo_evento, visitante_id, vehiculo_id, guardia_id, timestamp, notas } = req.body;
    
    // Validar campos obligatorios
    if (!preregistro_id || !tipo_evento || !guardia_id) {
      return res.status(400).json({
        ok: false,
        message: 'Los campos preregistro_id, tipo_evento y guardia_id son obligatorios'
      });
    }
    
    // Validar que al menos uno de visitante_id o vehiculo_id esté presente
    if (!visitante_id && !vehiculo_id) {
      return res.status(400).json({
        ok: false,
        message: 'Se requiere al menos uno de los campos visitante_id o vehiculo_id'
      });
    }
    
    // Validar que el tipo de evento sea válido
    const tiposEventoValidos = ['entrada_caseta', 'salida_caseta', 'entrada_edificio', 'salida_edificio'];
    if (!tiposEventoValidos.includes(tipo_evento)) {
      return res.status(400).json({
        ok: false,
        message: `Tipo de evento no válido. Valores permitidos: ${tiposEventoValidos.join(', ')}`
      });
    }
    
    // Obtener el último evento para validar la transición
    const params = {};
    if (preregistro_id) params.preregistro_id = preregistro_id;
    if (visitante_id) params.visitante_id = visitante_id;
    if (vehiculo_id) params.vehiculo_id = vehiculo_id;
    
    const ultimoEvento = await getUltimoEvento(params);
    
    // Validar la transición de estados
    let transicionValida = true;
    let mensajeError = '';
    
    if (ultimoEvento) {
      switch (ultimoEvento.tipo_evento) {
        case 'entrada_caseta':
          // Después de entrada_caseta puede ser salida_caseta o entrada_edificio
          if (tipo_evento !== 'salida_caseta' && tipo_evento !== 'entrada_edificio') {
            transicionValida = false;
            mensajeError = 'Después de entrada_caseta solo puede registrarse salida_caseta o entrada_edificio';
          }
          break;
        case 'salida_caseta':
          // Después de salida_caseta solo puede ser entrada_caseta
          if (tipo_evento !== 'entrada_caseta') {
            transicionValida = false;
            mensajeError = 'Después de salida_caseta solo puede registrarse entrada_caseta';
          }
          break;
        case 'entrada_edificio':
          // Después de entrada_edificio solo puede ser salida_edificio
          if (tipo_evento !== 'salida_edificio') {
            transicionValida = false;
            mensajeError = 'Después de entrada_edificio solo puede registrarse salida_edificio';
          }
          break;
        case 'salida_edificio':
          // Después de salida_edificio puede ser entrada_edificio o salida_caseta
          if (tipo_evento !== 'entrada_edificio' && tipo_evento !== 'salida_caseta') {
            transicionValida = false;
            mensajeError = 'Después de salida_edificio solo puede registrarse entrada_edificio o salida_caseta';
          }
          break;
      }
    } else if (tipo_evento !== 'entrada_caseta') {
      // Si no hay evento previo, solo puede ser entrada_caseta
      transicionValida = false;
      mensajeError = 'El primer evento debe ser entrada_caseta';
    }
    
    if (!transicionValida) {
      return res.status(400).json({
        ok: false,
        message: mensajeError,
        ultimoEvento
      });
    }
    
    // Crear el registro en la bitácora
    const nuevoRegistro = await crearRegistroBitacora({
      preregistro_id,
      visitante_id,
      vehiculo_id,
      tipo_evento,
      usuario_id: guardia_id,
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
