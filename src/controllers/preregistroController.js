const { 
  crearPreregistro, 
  obtenerPreregistros, 
  obtenerPreregistroPorId,
  actualizarEstadoPreregistro 
} = require('../models/preregistroModel');
const { checkRequiredFields, handleError } = require('../utils/controllerHelpers');

/**
 * Crear un nuevo preregistro
 */
async function postCrearPreregistro(req, res) {
  try {
    const {
      scheduled_entry_time,
      scheduled_exit_time,
      reason,
      visitantes = [],
      vehiculos = []
    } = req.body;

    // Validar campos obligatorios
    checkRequiredFields(['scheduled_entry_time', 'scheduled_exit_time', 'reason'], req.body);

    // Validar que la fecha de entrada sea anterior a la de salida
    const entryDate = new Date(scheduled_entry_time);
    const exitDate = new Date(scheduled_exit_time);
    
    if (entryDate >= exitDate) {
      const error = new Error('La fecha de entrada debe ser anterior a la fecha de salida');
      error.status = 400;
      throw error;
    }

    // Validar que las fechas sean futuras (con margen de 5 minutos para diferencias de zona horaria)
    const now = new Date();
    const marginMs = 5 * 60 * 1000; // 5 minutos en milisegundos
    const nowWithMargin = new Date(now.getTime() - marginMs);
    
    if (entryDate < nowWithMargin) {
      const error = new Error('La fecha de entrada debe ser futura');
      error.status = 400;
      throw error;
    }

    const resultado = await crearPreregistro({
      admin_id: req.user.userId,
      scheduled_entry_time,
      scheduled_exit_time,
      reason,
      visitantes,
      vehiculos
    });

    res.status(201).json({
      ok: true,
      message: 'Preregistro creado exitosamente',
      data: resultado.preregistro
    });

  } catch (error) {
    console.error('Error en postCrearPreregistro:', {
      message: error.message,
      code: error.code,
      status: error.status,
      userId: req.user?.userId,
      body: req.body,
      stack: error.stack
    });
    
    // Manejar errores específicos
    if (error.code === 'INVALID_REFERENCE') {
      return res.status(400).json({
        ok: false,
        error: 'Datos inválidos: algunos visitantes o vehículos seleccionados no existen',
        code: error.code
      });
    }
    
    if (error.code === 'DUPLICATE_PREREGISTRO') {
      return res.status(409).json({
        ok: false,
        error: 'Ya existe un preregistro similar con estos datos',
        code: error.code
      });
    }
    
    if (error.code === 'DATABASE_ERROR') {
      return res.status(500).json({
        ok: false,
        error: 'Error interno del servidor al crear el preregistro',
        code: error.code
      });
    }
    
    // Error de validación
    if (error.status && error.status < 500) {
      return res.status(error.status).json({
        ok: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR'
      });
    }
    
    // Error genérico del servidor
    return res.status(500).json({
      ok: false,
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
}

/**
 * Obtener lista de preregistros con paginación
 */
async function getPreregistros(req, res) {
  try {
    const {
      start = 0,
      length = 10,
      search = '',
      status = ''
    } = req.body;

    // Si el usuario es admin, solo mostrar sus propios preregistros
    let admin_id = null;
    if (req.user.role === 'admin') {
      admin_id = req.user.userId;
    }

    const resultado = await obtenerPreregistros({
      start: parseInt(start),
      length: parseInt(length),
      search: search?.value || search || '',
      status,
      admin_id // Pasar el admin_id para filtrar
    });

    res.json({
      ok: true,
      data: resultado.data,
      recordsTotal: resultado.recordsTotal,
      recordsFiltered: resultado.recordsFiltered
    });

  } catch (error) {
    console.error('Error en getPreregistros:', {
      message: error.message,
      code: error.code,
      userId: req.user?.userId,
      params: req.body
    });
    
    return res.status(500).json({
      ok: false,
      error: 'Error al obtener la lista de preregistros',
      code: error.code || 'QUERY_ERROR'
    });
  }
}

/**
 * Obtener preregistro por ID
 */
async function getPreregistroPorId(req, res) {
  try {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id))) {
      const error = new Error('ID de preregistro inválido');
      error.status = 400;
      throw error;
    }

    const preregistro = await obtenerPreregistroPorId(parseInt(id));

    if (!preregistro) {
      const error = new Error('Preregistro no encontrado');
      error.status = 404;
      throw error;
    }

    res.json({
      ok: true,
      data: preregistro
    });

  } catch (error) {
    console.error('Error en getPreregistroPorId:', {
      message: error.message,
      code: error.code,
      userId: req.user?.userId,
      preregistroId: req.params.id
    });
    
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        ok: false,
        error: 'Preregistro no encontrado',
        code: error.code
      });
    }
    
    return res.status(500).json({
      ok: false,
      error: 'Error al obtener el preregistro',
      code: error.code || 'QUERY_ERROR'
    });
  }
}

/**
 * Actualizar estado de preregistro
 */
async function patchEstadoPreregistro(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validar campos obligatorios
    checkRequiredFields(['status'], req.body);

    // Validar que el ID sea válido
    if (!id || isNaN(parseInt(id))) {
      const error = new Error('ID de preregistro inválido');
      error.status = 400;
      throw error;
    }

    // Validar estados permitidos
    const estadosPermitidos = ['pendiente', 'activo', 'finalizado', 'cancelado'];
    if (!estadosPermitidos.includes(status)) {
      const error = new Error(`Estado inválido. Estados permitidos: ${estadosPermitidos.join(', ')}`);
      error.status = 400;
      throw error;
    }

    const preregistroActualizado = await actualizarEstadoPreregistro(
      parseInt(id), 
      status, 
      req.user.userId
    );

    res.json({
      ok: true,
      message: 'Estado del preregistro actualizado exitosamente',
      data: preregistroActualizado
    });

  } catch (error) {
    console.error('Error en patchEstadoPreregistro:', {
      message: error.message,
      code: error.code,
      userId: req.user?.userId,
      preregistroId: req.params.id,
      newStatus: req.body.status
    });
    
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        ok: false,
        error: 'Preregistro no encontrado',
        code: error.code
      });
    }
    
    if (error.status && error.status < 500) {
      return res.status(error.status).json({
        ok: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR'
      });
    }
    
    return res.status(500).json({
      ok: false,
      error: 'Error al actualizar el estado del preregistro',
      code: error.code || 'UPDATE_ERROR'
    });
  }
}

module.exports = {
  postCrearPreregistro,
  getPreregistros,
  getPreregistroPorId,
  patchEstadoPreregistro
};
