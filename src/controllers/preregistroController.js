const { 
  getPreregistroById,
  obtenerPreregistros,
  obtenerPreregistroPorId,
  obtenerPreregistroPorCodigo,
  obtenerVisitantePreregistro,
  obtenerVehiculoPreregistro,
  crearPreregistro,
  obtenerPreregistroPorToken,
  completarPreregistroConVisitantesYVehiculos,
  actualizarEstadoPreregistro,
  verificarFotosFaltantes,
  cargarFotoVisitante,
  cargarFotoVehiculo,
  iniciarPreregistroMultiple,
  obtenerEtiquetasVisitantes
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
      error.message = 'La fecha de entrada debe ser anterior a la fecha de salida';
      throw error;
    }

    // Validar que las fechas sean futuras (con margen de 5 minutos para diferencias de zona horaria)
    const now = new Date();
    const marginMs = 5 * 60 * 1000; // 5 minutos en milisegundos
    const nowWithMargin = new Date(now.getTime() - marginMs);
    
    if (entryDate < nowWithMargin) {
      const error = new Error('La fecha de entrada debe ser futura');
      error.status = 400;
      error.message = 'La fecha de entrada debe ser futura';
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
        message: error.message,
        code: error.code
      });
    }
    
    if (error.code === 'DUPLICATE_PREREGISTRO') {
      return res.status(409).json({
        ok: false,
        error: 'Ya existe un preregistro similar con estos datos',
        message: error.message,
        code: error.code
      });
    }
    
    if (error.code === 'DATABASE_ERROR') {
      return res.status(500).json({
        ok: false,
        error: 'Error interno del servidor al crear el preregistro',
        message: error.message,
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

    // Filtrar cancelados según el rol
    // ADMIN y GUARDIA no ven cancelados, solo SYSADMIN los ve
    let excludeCanceled = false;
    if (req.user.role === 'admin' || req.user.role === 'guardia') {
      excludeCanceled = true;
    }

    const resultado = await obtenerPreregistros({
      start: parseInt(start),
      length: parseInt(length),
      search: search?.value || search || '',
      status,
      admin_id, // Pasar el admin_id para filtrar
      excludeCanceled // Excluir cancelados para admin y guardia
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

/**
 * Iniciar preregistro parcial con visitantes y vehículos seleccionados
 */
async function patchIniciarPreregistro(req, res) {
  try {
    const { id } = req.params;
    const { visitantes, vehiculos = [] } = req.body;
    
    console.log('Datos recibidos para iniciar preregistro:', { id, visitantes, vehiculos });
    
    // Validar que se proporcionen visitantes o vehículos
    if ((!visitantes || !Array.isArray(visitantes) || visitantes.length === 0) && 
        (!vehiculos || !Array.isArray(vehiculos) || vehiculos.length === 0)) {
      return res.status(400).json({ 
        ok: false, 
        message: 'Se requiere al menos un visitante o un vehículo para iniciar el preregistro' 
      });
    }

    // Obtener el preregistro para verificar la hora de entrada programada
    const preregistro = await obtenerPreregistroPorId(parseInt(id));
    if (!preregistro) {
      return res.status(404).json({
        ok: false,
        message: 'Preregistro no encontrado'
      });
    }

    // Verificar que el preregistro no esté cancelado o completado
    if (preregistro.status === 'cancelado') {
      return res.status(400).json({
        ok: false,
        message: 'No se puede iniciar un preregistro cancelado'
      });
    }

    if (preregistro.status === 'completado') {
      return res.status(400).json({
        ok: false,
        message: 'Este preregistro ya fue completado'
      });
    }

    // Verificar que la hora actual no sea menor a 15 minutos antes de la hora de entrada programada
    const now = new Date();
    const scheduledEntryTime = new Date(preregistro.scheduled_entry_time);
    const minTimeBeforeEntry = new Date(scheduledEntryTime.getTime() - (15 * 60 * 1000)); // 15 minutos antes

    if (now < minTimeBeforeEntry) {
      return res.status(400).json({
        ok: false,
        message: 'No se puede iniciar el preregistro hasta 15 minutos antes de la hora de entrada programada',
        scheduledEntryTime: preregistro.scheduled_entry_time,
        currentTime: now.toISOString(),
        earliestAllowedTime: minTimeBeforeEntry.toISOString()
      });
    }

    // Verificar si tenemos un ID de guardia válido
    const guardiaId = req.user && req.user.id ? req.user.id : 1; // Usar 1 como ID por defecto si no hay usuario
    console.log('ID de guardia utilizado:', guardiaId);
    
    // 1. Iniciar el preregistro parcial con visitantes y vehículos seleccionados
    const resultado = await iniciarPreregistroMultiple(
      id,
      visitantes || [],
      vehiculos || [],
      guardiaId
    );
    
    // 2. Obtener datos actualizados del preregistro
    const preregistroCompleto = await getPreregistroById(id);
    
    // 3. Obtener las etiquetas generadas para los visitantes
    let visitantesConEtiquetas = [];
    if (visitantes && visitantes.length > 0) {
      visitantesConEtiquetas = await obtenerEtiquetasVisitantes(id, visitantes);
    }
    
    res.json({
      ok: true,
      message: 'Preregistro iniciado exitosamente (parcial)',
      data: {
        ...preregistroCompleto,
        resultadosVisitantes: resultado.resultadosVisitantes,
        resultadosVehiculos: resultado.resultadosVehiculos,
        visitantesConEtiquetas
      }
    });
    
  } catch (error) {
    console.error('Error al iniciar preregistro:', error);
    res.status(500).json({
      ok: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
}

/**
 * Verificar qué fotos faltan para iniciar un preregistro
 */
async function getVerificarFotosFaltantes(req, res) {
try {
    const { id } = req.params;
    
    const resultado = await verificarFotosFaltantes(id);
    
    // Verificar si hay error de visitantes faltantes
    if (resultado.error === 'NO_VISITANTES') {
      return res.status(400).json({
        ok: false,
        error: 'NO_VISITANTES',
        message: resultado.message
      });
    }
    
    res.json({
      ok: true,
      data: resultado
    });
    
  } catch (error) {
    console.error('Error al verificar fotos faltantes:', error);
    res.status(500).json({
      ok: false,
      message: 'Error interno del servidor',
      error: error.message
    });
  }
}

/**
 * Cargar fotos de visitante (foto_persona y/o foto_ine)
 */
async function postCargarFotoVisitante(req, res) {
  try {
    console.log('👤 [BACKEND] Recibiendo solicitud de carga de fotos de visitante');
    console.log('💶 req.body:', req.body);
    console.log('📁 req.files:', req.files);
    
    const { visitante_id, foto_persona_nombre, foto_ine_nombre } = req.body;
    
    if (!visitante_id) {
      console.log('❌ Error: visitante_id faltante');
      const error = new Error('ID de visitante es requerido');
      error.status = 400;
      throw error;
    }

    const fotos = {};
    
    // Verificar foto de persona (archivo o nombre capturado)
    if (foto_persona_nombre) {
      console.log('📷 Usando foto de persona capturada:', foto_persona_nombre);
      fotos.foto_persona = foto_persona_nombre;
    } else if (req.files && req.files.foto_persona) {
      console.log('📁 Usando archivo de foto de persona subido:', req.files.foto_persona[0].filename);
      fotos.foto_persona = req.files.foto_persona[0].filename;
    }
    
    // Verificar foto de INE (archivo o nombre capturado)
    if (foto_ine_nombre) {
      console.log('📷 Usando foto de INE capturada:', foto_ine_nombre);
      fotos.foto_ine = foto_ine_nombre;
    } else if (req.files && req.files.foto_ine) {
      console.log('📁 Usando archivo de foto de INE subido:', req.files.foto_ine[0].filename);
      fotos.foto_ine = req.files.foto_ine[0].filename;
    }

    // Verificar que se haya enviado al menos una foto
    if (!fotos.foto_persona && !fotos.foto_ine) {
      console.log('❌ Error: No se encontró ninguna foto');
      console.log('req.body:', req.body);
      console.log('req.files:', req.files);
      const error = new Error('Debe enviar al menos una foto (foto_persona o foto_ine)');
      error.status = 400;
      throw error;
    }

    console.log('💾 Guardando fotos:', fotos);
    const visitanteActualizado = await cargarFotoVisitante(visitante_id, fotos);

    res.status(200).json({
      ok: true,
      message: 'Fotos de visitante cargadas exitosamente',
      visitante: visitanteActualizado
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * Cargar foto de placa de vehículo
 */
async function postCargarFotoVehiculo(req, res) {
  try {
    console.log('🚗 [BACKEND] Recibiendo solicitud de carga de foto de vehículo');
    console.log('💶 req.body:', req.body);
    console.log('📁 req.file:', req.file);
    console.log('📁 req.files:', req.files);
    
    const { vehiculo_id } = req.body;
    
    console.log('🔑 vehiculo_id recibido:', vehiculo_id);
    
    if (!vehiculo_id) {
      console.log('❌ Error: vehiculo_id faltante');
      const error = new Error('ID de vehículo es requerido');
      error.status = 400;
      throw error;
    }
    
    let fotoPlaca;
    
    // Verificar si se envió un archivo o un nombre de archivo capturado
    if (req.body.foto_placa_nombre) {
      // Foto capturada con WebRTC
      console.log('📷 Usando foto capturada:', req.body.foto_placa_nombre);
      fotoPlaca = req.body.foto_placa_nombre;
    } else if (req.file) {
      // Cuando usamos upload.single, el archivo está en req.file
      console.log('📁 Usando archivo subido:', req.file.filename);
      fotoPlaca = req.file.filename;
    } else {
      console.log('❌ Error: No se encontró foto ni archivo');
      console.log('req.body:', req.body);
      console.log('req.file:', req.file);
      console.log('req.files:', req.files);
      const error = new Error('Debe enviar la foto de la placa o el nombre del archivo capturado');
      error.status = 400;
      throw error;
    }

    const vehiculoActualizado = await cargarFotoVehiculo(vehiculo_id, fotoPlaca);

    res.status(200).json({
      ok: true,
      message: 'Foto de placa cargada exitosamente',
      vehiculo: vehiculoActualizado
    });
  } catch (error) {
    handleError(res, error);
  }
}

/**
 * Obtener preregistro por código
 */
async function getPreregistroPorCodigo(req, res) {
  try {
    const { codigo } = req.params;

    if (!codigo) {
      const error = new Error('Código de preregistro inválido');
      error.status = 400;
      throw error;
    }

    const preregistro = await obtenerPreregistroPorCodigo(codigo);

    res.json({
      ok: true,
      data: preregistro
    });

  } catch (error) {
    console.error('Error en getPreregistroPorCodigo:', {
      message: error.message,
      code: error.code,
      userId: req.user?.userId,
      codigo: req.params.codigo
    });
    
    if (error.status === 404) {
      return res.status(404).json({
        ok: false,
        error: `No se encontró el preregistro con código ${req.params.codigo}`,
        code: 'NOT_FOUND'
      });
    }
    
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error al obtener el preregistro',
      code: error.code || 'QUERY_ERROR'
    });
  }
}

/**
 * Obtener visitante específico de un preregistro por su número
 */
async function getVisitantePreregistro(req, res) {
  try {
    const { id, numero } = req.params;
    
    if (!id || isNaN(parseInt(id))) {
      const error = new Error('ID de preregistro inválido');
      error.status = 400;
      throw error;
    }
    
    if (!numero) {
      const error = new Error('Número de visitante inválido');
      error.status = 400;
      throw error;
    }
    
    const visitante = await obtenerVisitantePreregistro(parseInt(id), numero);
    
    res.json({
      ok: true,
      data: visitante
    });
    
  } catch (error) {
    console.error('Error en getVisitantePreregistro:', {
      message: error.message,
      code: error.code,
      userId: req.user?.userId,
      preregistroId: req.params.id,
      numeroVisitante: req.params.numero
    });
    
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error al obtener el visitante',
      code: error.code || 'QUERY_ERROR'
    });
  }
}

/**
 * Obtener vehículo específico de un preregistro por su número
 */
async function getVehiculoPreregistro(req, res) {
  try {
    const { id, numero } = req.params;
    
    if (!id || isNaN(parseInt(id))) {
      const error = new Error('ID de preregistro inválido');
      error.status = 400;
      throw error;
    }
    
    if (!numero) {
      const error = new Error('Número de vehículo inválido');
      error.status = 400;
      throw error;
    }
    
    const vehiculo = await obtenerVehiculoPreregistro(parseInt(id), numero);
    
    res.json({
      ok: true,
      data: vehiculo
    });
    
  } catch (error) {
    console.error('Error en getVehiculoPreregistro:', {
      message: error.message,
      code: error.code,
      userId: req.user?.userId,
      preregistroId: req.params.id,
      numeroVehiculo: req.params.numero
    });
    
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error al obtener el vehículo',
      code: error.code || 'QUERY_ERROR'
    });
  }
}

/**
 * Obtener conteo de preregistros pendientes
 */
async function getPreregistrosPendientesCount(req, res) {
  try {
    const pool = require('../config/db');
    const query = `
      SELECT COUNT(*) as count 
      FROM preregistros 
      WHERE status IN ('pendiente', 'listo')
    `;
    
    const result = await pool.query(query);
    
    res.status(200).json({
      ok: true,
      count: parseInt(result.rows[0].count)
    });
  } catch (error) {
    console.error('Error en getPreregistrosPendientesCount:', {
      message: error.message,
      code: error.code,
      userId: req.user?.userId
    });
    
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error al obtener el conteo de preregistros pendientes',
      code: error.code || 'QUERY_ERROR'
    });
  }
}

/**
 * Cancelar un preregistro
 * Solo ADMIN y SYSADMIN pueden cancelar
 * Solo pueden cancelar sus propios preregistros
 */
async function patchCancelarPreregistro(req, res) {
  try {
    const pool = require('../config/db');
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Validar que el ID sea un número válido
    if (!id || isNaN(id)) {
      return res.status(400).json({
        ok: false,
        error: 'ID de preregistro inválido'
      });
    }

    // Verificar que el usuario tenga permisos (admin o sysadmin)
    if (userRole !== 'admin' && userRole !== 'sysadmin') {
      return res.status(403).json({
        ok: false,
        error: 'No tienes permisos para cancelar preregistros'
      });
    }

    // Obtener el preregistro para verificar el propietario y estado actual
    const preregistroQuery = `
      SELECT id, admin_id, status 
      FROM preregistros 
      WHERE id = $1
    `;
    const preregistroResult = await pool.query(preregistroQuery, [id]);

    if (preregistroResult.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: 'Preregistro no encontrado'
      });
    }

    const preregistro = preregistroResult.rows[0];

    // Verificar que el usuario sea el propietario del preregistro
    if (preregistro.admin_id !== userId) {
      return res.status(403).json({
        ok: false,
        error: 'Solo puedes cancelar tus propios preregistros'
      });
    }

    // Verificar que el preregistro no esté ya cancelado o completado
    if (preregistro.status === 'cancelado') {
      return res.status(400).json({
        ok: false,
        error: 'El preregistro ya está cancelado'
      });
    }

    if (preregistro.status === 'completado') {
      return res.status(400).json({
        ok: false,
        error: 'No se puede cancelar un preregistro completado'
      });
    }

    // Actualizar el estado a cancelado
    const updateQuery = `
      UPDATE preregistros 
      SET status = 'cancelado', updated_at = CURRENT_TIMESTAMP 
      WHERE id = $1
      RETURNING *
    `;
    const updateResult = await pool.query(updateQuery, [id]);

    res.status(200).json({
      ok: true,
      message: 'Preregistro cancelado exitosamente',
      preregistro: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Error en patchCancelarPreregistro:', {
      message: error.message,
      code: error.code,
      userId: req.user?.userId,
      preregistroId: req.params.id
    });
    
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error al cancelar el preregistro',
      code: error.code || 'QUERY_ERROR'
    });
  }
}

module.exports = {
  postCrearPreregistro,
  getPreregistros,
  getPreregistroPorId,
  getPreregistroPorCodigo,
  postGenerarLinkUnico,
  postEnviarPorCorreo,
  getPreregistroPorToken,
  postCompletarPreregistro,
  patchEstadoPreregistro,
  patchIniciarPreregistro,
  getVerificarFotosFaltantes,
  postCargarFotoVisitante,
  postCargarFotoVehiculo,
  getVisitantePreregistro,
  getVehiculoPreregistro,
  buscarVisitantesPublico,
  crearVisitantePublico,
  buscarVehiculoPublico,
  crearVehiculoPublico,
  getPreregistrosPendientesCount,
  patchCancelarPreregistro
};
