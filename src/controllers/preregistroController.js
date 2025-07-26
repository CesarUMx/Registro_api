const { 
  crearPreregistro, 
  obtenerPreregistros, 
  obtenerPreregistroPorId,
  obtenerPreregistroPorToken,
  actualizarEstadoToken,
  actualizarEstadoPreregistro,
  completarPreregistroConVisitantesYVehiculos
} = require('../models/preregistroModel');
const { checkRequiredFields, handleError, normalizeName, withTransaction } = require('../utils/controllerHelpers');

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

/**
 * Generar link único para preregistro
 */
async function postGenerarLinkUnico(req, res) {
  try {
    const {
      scheduled_entry_time,
      scheduled_exit_time,
      reason,
      email_visitante
    } = req.body;

    // Validar campos obligatorios
    checkRequiredFields(['scheduled_entry_time', 'scheduled_exit_time', 'reason', 'email_visitante'], req.body);

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email_visitante)) {
      const error = new Error('Formato de correo electrónico inválido');
      error.status = 400;
      throw error;
    }

    // Validar fechas
    const entryDate = new Date(scheduled_entry_time);
    const exitDate = new Date(scheduled_exit_time);
    
    if (entryDate >= exitDate) {
      const error = new Error('La fecha de entrada debe ser anterior a la fecha de salida');
      error.status = 400;
      throw error;
    }

    const now = new Date();
    const marginMs = 5 * 60 * 1000;
    const nowWithMargin = new Date(now.getTime() - marginMs);
    
    if (entryDate < nowWithMargin) {
      const error = new Error('La fecha de entrada debe ser futura');
      error.status = 400;
      throw error;
    }

    // Generar token único
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    
    // Crear preregistro parcial con token
    const resultado = await crearPreregistro({
      admin_id: req.user.userId,
      scheduled_entry_time,
      scheduled_exit_time,
      reason,
      visitantes: [],
      vehiculos: [],
      marbetes: [],
      token_unico: token,
      estado_token: 'pendiente' // pendiente, usado, expirado
    });

    // Enviar correo con link único e instrucciones
    try {
      const emailService = require('../services/emailService');
      const preregistroData = {
        codigo: resultado.preregistro.codigo,
        scheduled_entry_time,
        scheduled_exit_time,
        reason
      };
      
      await emailService.enviarLinkUnicoPreregistro(email_visitante, token, preregistroData);
      console.log('✅ Correo con link único enviado exitosamente');
    } catch (emailError) {
      console.error('❌ Error al enviar correo con link único:', emailError);
      // No lanzamos el error para que el preregistro se cree aunque falle el correo
    }

    res.status(201).json({
      ok: true,
      message: 'Link único generado y enviado por correo exitosamente',
      data: {
        token,
        codigo: resultado.preregistro.codigo,
        preregistro_id: resultado.preregistro.id,
        email_enviado: email_visitante
      }
    });

  } catch (error) {
    handleError(res, error, 'Error al generar link único');
  }
}

/**
 * Enviar preregistro completo por correo
 */
async function postEnviarPorCorreo(req, res) {
  console.log(' FUNCIÓN postEnviarPorCorreo EJECUTADA');
  console.log(' Datos recibidos:', {
    scheduled_entry_time: req.body.scheduled_entry_time,
    scheduled_exit_time: req.body.scheduled_exit_time, 
    reason: req.body.reason,
    visitantes_count: req.body.visitantes?.length || 0,
    vehiculos_count: req.body.vehiculos?.length || 0,
    email_visitante: req.body.email_visitante
  });
  
  try {
    const {
      scheduled_entry_time,
      scheduled_exit_time,
      reason,
      visitantes = [],
      vehiculos = [],
      email_visitante
    } = req.body;

    // Validar campos obligatorios
    checkRequiredFields(['scheduled_entry_time', 'scheduled_exit_time', 'reason', 'email_visitante'], req.body);

    // Validar fechas
    const entryDate = new Date(scheduled_entry_time);
    const exitDate = new Date(scheduled_exit_time);
    
    if (entryDate >= exitDate) {
      const error = new Error('La fecha de entrada debe ser anterior a la fecha de salida');
      error.status = 400;
      throw error;
    }

    const now = new Date();
    const marginMs = 5 * 60 * 1000;
    const nowWithMargin = new Date(now.getTime() - marginMs);
    
    if (entryDate < nowWithMargin) {
      const error = new Error('La fecha de entrada debe ser futura');
      error.status = 400;
      throw error;
    }

    // Crear preregistro completo
    const resultado = await crearPreregistro({
      admin_id: req.user.userId,
      scheduled_entry_time,
      scheduled_exit_time,
      reason,
      visitantes,
      vehiculos,
      marbetes: vehiculos.map(() => null) // Se asignarán después
    });

    // Obtener datos completos de visitantes y vehículos para el correo
    console.log('=== INICIO ENVÍO DE CORREO ===');
    console.log('Email destinatario:', email_visitante);
    console.log('Resultado completo:', resultado);
    console.log('Código preregistro:', resultado.preregistro?.codigo);
    console.log('IDs Visitantes:', visitantes);
    console.log('IDs Vehículos:', vehiculos);
    
    try {
      // Obtener datos completos de visitantes
      const { getVisitanteById } = require('../models/visitanteModel');
      const visitantesCompletos = [];
      for (const visitanteId of visitantes) {
        const visitante = await getVisitanteById(visitanteId);
        if (visitante) {
          visitantesCompletos.push(visitante);
        }
      }
      
      // Obtener datos completos de vehículos
      const { getVehiculoById } = require('../models/vehiculoModel');
      const vehiculosCompletos = [];
      for (const vehiculoId of vehiculos) {
        const vehiculo = await getVehiculoById(vehiculoId);
        if (vehiculo) {
          vehiculosCompletos.push(vehiculo);
        }
      }
      
      console.log('Visitantes completos:', visitantesCompletos.map(v => ({ id: v.id, nombre: v.nombre, empresa: v.empresa })));
      console.log('Vehículos completos:', vehiculosCompletos.map(v => ({ id: v.id, placa: v.placa })));
      
      const emailService = require('../services/emailService');
      const emailResult = await emailService.enviarPreregistroQR(email_visitante, resultado.preregistro, visitantesCompletos, vehiculosCompletos);
      console.log(' Correo enviado exitosamente:', emailResult.messageId);
    } catch (emailError) {
      console.error(' Error al enviar correo:', emailError.message);
      console.error('Stack trace:', emailError.stack);
      // No lanzamos el error para que el preregistro se cree aunque falle el correo
    }
    
    console.log('=== FIN ENVÍO DE CORREO ===');

    res.status(201).json({
      ok: true,
      message: 'Preregistro creado exitosamente',
      data: resultado.preregistro
    });

  } catch (error) {
    handleError(res, error, 'Error al enviar preregistro por correo');
  }
}

/**
 * Obtener preregistro por token único (público)
 */
async function getPreregistroPorToken(req, res) {
  try {
    const { token } = req.params;

    if (!token) {
      const error = new Error('Token requerido');
      error.status = 400;
      throw error;
    }

    // Buscar preregistro por token
    const preregistro = await obtenerPreregistroPorToken(token);
    
    if (!preregistro) {
      const error = new Error('Token inválido o expirado');
      error.status = 404;
      throw error;
    }

    // Verificar que el token no haya sido usado
    if (preregistro.estado_token === 'usado') {
      const error = new Error('Este link ya ha sido utilizado');
      error.status = 410; // Gone
      throw error;
    }

    // Verificar que no haya expirado (24 horas)
    const ahora = new Date();
    const fechaCreacion = new Date(preregistro.fecha_create);
    const horasTranscurridas = (ahora - fechaCreacion) / (1000 * 60 * 60);
    
    if (horasTranscurridas > 24) {
      const error = new Error('Este link ha expirado');
      error.status = 410; // Gone
      throw error;
    }

    res.status(200).json({
      ok: true,
      data: {
        codigo: preregistro.codigo,
        scheduled_entry_time: preregistro.scheduled_entry_time,
        scheduled_exit_time: preregistro.scheduled_exit_time,
        reason: preregistro.reason,
        token
      }
    });

  } catch (error) {
    handleError(res, error, 'Error al obtener preregistro');
  }
}

/**
 * Completar preregistro desde formulario público
 */
async function postCompletarPreregistro(req, res) {
  try {
    const { token } = req.params;
    const {
      visitante,
      vehiculo
    } = req.body;

    if (!token) {
      const error = new Error('Token requerido');
      error.status = 400;
      throw error;
    }

    // Buscar preregistro por token
    const preregistro = await obtenerPreregistroPorToken(token);
    
    if (!preregistro) {
      const error = new Error('Token inválido o expirado');
      error.status = 404;
      throw error;
    }

    // Verificar que el token no haya sido usado
    if (preregistro.estado_token === 'usado') {
      const error = new Error('Este link ya ha sido utilizado');
      error.status = 410;
      throw error;
    }

    // Verificar que no haya expirado
    const ahora = new Date();
    const fechaCreacion = new Date(preregistro.fecha_create);
    const horasTranscurridas = (ahora - fechaCreacion) / (1000 * 60 * 60);
    
    if (horasTranscurridas > 24) {
      const error = new Error('Este link ha expirado');
      error.status = 410;
      throw error;
    }

    // Validar que se proporcionen los IDs de visitantes y vehículos ya creados
    const { visitantes = [], vehiculos = [] } = req.body;

    if (!visitantes || visitantes.length === 0) {
      const error = new Error('Se requiere al menos un visitante');
      error.status = 400;
      throw error;
    }

    // Completar preregistro usando la función del modelo
    const resultado = await completarPreregistroConVisitantesYVehiculos({
      preregistro_id: preregistro.id,
      codigo_preregistro: preregistro.codigo,
      visitantes,
      vehiculos,
      token
    });

    // El token ya se marca como usado dentro de la función del modelo
    // No necesitamos llamar actualizarEstadoToken aquí

    res.status(200).json({
      ok: true,
      message: 'Preregistro completado exitosamente',
      data: {
        codigo: preregistro.codigo,
        visitantes_count: visitantes.length,
        vehiculos_count: vehiculos.length,
        preregistro_id: preregistro.id
      }
    });

  } catch (error) {
    handleError(res, error, 'Error al completar preregistro');
  }
}

/**
 * Buscar visitantes existentes (público)
 */
async function buscarVisitantesPublico(req, res) {
  try {
    const { token } = req.params;
    const { search } = req.query;

    // Validar que el token existe y es válido
    const preregistro = await obtenerPreregistroPorToken(token);
    if (!preregistro) {
      return res.status(404).json({
        ok: false,
        message: 'Token inválido o expirado'
      });
    }

    if (!search || search.length < 3) {
      return res.json({
        ok: true,
        results: []
      });
    }

    // Buscar visitantes por nombre (sin autenticación)
    const { searchVisitantes } = require('../models/visitanteModel');
    const visitantes = await searchVisitantes(search);

    res.json({
      ok: true,
      results: visitantes
    });
  } catch (error) {
    console.error('Error al buscar visitantes público:', error);
    handleError(res, error, 'Error al buscar visitantes');
  }
}

/**
 * Crear nuevo visitante (público)
 */
async function crearVisitantePublico(req, res) {
  try {
    const { token } = req.params;
    const { nombre, telefono, empresa, tipo } = req.body;

    // Validar que el token existe y es válido
    const preregistro = await obtenerPreregistroPorToken(token);
    if (!preregistro) {
      return res.status(404).json({
        ok: false,
        message: 'Token inválido o expirado'
      });
    }

    // Validar campos requeridos
    if (!nombre || !telefono) {
      return res.status(400).json({
        ok: false,
        message: 'Nombre y teléfono son requeridos'
      });
    }

    // Crear visitante
    const { createVisitante } = require('../models/visitanteModel');
    const nuevoVisitante = await createVisitante({
      nombre: normalizeName(nombre),
      telefono: telefono.trim(),
      empresa: empresa ? empresa.trim() : null,
      tipo: tipo || 'preregistro',
      foto_persona: null,
      foto_ine: req.files?.fotoIne?.[0]?.filename || null
    });

    res.json({
      ok: true,
      success: true,
      message: 'Visitante creado exitosamente',
      visitante: nuevoVisitante
    });
  } catch (error) {
    console.error('Error al crear visitante público:', error);
    handleError(res, error, 'Error al crear visitante');
  }
}

/**
 * Buscar vehículo por placa (público)
 */
async function buscarVehiculoPublico(req, res) {
  try {
    const { token } = req.params;
    const { placa } = req.query;

    // Validar que el token existe y es válido
    const preregistro = await obtenerPreregistroPorToken(token);
    if (!preregistro) {
      return res.status(404).json({
        ok: false,
        message: 'Token inválido o expirado'
      });
    }

    if (!placa) {
      return res.status(400).json({
        ok: false,
        message: 'Placa es requerida'
      });
    }

    // Buscar vehículo por placa
    const { searchVehiculoByPlaca } = require('../models/vehiculoModel');
    const vehiculo = await searchVehiculoByPlaca(placa.toUpperCase());

    res.json({
      ok: true,
      success: true,
      vehiculo: vehiculo
    });
  } catch (error) {
    console.error('Error al buscar vehículo público:', error);
    handleError(res, error, 'Error al buscar vehículo');
  }
}

/**
 * Crear nuevo vehículo (público)
 */
async function crearVehiculoPublico(req, res) {
  try {
    const { token } = req.params;
    const { placa } = req.body;

    // Validar que el token existe y es válido
    const preregistro = await obtenerPreregistroPorToken(token);
    if (!preregistro) {
      return res.status(404).json({
        ok: false,
        message: 'Token inválido o expirado'
      });
    }

    // Validar campos requeridos
    if (!placa) {
      return res.status(400).json({
        ok: false,
        message: 'Placa es requerida'
      });
    }

    // Crear vehículo
    const { createVehiculo } = require('../models/vehiculoModel');
    const nuevoVehiculo = await createVehiculo({
      placa: placa.toUpperCase().trim(),
      foto_placa: req.files?.fotoPlaca?.[0]?.filename || null
    });

    res.json({
      ok: true,
      success: true,
      message: 'Vehículo creado exitosamente',
      vehiculo: nuevoVehiculo
    });
  } catch (error) {
    console.error('Error al crear vehículo público:', error);
    handleError(res, error, 'Error al crear vehículo');
  }
}

module.exports = {
  postCrearPreregistro,
  getPreregistros,
  getPreregistroPorId,
  postGenerarLinkUnico,
  postEnviarPorCorreo,
  getPreregistroPorToken,
  postCompletarPreregistro,
  patchEstadoPreregistro,
  buscarVisitantesPublico,
  crearVisitantePublico,
  buscarVehiculoPublico,
  crearVehiculoPublico
};
