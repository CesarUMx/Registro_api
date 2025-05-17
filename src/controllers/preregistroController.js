const {
  getAllPreregistros,
  getPreregistroById,
  updatePreregistroById,
  deletePreregistroById,
  getPreregistrosByAdmin,
  createPreregistro,
  PreregistroError
} = require('../models/preregistroModel');

const { createVisitor, getVisitorById, VisitorError } = require('../models/visitorModel');
const { createDriver, DriverError } = require('../models/driverModel');
const { associateDriverToVisitor, VisitorDriverError } = require('../models/visitorDriverModel');

/**
 * Lista todos los preregistros
 * GET /preregistros
 */
async function listPreregistros(req, res, next) {
  try {
    let preregistros;
    if (req.user.role === 'sysadmin') {
      // sysadmin ve todos
      preregistros = await getAllPreregistros();
    } else {
      // admin ve solo los suyos
      preregistros = await getPreregistrosByAdmin(req.user.userId);
    }
    res.json({ ok: true, data: preregistros });
  } catch (err) {
    if (err instanceof PreregistroError) {
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
 * Muestra un preregistro específico
 * GET /preregistros/:id
 */
async function showPreregistro(req, res, next) {
  try {
    const preregistro = await getPreregistroById(req.params.id);
    if (!preregistro) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Preregistro no encontrado',
        code: 'PREREGISTRO_NOT_FOUND'
      });
    }
    res.json({ ok: true, data: preregistro });
  } catch (err) {
    if (err instanceof PreregistroError) {
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
 * Crea un nuevo preregistro con visitante y conductor opcional
 * POST /preregistros
 * Solo admin.
 */
async function createPreregistroByAdmin(req, res, next) {
  try {
    const adminId = req.user.userId;
    let visitorId;
    let driverId;
    
    // 1) Verificar si se está usando un visitante existente o creando uno nuevo
    if (req.body.visitor_id) {
      // Usar visitante existente
      visitorId = req.body.visitor_id;
      
      // Verificar que el visitante exista
      const visitor = await getVisitorById(visitorId);
      if (!visitor) {
        return res.status(404).json({ 
          ok: false, 
          error: 'Visitante no encontrado',
          code: 'VISITOR_NOT_FOUND'
        });
      }
    } else {
      // Verificar que se hayan enviado los datos necesarios para crear un visitante
      if (!req.body.visitor_name) {
        return res.status(400).json({ 
          ok: false, 
          error: 'El nombre del visitante es obligatorio',
          code: 'MISSING_REQUIRED_FIELD'
        });
      }
      
      // Verificar que se haya enviado la foto de ID
      if (!req.files?.idPhoto) {
        return res.status(400).json({ 
          ok: false, 
          error: 'La foto de identificación del visitante es obligatoria',
          code: 'MISSING_REQUIRED_FILE'
        });
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
    
    // 2) Verificar si se está usando un conductor existente o creando uno nuevo
    if (req.body.driver_id) {
      // Usar conductor existente
      driverId = req.body.driver_id;
      
      // No necesitamos verificar la asociación aquí, ya que el conductor ya está asociado al visitante
      // Solo establecemos parking_access a true porque hay un conductor
    } else if (req.body.driver_name) {
      // Crear un nuevo conductor
      // Verificar que se hayan enviado las fotos necesarias
      if (!req.files?.platePhoto) {
        return res.status(400).json({ 
          ok: false, 
          error: 'La foto de la placa es obligatoria para crear un conductor',
          code: 'MISSING_REQUIRED_FILE'
        });
      }
      
      // Si no se envió una foto de ID específica para el conductor, usar la del visitante
      const driverIdPhoto = req.files?.driverIdPhoto ? 
        req.files.driverIdPhoto[0].filename : 
        req.files.idPhoto[0].filename;
      
      // Crear nuevo conductor
      driverId = await createDriver({
        driver_name: req.body.driver_name,
        driver_id_photo_path: `uploads/${driverIdPhoto}`,
        plate_photo_path: `uploads/${req.files.platePhoto[0].filename}`
      });
      
      // Asociar conductor al visitante
      await associateDriverToVisitor(visitorId, driverId, true); // true = conductor principal
    }
    // Si no hay driver_id ni driver_name, no se crea ni asocia ningún conductor
    
    // 3) Crear preregistro
    const preregistroData = {
      admin_id: adminId,
      visitor_id: visitorId,
      scheduled_date: req.body.scheduled_date || req.body.date, // Compatibilidad con ambos nombres
      reason: req.body.reason,
      person_visited: req.body.person_visited, // Persona que se visita
      // Si se proporciona un conductor (nuevo o existente), automáticamente establecer parking_access a true
      parking_access: req.body.driver_id || req.body.driver_name ? true : (req.body.parking_access === 'true' || req.body.parking_access === true),
      invite_id: req.body.invite_id || null
    };
    
    const preregistroId = await createPreregistro(preregistroData);
    
    // 4) Obtener el preregistro completo para devolverlo
    const preregistro = await getPreregistroById(preregistroId);

    res.status(201).json({ 
      ok: true, 
      data: {
        id: preregistroId,
        code: `PR-${preregistroId}`, // Código formateado para el guardia
        message: 'Preregistro creado exitosamente. Proporcione este código al guardia.',
        visitor_id: visitorId,
        driver_id: driverId || null,
        parking_access: preregistroData.parking_access
      }
    });
  } catch (err) {
    if (err instanceof PreregistroError || 
        err instanceof VisitorError || 
        err instanceof DriverError || 
        err instanceof VisitorDriverError) {
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
 * Actualiza un preregistro existente
 * PUT /preregistros/:id
 */
async function editPreregistro(req, res, next) {
  try {
    const id = req.params.id;
    
    // Verificar que el preregistro existe
    const preregistro = await getPreregistroById(id);
    if (!preregistro) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Preregistro no encontrado',
        code: 'PREREGISTRO_NOT_FOUND'
      });
    }
    
    // Imprimir el preregistro actual para depuración
    console.log('Preregistro actual:', preregistro);
    console.log('Datos recibidos en el body:', req.body);
    
    // Preparar los datos a actualizar
    const payload = {};
    
    // Permitir actualizar solo los campos que sabemos que existen en la tabla
    if (req.body.scheduled_date) {
      payload.scheduled_date = req.body.scheduled_date;
    } else if (req.body.date) {
      payload.scheduled_date = req.body.date; // Compatibilidad
    }
    
    if (req.body.reason) {
      payload.reason = req.body.reason;
    }
    
    if (req.body.person_visited) {
      payload.person_visited = req.body.person_visited;
    }
    
    // Actualizar parking_access si se proporciona
    if (req.body.parking_access !== undefined) {
      if (req.body.parking_access === 'true' || req.body.parking_access === true) {
        payload.parking_access = true;
      } else {
        payload.parking_access = false;
      }
    }
    
    console.log('Payload a enviar para actualización:', payload);
    
    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'No se proporcionaron datos para actualizar',
        code: 'NO_UPDATE_DATA'
      });
    }

    // Llamar a la función de actualización con los datos preparados
    const updated = await updatePreregistroById(id, payload);
    res.json({ ok: true, data: updated });
  } catch (err) {
    if (err instanceof PreregistroError) {
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
 * Elimina un preregistro
 * DELETE /preregistros/:id
 */
async function removePreregistro(req, res, next) {
  try {
    const id = req.params.id;
    
    // Verificar que el preregistro existe
    const preregistro = await getPreregistroById(id);
    if (!preregistro) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Preregistro no encontrado',
        code: 'PREREGISTRO_NOT_FOUND'
      });
    }
    
    await deletePreregistroById(id);
    res.json({ 
      ok: true, 
      message: 'Preregistro eliminado correctamente'
    });
  } catch (err) {
    if (err instanceof PreregistroError) {
      return res.status(err.status).json({ 
        ok: false, 
        error: err.message,
        code: err.code
      });
    }
    next(err);
  }
}

module.exports = {
  listPreregistros,
  showPreregistro,
  createPreregistroByAdmin,
  editPreregistro,
  removePreregistro
};
