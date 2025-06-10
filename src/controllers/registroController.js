// src/controllers/registroController.js
const pool = require('../config/db');
const {
  createGateRegistro,
  updateWithBuildingEntry,
  registerBuildingExit,
  registerGateExit,
  getAllRegistros,
  getRegistroById,
  updateRegistroById,
  deleteRegistroById,
  getVisitantesByRegistroId,
  updateDriverVisitor,
  RegistroError
} = require('../models/registroModel');

const { createVisitor, getVisitorById, VisitorError } = require('../models/visitorModel');
const { createDriver, DriverError } = require('../models/driverModel');
const { associateDriverToVisitor, VisitorDriverError } = require('../models/visitorDriverModel');
const { normalizeText } = require('../utils/codeGenerator');
const { getPreregistroById } = require('../models/preregistroModel');
const { withTransaction, validateGuardType, handleError } = require('../utils/controllerHelpers');

/**
 * Crea un nuevo registro en la caseta (primer filtro)
 * POST /registros/gate
 * Creado por guardias de caseta.
 */
async function createGateRegistroByGuard(req, res, next) {
  try {
    // Validar que el guardia sea de tipo caseta o supervisor
    validateGuardType(req.user, ['caseta', 'supervisor']);
    
    // Ejecutar toda la lógica dentro de una transacción
    const registro = await withTransaction(async () => {
      let visitorId = null;
      let driverId = null;
      let visitors = [];
      
      // Obtener número de pasajeros y tipo de etiqueta
      let numPassengers = parseInt(req.body.num_passengers, 10);
      console.log('numPassengers', numPassengers);
      if ((req.body.driver_id || req.body.driver_name) && numPassengers > 0) {
        numPassengers++;
      }
      console.log('numPassengers', numPassengers);
      const tagType = req.body.tag_type || 'etiqueta';
      const cardNumber = req.body.card_number;
      
      // Validar que si el tipo es tarjeta, se proporcione un número de tarjeta
      if (tagType === 'tarjeta' && !cardNumber) {
        const error = new Error('El número de tarjeta es obligatorio cuando el tipo es tarjeta');
        error.status = 400;
        error.code = 'MISSING_CARD_NUMBER';
        throw error;
      }
      
      // 1) Verificar si se está usando un código de preregistro
      if (req.body.preregistro_code) {
        // Buscar el preregistro por ID
        const preregistroId = parseInt(req.body.preregistro_code, 10);
        
        if (isNaN(preregistroId)) {
          const error = new Error('Código de preregistro inválido');
          error.status = 400;
          error.code = 'INVALID_PREREGISTRO_CODE';
          throw error;
        }
        
        // Usar el modelo para obtener el preregistro
        const preregistro = await getPreregistroById(preregistroId);
        
        if (!preregistro) {
          const error = new Error('Preregistro no encontrado');
          error.status = 404;
          error.code = 'PREREGISTRO_NOT_FOUND';
          throw error;
        }
        
        // Usar los datos del preregistro
        visitorId = preregistro.visitor_id;
      }
      
      // 2) Verificar si se está usando un visitante existente
      if (req.body.visitor_id && !visitorId) {
        // Usar visitante existente
        visitorId = req.body.visitor_id;
        
        // Verificar que el visitante exista
        const visitor = await getVisitorById(visitorId);
        if (!visitor) {
          const error = new Error('Visitante no encontrado');
          error.status = 404;
          error.code = 'VISITOR_NOT_FOUND';
          throw error;
        }
      }
      
      // 3) Procesar visitantes adicionales si se proporcionan
      if (req.body.visitors && Array.isArray(req.body.visitors) && req.body.visitors.length > 0) {
        for (const visitorInfo of req.body.visitors) {
          // Verificar que el visitante exista
          const visitor = await getVisitorById(visitorInfo.visitor_id);
          if (!visitor) {
            const error = new Error(`Visitante adicional con ID ${visitorInfo.visitor_id} no encontrado`);
            error.status = 404;
            error.code = 'VISITOR_NOT_FOUND';
            throw error;
          }
          
          // Validar que si el tipo es tarjeta, se proporcione un número de tarjeta
          if (visitorInfo.tag_type === 'tarjeta' && !visitorInfo.card_number) {
            const error = new Error(`El número de tarjeta es obligatorio para el visitante ${visitor.visitor_name}`);
            error.status = 400;
            error.code = 'MISSING_CARD_NUMBER';
            throw error;
          }
          
          // Agregar a la lista de visitantes
          visitors.push({
            visitor_id: visitorInfo.visitor_id,
            tag_type: visitorInfo.tag_type || 'etiqueta',
            card_number: visitorInfo.tag_type === 'tarjeta' ? visitorInfo.card_number : null
          });
        }
      }
      
      // 4) Verificar si se está creando o usando un conductor
      if (req.body.driver_id) {
        // Usar conductor existente
        driverId = req.body.driver_id;
      } else if (req.body.driver_name) {
        // Verificar que se hayan enviado las fotos necesarias
        if (!req.files?.platePhoto) {
          const error = new Error('La foto de la placa es obligatoria');
          error.status = 400;
          error.code = 'MISSING_PLATE_PHOTO';
          throw error;
        }
        
        // Guardar la foto de la placa
        const platePhotoPath = `uploads/${req.files.platePhoto[0].filename}`;
        
        // Normalizar el nombre del conductor
        const normalizedDriverName = normalizeText(req.body.driver_name);
        
        // Crear el conductor en la base de datos usando el modelo
        const driver = await createDriver({
          driver_name: normalizedDriverName,
          driver_id_photo_path: platePhotoPath,
          plate_photo_path: req.body.vehicle_plate ? req.body.vehicle_plate.toUpperCase() : null
        });
        
        driverId = driver.id;
      }
      
      // 5) Verificar si el conductor también es visitante
      const isDriverVisitor = req.body.is_driver_visitor === true;
      let driverVisitorId = null;
      
      if (isDriverVisitor && req.body.driver_visitor_id) {
        driverVisitorId = req.body.driver_visitor_id;
        
        // Verificar que el visitante exista usando el modelo
        const visitor = await getVisitorById(driverVisitorId);
        if (!visitor) {
          const error = new Error(`No existe un visitante con ID ${driverVisitorId} para asociar con el conductor`);
          error.status = 404;
          error.code = 'VISITOR_NOT_FOUND';
          throw error;
        }
      }
      
      // 6) Crear el registro usando el modelo
      return await createGateRegistro({
        preregistro_id: req.body.preregistro_id || null,
        admin_id: req.body.admin_id || null,
        gate_guard_id: req.user.userId,
        visitor_id: visitorId,
        reason: req.body.reason || null,
        driver_id: driverId,
        num_passengers: numPassengers,
        tag_type: tagType,
        card_number: cardNumber,
        visitors: visitors,
        is_driver_visitor: isDriverVisitor,
        driver_visitor_id: driverVisitorId,
        person_visited_id: req.body.person_visited_id || null
      });
    });
    
    // Responder con el registro creado
    return res.status(201).json({ 
      ok: true, 
      registro,
      message: 'Registro de caseta creado exitosamente.'
    });
  } catch (error) {
    // Manejar errores de forma consistente
    console.error('Error en createGateRegistroByGuard:', error);
    return handleError(res, error);
  }
}

/**
 * Completa el registro en la entrada del edificio (segundo filtro)
 * PUT /registros/:id/building-entry
 * Creado por guardias de entrada al edificio.
 */
async function updateWithBuildingEntryByGuard(req, res, next) {
  try {
    // Validar que el guardia sea de tipo entrada o supervisor
    validateGuardType(req.user, ['entrada', 'supervisor']);
    
    // Ejecutar toda la lógica dentro de una transacción
    const updatedRegistro = await withTransaction(async () => {
      const registroId = req.params.id;
      
      // Verificar que el registro exista
      const registro = await getRegistroById(registroId);
      if (!registro) {
        const error = new Error(`Registro no encontrado ${registroId}`);
        error.status = 404;
        error.code = 'REGISTRO_NOT_FOUND';
        throw error;
      }
      
      // Verificar que el registro no tenga ya una entrada al edificio
      if (registro.building_entry_time) {
        const error = new Error('Este registro ya tiene una entrada al edificio registrada');
        error.status = 400;
        error.code = 'ENTRY_ALREADY_REGISTERED';
        throw error;
      }
      
      // Obtener el número de pasajeros del registro
      const numPassengers = registro.num_passengers || 1;
      
      // Verificar si el conductor también es visitante
      const isDriverVisitor = registro.is_driver_visitor === true;
      let mainVisitorId = null;
      let additionalVisitors = [];
      
      // Procesar visitante principal
      if (req.body.visitor_id) {
        // Usar visitante existente
        mainVisitorId = req.body.visitor_id;
        
        // Verificar que el visitante exista
        const visitor = await getVisitorById(mainVisitorId);
        if (!visitor) {
          const error = new Error('Visitante principal no encontrado');
          error.status = 404;
          error.code = 'VISITOR_NOT_FOUND';
          throw error;
        }
      } else if (req.body.visitor_name) {
        // Verificar que se haya enviado la foto de ID
        if (!req.files?.idPhoto) {
          const error = new Error('La foto de identificación del visitante principal es obligatoria');
          error.status = 400;
          error.code = 'MISSING_REQUIRED_FILE';
          throw error;
        }
        
        // Crear nuevo visitante principal
        mainVisitorId = await createVisitor({
          visitor_name: req.body.visitor_name,
          visitor_id_photo_path: `uploads/${req.files.idPhoto[0].filename}`,
          phone: req.body.phone,
          email: req.body.email,
          company: req.body.company,
          type: req.body.type || 'visitante'
        });
      }
      
      // Procesar visitantes adicionales
      if (req.body.additional_visitors && Array.isArray(req.body.additional_visitors)) {
        // Verificar que no se excedan el número de pasajeros
        const totalVisitorsCount = req.body.additional_visitors.length + (mainVisitorId ? 1 : 0);
        
        if (totalVisitorsCount > numPassengers) {
          const error = new Error(`No se pueden registrar más de ${numPassengers} visitantes para este registro`);
          error.status = 400;
          error.code = 'EXCEEDED_PASSENGERS_COUNT';
          throw error;
        }
        
        // Procesar cada visitante adicional
        for (const visitorInfo of req.body.additional_visitors) {
          let visitorId;
          
          if (visitorInfo.visitor_id) {
            // Usar visitante existente
            visitorId = visitorInfo.visitor_id;
            
            // Verificar que el visitante exista
            const visitor = await getVisitorById(visitorId);
            if (!visitor) {
              const error = new Error(`Visitante adicional con ID ${visitorId} no encontrado`);
              error.status = 404;
              error.code = 'VISITOR_NOT_FOUND';
              throw error;
            }
          } else {
            // Crear nuevo visitante
            if (!visitorInfo.visitor_name) {
              const error = new Error('El nombre del visitante adicional es obligatorio');
              error.status = 400;
              error.code = 'MISSING_REQUIRED_FIELD';
              throw error;
            }
            
            visitorId = await createVisitor({
              visitor_name: visitorInfo.visitor_name,
              phone: visitorInfo.phone,
              email: visitorInfo.email,
              company: visitorInfo.company,
              type: visitorInfo.type || 'visitante'
            });
          }
          
          additionalVisitors.push(visitorId);
        }
      }
      
      // Verificar si el registro tiene un preregistro asociado
      let reason = req.body.reason;
      
      if (registro.preregistro_id) {
        // Obtener datos del preregistro usando el modelo
        const preregistro = await getPreregistroById(registro.preregistro_id);
        
        if (preregistro) {
          // Usar los datos del preregistro si no se proporcionaron en la solicitud
          reason = reason || preregistro.reason;
        }
      } else {
        // Si no hay preregistro, verificar que se haya proporcionado el motivo
        if (!reason) {
          const error = new Error('El motivo de la visita es obligatorio');
          error.status = 400;
          error.code = 'MISSING_REQUIRED_FIELD';
          throw error;
        }
      }
      
      // Obtener el ID de la persona a visitar (admin o sysadmin)
      const person_visited_id = req.body.person_visited_id || null;
      
      // Verificar si el conductor también es visitante
      if (registro.is_driver_visitor && registro.driver_visitor_id) {
        // Si el conductor es visitante, asegurarse de que esté incluido en la lista de visitantes
        if (!mainVisitorId) {
          mainVisitorId = registro.driver_visitor_id;
        } else if (!additionalVisitors.includes(registro.driver_visitor_id)) {
          additionalVisitors.push(registro.driver_visitor_id);
        }
      }
      
      // Actualizar el registro con la entrada al edificio usando el modelo
      return await updateWithBuildingEntry(registroId, {
        entry_guard_id: req.user.userId,
        visitor_id: mainVisitorId,
        additional_visitors: additionalVisitors,
        person_visited_id: person_visited_id,
        reason: reason
      });
    });
    
    // Responder con el registro actualizado
    return res.status(200).json({
      ok: true,
      registro: updatedRegistro,
      message: 'Entrada al edificio registrada exitosamente.'
    });
  } catch (error) {
    // Manejar errores de forma consistente
    console.error('Error en updateWithBuildingEntryByGuard:', error);
    return handleError(res, error);
  }
}

/**
 * Registra la salida del edificio
 * PUT /registros/:id/building-exit
 * Creado por guardias de entrada al edificio.
 */
async function registerBuildingExitByGuard(req, res, next) {
  try {
    // Validar que el guardia sea de tipo entrada o supervisor
    validateGuardType(req.user, ['entrada', 'supervisor']);
    
    const registroId = req.params.id;
    
    // Registrar la salida del edificio usando el modelo
    const updatedRegistro = await registerBuildingExit(registroId, {
      guard_id: req.user.userId,
      notes: req.body.notes // Pasar las notas del formulario al modelo
    });

    return res.status(200).json({ 
      ok: true, 
      data: updatedRegistro,
      message: 'Salida del edificio registrada exitosamente.'
    });
  } catch (error) {
    // Manejar errores de forma consistente
    console.error('Error en registerBuildingExitByGuard:', error);
    return handleError(res, error);
  }
}

/**
 * Registra la salida de la caseta
 * PUT /registros/:id/gate-exit
 * Creado por guardias de caseta.
 */
async function registerGateExitByGuard(req, res, next) {
  try {
    // Validar que el guardia sea de tipo caseta o supervisor
    validateGuardType(req.user, ['caseta', 'supervisor']);
    
    const registroId = req.params.id;
    const { notes } = req.body; // Obtener las notas del cuerpo de la solicitud
    
    // Registrar la salida de la caseta usando el modelo
    const updatedRegistro = await registerGateExit(registroId, {
      guard_id: req.user.userId,
      notes: notes // Pasar las notas al modelo
    });

    return res.status(200).json({ 
      ok: true, 
      data: updatedRegistro,
      message: 'Salida de la caseta registrada exitosamente.'
    });
  } catch (error) {
    // Manejar errores de forma consistente
    console.error('Error en registerGateExitByGuard:', error);
    return handleError(res, error);
  }
}

/**
 * Lista todos los registros
 * GET /registros
 * Admin/sysadmin listan todos.
 */
async function listRegistros(req, res, next) {
  try {
    const registros = await getAllRegistros();
    res.json({ ok: true, data: registros });
  } catch (err) {
    if (err instanceof RegistroError) {
      return res.status(err.status).json({ 
        ok: false, 
        error: err.message,
        code: err.code
      });
    }
    next(err);
  }
}

/**
 * Muestra un registro específico
 * GET /registros/:id
 */
async function getRegistroByIdController(req, res, next) {
  try {
    const { id } = req.params;
    
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID de registro no proporcionado'
      });
    }
    
    console.log(`Obteniendo registro con ID: ${id}`);
    
    // Obtener registro por ID
    const { getRegistroById } = require('../models/registroModel');
    const registro = await getRegistroById(id);
    
    if (!registro) {
      console.log(`Registro con ID ${id} no encontrado`);
      return res.status(404).json({ 
        success: false, 
        message: 'Registro no encontrado' 
      });
    }
    
    console.log(`Registro con ID ${id} encontrado correctamente`);
    
    // Verificar que registro.visitantes exista
    if (!registro.visitantes || !Array.isArray(registro.visitantes)) {
      console.error(`Error: registro.visitantes no es un array para el registro ${id}`);
      registro.visitantes = [];
    }
    
    // Contar visitantes adicionales (excluyendo al visitante principal)
    const visitantesAdicionales = registro.visitantes.filter(v => v.visitor_number > 1);
    const totalVisitantes = registro.visitantes.length;
    
    // Añadir mensaje informativo sobre los visitantes
    let visitanteMessage = '';
    if (totalVisitantes === 1) {
      visitanteMessage = 'Este registro tiene 1 visitante';
    } else {
      visitanteMessage = `Este registro tiene ${totalVisitantes} visitantes en total (1 principal y ${visitantesAdicionales.length} adicionales)`;
    }
    
    // Asegurarse de que el código de registro esté presente
    if (!registro.registration_code) {
      try {
        console.log(`Generando código de registro para el registro ${registro.id}`);
        // Importar la función de generación de código
        const codeGenerator = require('../utils/codeGenerator');
        
        // Verificar que la función exista
        if (typeof codeGenerator.generateRegistrationCode !== 'function') {
          console.error('La función generateRegistrationCode no está definida');
          // Usar un código simple como respaldo
          registro.registration_code = `UMX${registro.id}ABC`;
        } else {
          // Generar el código
          registro.registration_code = codeGenerator.generateRegistrationCode(registro.id);
          
          // Actualizar el registro con el código generado
          try {
            const pool = require('../config/db');
            await pool.query(
              `UPDATE registro SET registration_code = $1 WHERE id = $2`,
              [registro.registration_code, registro.id]
            );
            
            console.log(`Código de registro generado y actualizado: ${registro.registration_code}`);
          } catch (dbError) {
            console.error('Error al actualizar el código en la base de datos:', dbError);
            // Continuamos con el código generado aunque no se haya podido actualizar en la BD
          }
        }
      } catch (error) {
        console.error(`Error al generar el código de registro:`, error);
        // Usar un código de respaldo simple
        registro.registration_code = `UMX${registro.id}XYZ`;
      }
    }
    
    // Asegurarse de que los visitantes tengan su visitor_tag
    registro.visitantes = registro.visitantes.map(visitante => {
      if (!visitante.visitor_tag) {
        visitante.visitor_tag = `V${visitante.visitor_number || 1}`;
      }
      return visitante;
    });
    
    return res.json({ 
      ok: true, 
      success: true, 
      data: {
        ...registro,
        visitantes_adicionales: visitantesAdicionales,
        total_visitantes: totalVisitantes,
        visitante_message: visitanteMessage
      } 
    });
  } catch (err) {
    if (err instanceof RegistroError) {
      return res.status(err.status).json({ 
        ok: false, 
        error: err.message,
        code: err.code
      });
    }
    next(err);
  }
}

/**
 * Actualiza un registro existente
 * PUT /registros/:id
 * Actualiza campos dinámicos (ej. exited_at o reason).
 */
async function updateRegistroByIdController(req, res, next) {
  try {
    const id = req.params.id;
    
    // Verificar que el registro existe
    const registro = await getRegistroById(id);
    if (!registro) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Registro no encontrado',
        code: 'REGISTRO_NOT_FOUND'
      });
    }
    
    const payload = {};
    if (req.body.exited_at) payload.exited_at = req.body.exited_at;
    if (req.body.reason) payload.reason = req.body.reason;
    
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'No se proporcionaron datos para actualizar',
        code: 'NO_UPDATE_DATA'
      });
    }

    const updated = await updateRegistroById(id, payload);
    res.json({ ok: true, data: updated });
  } catch (err) {
    if (err instanceof RegistroError) {
      return res.status(err.status).json({ 
        ok: false, 
        error: err.message,
        code: err.code
      });
    }
    next(err);
  }
}

/**
 * Elimina un registro
 * DELETE /registros/:id
 */
async function deleteRegistroByIdController(req, res, next) {
  try {
    const id = req.params.id;
    
    // Verificar que el registro existe
    const registro = await getRegistroById(id);
    if (!registro) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Registro no encontrado',
        code: 'REGISTRO_NOT_FOUND'
      });
    }
    
    await deleteRegistroById(id);
    res.json({ 
      ok: true, 
      message: 'Registro eliminado correctamente'
    });
  } catch (err) {
    if (err instanceof RegistroError) {
      return res.status(err.status).json({ 
        ok: false, 
        error: err.message,
        code: err.code
      });
    }
    next(err);
  }
}

/**
 * Crea un nuevo registro directamente en la entrada al edificio (sin pasar por caseta)
 * POST /registros/building
 * Para visitantes que llegan sin vehículo.
 */
async function createBuildingRegistroByGuard(req, res, next) {
  try {
    // Validar que el guardia sea de tipo entrada o supervisor
    validateGuardType(req.user, ['entrada', 'supervisor']);
    
    // Log completo de la solicitud para depuración
    console.log('SOLICITUD COMPLETA:', {
      body: req.body,
      files: req.files,
      headers: req.headers,
      method: req.method,
      url: req.url
    });
    
    // Ejecutar toda la lógica dentro de una transacción
    const registro = await withTransaction(async () => {
      let visitorId = null;
      let preregistroId = null;
      let additionalVisitors = [];
      
      // Obtener número de pasajeros y tipo de etiqueta
      const numPassengers = parseInt(req.body.num_passengers, 10) || 1;
      const tagType = req.body.tag_type || 'etiqueta';
      const cardNumber = req.body.card_number;
      
      // Validar que si el tipo es tarjeta, se proporcione un número de tarjeta
      if (tagType === 'tarjeta' && !cardNumber) {
        const error = new Error('El número de tarjeta es obligatorio cuando el tipo es tarjeta');
        error.status = 400;
        error.code = 'MISSING_CARD_NUMBER';
        throw error;
      }
      
      console.log('Datos procesados:', { 
        preregistro_code: req.body.preregistro_code,
        visitor_id: req.body.visitor_id,
        visitor_name: req.body.visitor_name,
        visitors: req.body.visitors,
        selected_visitors: req.body.selected_visitors,
        files: req.files ? Object.keys(req.files) : 'No hay archivos'
      });
      
      // 1) Verificar si se está usando un código de preregistro
      if (req.body.preregistro_code) {
        // Buscar el preregistro por ID
        const preregistroIdValue = parseInt(req.body.preregistro_code, 10);
        
        if (isNaN(preregistroIdValue)) {
          const error = new Error('Código de preregistro inválido');
          error.status = 400;
          error.code = 'INVALID_PREREGISTRO_CODE';
          throw error;
        }
        
        // Usar el modelo para obtener el preregistro
        const preregistro = await getPreregistroById(preregistroIdValue);
        
        if (!preregistro) {
          const error = new Error('Preregistro no encontrado');
          error.status = 404;
          error.code = 'PREREGISTRO_NOT_FOUND';
          throw error;
        }
        
        // Usar los datos del preregistro
        visitorId = preregistro.visitor_id;
        preregistroId = preregistroIdValue;
      }
      
      // Intentar obtener visitantes de cualquier formato posible
      // 1. Primero intentar con visitor_id directo
      if (req.body.visitor_id && !visitorId) {
        visitorId = req.body.visitor_id;
        
        // Verificar que el visitante exista
        const visitor = await getVisitorById(visitorId);
        if (!visitor) {
          const error = new Error(`Visitante con ID ${visitorId} no encontrado`);
          error.status = 404;
          error.code = 'VISITOR_NOT_FOUND';
          throw error;
        }
      }
      
      // 2. Intentar con selected_visitors (formato de la interfaz)
      else if (req.body.selected_visitors && Array.isArray(req.body.selected_visitors) && req.body.selected_visitors.length > 0) {
        // Extraer IDs de los visitantes seleccionados
        for (let i = 0; i < req.body.selected_visitors.length; i++) {
          const selectedVisitor = req.body.selected_visitors[i];
          let visitorIdValue;
          
          // Manejar diferentes formatos posibles
          if (typeof selectedVisitor === 'object') {
            visitorIdValue = selectedVisitor.id || selectedVisitor.visitor_id;
          } else if (typeof selectedVisitor === 'number') {
            visitorIdValue = selectedVisitor;
          } else if (typeof selectedVisitor === 'string' && !isNaN(parseInt(selectedVisitor))) {
            visitorIdValue = parseInt(selectedVisitor);
          }
          
          if (visitorIdValue) {
            // Verificar que el visitante exista
            const visitor = await getVisitorById(visitorIdValue);
            if (!visitor) {
              const error = new Error(`Visitante con ID ${visitorIdValue} no encontrado`);
              error.status = 404;
              error.code = 'VISITOR_NOT_FOUND';
              throw error;
            }
            
            // El primer visitante es el principal, los demás son adicionales
            if (i === 0) {
              visitorId = visitorIdValue;
            } else {
              additionalVisitors.push({
                visitor_id: visitorIdValue,
                tag_type: 'etiqueta',
                card_number: null
              });
            }
          }
        }
      }
      
      // 3. Intentar con visitors (formato antiguo)
      else if (req.body.visitors && Array.isArray(req.body.visitors) && req.body.visitors.length > 0 && !visitorId) {
        // Usar el primer visitante como principal
        const firstVisitor = req.body.visitors[0];
        if (firstVisitor && firstVisitor.visitor_id) {
          visitorId = firstVisitor.visitor_id;
          
          // Verificar que el visitante exista
          const visitor = await getVisitorById(visitorId);
          if (!visitor) {
            const error = new Error(`Visitante con ID ${visitorId} no encontrado`);
            error.status = 404;
            error.code = 'VISITOR_NOT_FOUND';
            throw error;
          }
          
          // Procesar visitantes adicionales (a partir del segundo)
          if (req.body.visitors.length > 1) {
            for (let i = 1; i < req.body.visitors.length; i++) {
              const additionalVisitor = req.body.visitors[i];
              if (additionalVisitor && additionalVisitor.visitor_id) {
                additionalVisitors.push({
                  visitor_id: additionalVisitor.visitor_id,
                  tag_type: additionalVisitor.tag_type || 'etiqueta',
                  card_number: additionalVisitor.tag_type === 'tarjeta' ? additionalVisitor.card_number : null
                });
              }
            }
          }
        }
      }
      
      // 4. Si no hay visitante y se proporcionan datos para crear uno nuevo
      else if (!visitorId && req.body.visitor_name) {
        // Verificar que se haya enviado la foto de ID
        if (!req.files || !req.files.idPhoto || req.files.idPhoto.length === 0) {
          const error = new Error('La foto de identificación del visitante (idPhoto) es obligatoria para crear un nuevo visitante');
          error.status = 400;
          error.code = 'MISSING_REQUIRED_FILE';
          throw error;
        }
        
        // Crear nuevo visitante
        visitorId = await createVisitor({
          visitor_name: req.body.visitor_name,
          visitor_id_photo_path: `uploads/${req.files.idPhoto[0].filename}`,
          phone: req.body.phone,
          email: req.body.email,
          company: req.body.company,
          type: req.body.type || 'visitante'
        });
      }
      
      // 5. Si no se encontró ningún visitante, lanzar error
      if (!visitorId) {
        const error = new Error('No se ha seleccionado ningún visitante. Debes proporcionar visitor_id, selected_visitors, visitors o visitor_name.');
        error.status = 400;
        error.code = 'NO_VISITOR_SELECTED';
        throw error;
      }
      
      // Procesar visitantes adicionales del formato antiguo (si no se procesaron ya con selected_visitors)
      if (req.body.visitors && Array.isArray(req.body.visitors) && req.body.visitors.length > 0 && additionalVisitors.length === 0) {
        for (const visitorInfo of req.body.visitors) {
          // Verificar que el visitante exista
          const visitor = await getVisitorById(visitorInfo.visitor_id);
          if (!visitor) {
            const error = new Error(`Visitante adicional con ID ${visitorInfo.visitor_id} no encontrado`);
            error.status = 404;
            error.code = 'VISITOR_NOT_FOUND';
            throw error;
          }
          
          // Validar que si el tipo es tarjeta, se proporcione un número de tarjeta
          if (visitorInfo.tag_type === 'tarjeta' && !visitorInfo.card_number) {
            const error = new Error(`El número de tarjeta es obligatorio para el visitante ${visitor.visitor_name}`);
            error.status = 400;
            error.code = 'MISSING_CARD_NUMBER';
            throw error;
          }
          
          // Agregar a la lista de visitantes
          additionalVisitors.push({
            visitor_id: visitorInfo.visitor_id,
            tag_type: visitorInfo.tag_type || 'etiqueta',
            card_number: visitorInfo.tag_type === 'tarjeta' ? visitorInfo.card_number : null
          });
        }
      }
      
      // 4) Crear el registro directamente con entrada al edificio usando el modelo
      const { createBuildingRegistro } = require('../models/registroModel');
      
      // Calcular el número total de visitantes (principal + adicionales)
      const totalVisitantes = 1 + additionalVisitors.length;
      
      // Extraer toda la información sobre la persona a visitar
      // El person_visited_id debe ser un entero que corresponda al ID de la tabla users
      let personVisitedId = null;
      if (req.body.person_visited_id) {
        personVisitedId = parseInt(req.body.person_visited_id, 10);
        if (isNaN(personVisitedId)) {
          personVisitedId = null;
        }
      }
      
      const personVisitedData = {
        person_visited_id: personVisitedId,
        person_visited_name: req.body.person_visited_name || null,
        person_visited_username: req.body.person_visited_username || null,
        person_visited_email: req.body.person_visited_email || null,
        person_visited_role: req.body.person_visited_role || null
      };
      
      console.log('Datos de persona a visitar:', personVisitedData); // Log para depuración
      
      const registro = await createBuildingRegistro({
        preregistro_id: preregistroId,
        visitor_id: visitorId,
        entry_guard_id: req.user.userId,
        reason: req.body.reason || 'Visita',
        num_passengers: totalVisitantes, // Usamos num_passengers para almacenar el total de visitantes
        tag_type: tagType,
        person_visited_id: personVisitedData.person_visited_id
        // card_number ya no se usa en la tabla registro, se guarda en registro_visitantes
      });
      
      console.log('Registro creado:', registro); // Log para depuración
      
      // 5) Registrar todos los visitantes en la tabla registro_visitantes
      const { addVisitorToRegistro } = require('../models/registroVisitantesModel');
      
      // Iniciar con el visitante principal (número 1)
      let nextVisitorNumber = 1;
      
      // Registrar el visitante principal primero
      await addVisitorToRegistro({
        registro_id: registro.id,
        visitor_id: visitorId,
        visitor_number: nextVisitorNumber,
        is_driver: false,  // Para visitantes a pie, ninguno es conductor
        visitor_tag: `V${nextVisitorNumber}`,
        tag_type: tagType,
        card_number: tagType === 'tarjeta' ? cardNumber : null
      });
      
      nextVisitorNumber++;
      
      // Luego registrar visitantes adicionales si existen
      if (additionalVisitors.length > 0) {
        for (const visitor of additionalVisitors) {
          // Generar una etiqueta para el visitante
          const visitorTag = `V${nextVisitorNumber}`;
          
          await addVisitorToRegistro({
            registro_id: registro.id,
            visitor_id: visitor.visitor_id,
            visitor_number: nextVisitorNumber,
            is_driver: false,
            visitor_tag: visitorTag,
            tag_type: visitor.tag_type,
            card_number: visitor.tag_type === 'tarjeta' ? visitor.card_number : null
          });
          
          // Incrementar para el siguiente visitante
          nextVisitorNumber++;
        }
      }
      
      return registro;
    });
    
    // Responder con el registro creado
    res.status(201).json({ 
      ok: true, 
      data: registro,
      message: 'Registro de entrada al edificio creado exitosamente.'
    });
  } catch (error) {
    // Manejar errores de forma consistente
    console.error('Error en createBuildingRegistroByGuard:', error);
    return handleError(res, error);
  }
}

/**
 * Obtiene todos los visitantes asociados a un registro
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 * @param {Function} next - Función next
 * @returns {Object} Respuesta con la lista de visitantes
 */
const getVisitantesByRegistroIdController = async (req, res, next) => {
  try {
    const registroId = req.params.id;
    
    // Verificar que el registro existe
    const registro = await getRegistroById(registroId);
    if (!registro) {
      return res.status(404).json({
        ok: false,
        error: 'Registro no encontrado',
        code: 'REGISTRO_NOT_FOUND'
      });
    }
    
    // Obtener los visitantes asociados al registro
    const visitantes = await getVisitantesByRegistroId(registroId);
    
    return res.status(200).json({
      ok: true,
      data: visitantes
    });
  } catch (err) {
    if (err instanceof RegistroError) {
      return res.status(err.status).json({
        ok: false,
        error: err.message,
        code: err.code
      });
    }
    
    next(err);
  }
};

/**
 * PUT /registros/:id/building-entry-multiple
 * Registra múltiples visitantes y la entrada al edificio
 */
async function updateWithBuildingEntryMultipleVisitors(req, res, next) {
  try {
    // Validar que el guardia sea de tipo entrada o supervisor
    validateGuardType(req.user, ['entrada', 'supervisor']);
    
    // Ejecutar toda la lógica dentro de una transacción
    const updatedRegistro = await withTransaction(async () => {
      const registroId = req.params.id;
      
      // Verificar que el registro exista
      const registro = await getRegistroById(registroId);
      if (!registro) {
        const error = new Error(`Registro no encontrado ${registroId}`);
        error.status = 404;
        error.code = 'REGISTRO_NOT_FOUND';
        throw error;
      }
      
      // Verificar que el registro no tenga ya una entrada al edificio
      if (registro.building_entry_time) {
        const error = new Error('Este registro ya tiene una entrada al edificio registrada');
        error.status = 400;
        error.code = 'ENTRY_ALREADY_REGISTERED';
        throw error;
      }
      
      // Obtener los IDs de los visitantes del cuerpo de la solicitud
      let visitorIds = [];
      if (req.body.visitor_ids) {
        try {
          visitorIds = JSON.parse(req.body.visitor_ids);
          if (!Array.isArray(visitorIds)) {
            throw new Error('El formato de visitor_ids no es válido');
          }
        } catch (error) {
          const err = new Error('El formato de visitor_ids no es válido');
          err.status = 400;
          err.code = 'INVALID_VISITOR_IDS';
          throw err;
        }
      }
      console.log('IDs de visitantes:', visitorIds);
      
      if (visitorIds.length === 0) {
        const error = new Error('Debe proporcionar al menos un ID de visitante');
        error.status = 400;
        error.code = 'NO_VISITORS_PROVIDED';
        throw error;
      }
      
      // Verificar que el número de visitantes sea menor o igual al número de pasajeros
      const numPassengers = registro.num_passengers;
      if (visitorIds.length > numPassengers) {
        const error = new Error(`El número de visitantes es mayor al número de pasajeros`);
        error.status = 400;
        error.code = 'EXCESSIVE_VISITORS';
        throw error;
      }
      
      // Verificar que todos los visitantes existan
      for (const visitorId of visitorIds) {
        const visitor = await getVisitorById(visitorId);
        if (!visitor) {
          const error = new Error(`Visitante con ID ${visitorId} no encontrado`);
          error.status = 404;
          error.code = 'VISITOR_NOT_FOUND';
          throw error;
        }
      }
      
      // Actualizar el registro con la entrada al edificio
      const pool = require('../config/db');
      const { rows } = await pool.query(
        `UPDATE registro SET 
          building_entry_time = NOW(), 
          entry_guard_id = $1, 
          reason = $2, 
          person_visited_id = $3, 
          status = 'active'
        WHERE id = $4
        RETURNING *`,
        [
          req.user.id,
          req.body.reason || 'Visita',
          req.body.person_visited_id || null,
          registroId
        ]
      );
      
      if (rows.length === 0) {
        const error = new Error('Error al actualizar el registro');
        error.status = 500;
        error.code = 'UPDATE_ERROR';
        throw error;
      }
      
      const updatedRegistro = rows[0];
      
      // Eliminar cualquier asociación previa de visitantes con este registro
      await pool.query(
        `DELETE FROM registro_visitantes WHERE registro_id = $1`,
        [registroId]
      );
      
      // Asociar los visitantes al registro
      for (let i = 0; i < visitorIds.length; i++) {
        const visitorId = visitorIds[i];
        // Ya no necesitamos determinar si es el visitante principal
        
        await pool.query(
          `INSERT INTO registro_visitantes (
            registro_id, 
            visitor_id, 
            visitor_number, 
            visitor_tag, 
            tag_type, 
            card_number
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            registroId,
            visitorId,
            i + 1, // Número de visitante (1-based)
            `V${i + 1}`, // Etiqueta del visitante (V1, V2, etc.)
            'etiqueta', // Por defecto usamos etiqueta
            null // No asignamos número de tarjeta por defecto
          ]
        );
      }
      
      return updatedRegistro;
    });
    
    // Obtener los visitantes asociados al registro
    const visitantes = await getVisitantesByRegistroId(updatedRegistro.id);
    
    // Preparar mensaje sobre visitantes
    let visitanteMessage = '';
    let totalVisitantes = visitantes.length;
    let visitantesAdicionales = [];
    
    if (totalVisitantes > 0) {
      const mainVisitor = visitantes[0]; // Tomamos el primer visitante como principal
      visitanteMessage = `Visitante principal: ${mainVisitor.visitor_name}`;
      
      // Separar visitantes adicionales
      visitantesAdicionales = visitantes.filter(v => v.id !== mainVisitor.id); // Filtramos solo por ID
    }
    
    // Generar código de registro si no existe
    if (!updatedRegistro.registration_code) {
      try {
        console.log(`Generando código de registro para el registro ${updatedRegistro.id}`);
        // Importar la función de generación de código
        const codeGenerator = require('../utils/codeGenerator');
        
        // Verificar que la función exista
        if (typeof codeGenerator.generateRegistrationCode !== 'function') {
          console.error('La función generateRegistrationCode no está definida');
          // Usar un código simple como respaldo
          updatedRegistro.registration_code = `UMX${updatedRegistro.id}ABC`;
        } else {
          // Generar el código
          updatedRegistro.registration_code = codeGenerator.generateRegistrationCode(updatedRegistro.id);
          
          // Actualizar el registro con el código generado
          try {
            const pool = require('../config/db');
            await pool.query(
              `UPDATE registro SET registration_code = $1 WHERE id = $2`,
              [updatedRegistro.registration_code, updatedRegistro.id]
            );
            
            console.log(`Código de registro generado y actualizado: ${updatedRegistro.registration_code}`);
          } catch (dbError) {
            console.error('Error al actualizar el código en la base de datos:', dbError);
            // Continuamos con el código generado aunque no se haya podido actualizar en la BD
          }
        }
      } catch (error) {
        console.error(`Error al generar el código de registro:`, error);
        // Usar un código de respaldo simple
        updatedRegistro.registration_code = `UMX${updatedRegistro.id}XYZ`;
      }
    }
    
    return res.json({ 
      ok: true, 
      success: true, 
      data: {
        ...updatedRegistro,
        visitantes,
        visitantes_adicionales: visitantesAdicionales,
        total_visitantes: totalVisitantes,
        visitante_message: visitanteMessage
      } 
    });
  } catch (err) {
    if (err instanceof Error) {
      return res.status(err.status || 500).json({ 
        ok: false, 
        error: err.message,
        code: err.code
      });
    }
    next(err);
  }
}

/**
 * Actualiza el estado del conductor como visitante
 * PUT /registros/:id/update-driver-visitor
 * @param {Object} req - Objeto de solicitud
 * @param {Object} res - Objeto de respuesta
 * @param {Function} next - Función next
 * @returns {Object} Respuesta con el registro actualizado
 */
async function updateDriverVisitorStatus(req, res, next) {
  try {
    // Validar que el guardia sea de tipo edificio o supervisor
    validateGuardType(req.user, ['entrada', 'supervisor']);
    
    const registroId = req.params.id;
    const { is_driver_visitor } = req.body;
    
    if (typeof is_driver_visitor !== 'boolean') {
      return res.status(400).json({
        ok: false,
        error: 'El campo is_driver_visitor debe ser un valor booleano'
      });
    }
    
    // Ejecutar la actualización dentro de una transacción
    const result = await withTransaction(async () => {
      // Primero obtenemos el registro para verificar que existe y tiene conductor
      const registro = await getRegistroById(registroId);
      
      if (!registro) {
        const error = new Error('Registro no encontrado');
        error.status = 404;
        throw error;
      }
      
      if (!registro.driver_id) {
        const error = new Error('Este registro no tiene conductor asociado');
        error.status = 400;
        throw error;
      }
      
      // Actualizar el campo is_driver_visitor
      const updatedRegistro = await updateDriverVisitor(registroId, is_driver_visitor);
      
      return updatedRegistro;
    });
    
    return res.status(200).json({
      ok: true,
      message: `Estado del conductor como visitante ${is_driver_visitor ? 'activado' : 'desactivado'} correctamente`,
      registro: result
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(error.status || 500).json({ 
        ok: false, 
        error: error.message,
        code: error.code
      });
    }
    next(error);
  }
}

module.exports = {
  createGateRegistroByGuard,
  updateWithBuildingEntryByGuard,
  registerBuildingExitByGuard,
  registerGateExitByGuard,
  getAllRegistros,
  listRegistros,
  getRegistroById: getRegistroByIdController,
  updateRegistroById: updateRegistroByIdController,
  deleteRegistroById: deleteRegistroByIdController,
  getVisitantesByRegistroId: getVisitantesByRegistroIdController,
  createBuildingRegistroByGuard,
  updateWithBuildingEntryMultipleVisitors,
  updateDriverVisitorStatus
};
