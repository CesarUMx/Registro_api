// src/controllers/registroController.js
const pool = require('../config/db');
const {
  createRegistro,
  getAllRegistros,
  getRegistroById,
  updateRegistroById,
  deleteRegistroById,
  RegistroError
} = require('../models/registroModel');

const { createVisitor, getVisitorById, VisitorError } = require('../models/visitorModel');
const { createDriver, DriverError } = require('../models/driverModel');
const { associateDriverToVisitor, VisitorDriverError } = require('../models/visitorDriverModel');

/**
 * Crea un nuevo registro de entrada con visitante y conductor opcional
 * POST /registros
 * Creado por guardias.
 */
async function createRegistroByGuard(req, res, next) {
  try {
    await pool.query('BEGIN');
    
    let visitorId;
    let driverId;
    
    // 1) Verificar si se está usando un visitante existente o creando uno nuevo
    if (req.body.visitor_id) {
      // Usar visitante existente
      visitorId = req.body.visitor_id;
      
      // Verificar que el visitante exista
      const visitor = await getVisitorById(visitorId);
      if (!visitor) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ 
          ok: false, 
          error: 'Visitante no encontrado',
          code: 'VISITOR_NOT_FOUND'
        });
      }
    } else {
      // Verificar que se hayan enviado los datos necesarios para crear un visitante
      if (!req.body.visitor_name) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ 
          ok: false, 
          error: 'El nombre del visitante es obligatorio',
          code: 'MISSING_REQUIRED_FIELD'
        });
      }
      
      // Verificar que se haya enviado la foto de ID
      if (!req.files?.idPhoto) {
        await pool.query('ROLLBACK');
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
    
    // 2) Verificar si se está creando un conductor
    if (req.body.create_driver && req.body.driver_name) {
      // Verificar que se hayan enviado las fotos necesarias
      if (!req.files?.platePhoto) {
        await pool.query('ROLLBACK');
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

    // 3) Insertar el registro en puerta
    const registro = await createRegistro({
      preregistro_id: req.body.preregistro_id || null,
      guard_user_id: req.user.userId,
      visitor_id: visitorId,
      reason: req.body.reason
    });

    await pool.query('COMMIT');
    res.status(201).json({ ok: true, data: registro });
  } catch (err) {
    await pool.query('ROLLBACK');
    
    if (err instanceof RegistroError || 
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
async function showRegistro(req, res, next) {
  try {
    const registro = await getRegistroById(req.params.id);
    if (!registro) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Registro no encontrado',
        code: 'REGISTRO_NOT_FOUND'
      });
    }
    res.json({ ok: true, data: registro });
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
async function editRegistro(req, res, next) {
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
async function removeRegistro(req, res, next) {
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

module.exports = {
  createRegistroByGuard,
  listRegistros,
  showRegistro,
  editRegistro,
  removeRegistro
};
