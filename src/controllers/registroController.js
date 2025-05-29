// src/controllers/registroController.js
const pool = require('../config/db');
const {
  createGateRegistro,
  updateWithBuildingEntry,
  registerBuildingExit,
  registerGateExit,
  findByPreregistroCode,
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
 * Crea un nuevo registro en la caseta (primer filtro)
 * POST /registros/gate
 * Creado por guardias de caseta.
 */
async function createGateRegistroByGuard(req, res, next) {
  try {
    // Depuración: mostrar todos los datos recibidos
    console.log('Datos recibidos en createGateRegistroByGuard:');
    console.log('Body:', req.body);
    console.log('Files:', req.files ? Object.keys(req.files) : 'No hay archivos');
    console.log('Usuario autenticado:', req.user);
    await pool.query('BEGIN');
    
    // Verificar que el guardia sea de tipo caseta
    console.log('Tipo de guardia del usuario:', req.user.guard_type);
    
    if (req.user.guard_type !== 'caseta' && req.user.guard_type !== 'supervisor') {
      await pool.query('ROLLBACK');
      return res.status(403).json({ 
        ok: false, 
        error: 'Solo los guardias de caseta pueden crear registros en este punto',
        code: 'UNAUTHORIZED_GUARD_TYPE'
      });
    }
    
    let visitorId = null;
    let driverId = null;
    
    // 1) Verificar si se está usando un código de preregistro
    if (req.body.preregistro_code) {
      // Buscar el preregistro por ID
      // Nota: Asumimos que el código es el ID del preregistro
      // En una implementación real, deberías tener una función específica para buscar por código
      const preregistroId = parseInt(req.body.preregistro_code, 10);
      
      if (isNaN(preregistroId)) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ 
          ok: false, 
          error: 'Código de preregistro inválido',
          code: 'INVALID_PREREGISTRO_CODE'
        });
      }
      
      // Aquí deberíamos usar una función específica para buscar por código
      // Por ahora, usamos el ID directamente
      const { getPreregistroById } = require('../models/preregistroModel');
      const preregistro = await getPreregistroById(preregistroId);
      
      if (!preregistro) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ 
          ok: false, 
          error: 'Preregistro no encontrado',
          code: 'PREREGISTRO_NOT_FOUND'
        });
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
        await pool.query('ROLLBACK');
        return res.status(404).json({ 
          ok: false, 
          error: 'Visitante no encontrado',
          code: 'VISITOR_NOT_FOUND'
        });
      }
    }
    
    // 3) Verificar si se está creando o usando un conductor
    if (req.body.driver_id) {
      // Usar conductor existente
      driverId = req.body.driver_id;
    } else if (req.body.driver_name) {
      // Verificar que se hayan enviado las fotos necesarias
      console.log('Files:', req.files);
      if (!req.files?.platePhoto) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ 
          ok: false, 
          error: 'La foto de la placa es obligatoria para crear un conductor',
          code: 'MISSING_REQUIRED_FILE'
        });
      }
      
      // Si no se envió una foto de ID específica para el conductor, usar una por defecto
      const driverIdPhoto = req.files?.driverIdPhoto ? 
        req.files.driverIdPhoto[0].filename : 
        (req.files?.idPhoto ? req.files.idPhoto[0].filename : 'default_driver.jpg');
      
      // Crear nuevo conductor
      driverId = await createDriver({
        driver_name: req.body.driver_name,
        driver_id_photo_path: `uploads/${driverIdPhoto}`,
        plate_photo_path: `uploads/${req.files.platePhoto[0].filename}`
      });
      
      // Si hay un visitante, asociar conductor al visitante
      if (visitorId) {
        await associateDriverToVisitor(visitorId, driverId, true); // true = conductor principal
      } 
    }

    // 4) Usar el ID del preregistro (aceptando tanto preregistro_id como preregistro_code)
    let preregistroId = null;
    let adminId = null;
    
    // Aceptar tanto preregistro_id como preregistro_code
    if (req.body.preregistro_id) {
      preregistroId = parseInt(req.body.preregistro_id, 10);
      console.log('Usando preregistro_id:', preregistroId);
    } else if (req.body.preregistro_code) {
      // Usar preregistro_code como alias de preregistro_id
      preregistroId = parseInt(req.body.preregistro_code, 10);
      console.log('Usando preregistro_code como preregistro_id:', preregistroId);
    }
    
    // Verificar que sea un número válido
    if (preregistroId !== null && isNaN(preregistroId)) {
      preregistroId = null;
      console.log('El ID del preregistro no es un número válido');
    }
    
    // Si hay un ID de preregistro, verificar que exista y obtener el admin_id
    if (preregistroId) {
      console.log('Verificando preregistro en la base de datos...');
      const preregistroResult = await pool.query(
        'SELECT id, admin_id FROM preregistro WHERE id = $1',
        [preregistroId]
      );
      
      if (preregistroResult.rows.length > 0) {
        // El preregistro existe, obtener el admin_id
        adminId = preregistroResult.rows[0].admin_id;
        console.log('Preregistro encontrado, admin_id:', adminId);
      } else {
        // El preregistro no existe
        console.log('No se encontró un preregistro con ID:', preregistroId);
        preregistroId = null; // Resetear el ID ya que no existe
      }
    }
    
    // 5) Insertar el registro en caseta
    const registro = await createGateRegistro({
      preregistro_id: preregistroId,
      admin_id: adminId,
      gate_guard_id: req.user.userId,
      visitor_id: visitorId, // Puede ser null si solo se registra el vehículo
      reason: req.body.reason || 'Pendiente',
      driver_id: driverId
    });

    await pool.query('COMMIT');
    res.status(201).json({ 
      ok: true, 
      data: registro,
      message: 'Registro de caseta creado exitosamente. El visitante debe completar su registro en la entrada del edificio.'
    });
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
 * Completa el registro en la entrada del edificio (segundo filtro)
 * PUT /registros/:id/building-entry
 * Creado por guardias de entrada al edificio.
 */
async function updateWithBuildingEntryByGuard(req, res, next) {
  try {
    await pool.query('BEGIN');
    
    // Verificar que el guardia sea de tipo entrada
    if (req.user.guard_type !== 'entrada' && req.user.guard_type !== 'supervisor') {
      await pool.query('ROLLBACK');
      return res.status(403).json({ 
        ok: false, 
        error: 'Solo los guardias de entrada al edificio pueden actualizar registros en este punto',
        code: 'UNAUTHORIZED_GUARD_TYPE'
      });
    }
    
    const registroId = req.params.id;
    
    // Verificar que el registro exista
    const registro = await getRegistroById(registroId);
    if (!registro) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ 
        ok: false, 
        error: 'Registro no encontrado ' + registroId,
        code: 'REGISTRO_NOT_FOUND'
      });
    }
    
    // Verificar que el registro no tenga ya una entrada al edificio
    if (registro.entry_timestamp) {
      await pool.query('ROLLBACK');
      return res.status(400).json({ 
        ok: false, 
        error: 'Este registro ya tiene una entrada al edificio registrada',
        code: 'ENTRY_ALREADY_REGISTERED'
      });
    }
    
    let visitorId = req.body.visitor_id;
    
    // Si no hay un visitante registrado, crear uno nuevo
    if (!visitorId) {
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
    
    // Verificar si el registro tiene un preregistro asociado
    let reason = req.body.reason;
    
    if (registro.preregistro_id) {
      console.log('El registro tiene un preregistro asociado, obteniendo datos del preregistro...');
      
      // Obtener datos del preregistro
      const preregistroResult = await pool.query(
        'SELECT reason FROM preregistro WHERE id = $1',
        [registro.preregistro_id]
      );
      
      if (preregistroResult.rows.length > 0) {
        const preregistro = preregistroResult.rows[0];
        
        // Usar los datos del preregistro si no se proporcionaron en la solicitud
        reason = reason || preregistro.reason;
        
        console.log('Datos obtenidos del preregistro:', { reason });
      }
    } else {
      // Si no hay preregistro, verificar que se haya proporcionado el motivo
      if (!reason) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ 
          ok: false, 
          error: 'El motivo de la visita es obligatorio',
          code: 'MISSING_REQUIRED_FIELD'
        });
      }
    }
    
    // Obtener el ID de la persona a visitar (admin o sysadmin)
    const person_visited_id = req.body.person_visited_id || null;
    
    // Actualizar el registro con la entrada al edificio
    const updatedRegistro = await updateWithBuildingEntry(registroId, {
      entry_guard_id: req.user.userId,
      visitor_id: visitorId,
      person_visited_id: person_visited_id,
      reason: reason
    });

    await pool.query('COMMIT');
    res.status(200).json({ 
      ok: true, 
      data: updatedRegistro,
      message: 'Entrada al edificio registrada exitosamente.'
    });
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
 * Registra la salida del edificio
 * PUT /registros/:id/building-exit
 * Creado por guardias de entrada al edificio.
 */
async function registerBuildingExitByGuard(req, res, next) {
  try {
    // Verificar que el guardia sea de tipo entrada
    if (req.user.guard_type !== 'entrada' && req.user.guard_type !== 'supervisor') {
      return res.status(403).json({ 
        ok: false, 
        error: 'Solo los guardias de entrada al edificio pueden registrar salidas en este punto',
        code: 'UNAUTHORIZED_GUARD_TYPE'
      });
    }
    
    const registroId = req.params.id;
    
    // Registrar la salida del edificio
    const updatedRegistro = await registerBuildingExit(registroId, {
      guard_id: req.user.userId,
      notes: req.body.notes // Pasar las notas del formulario al modelo
    });

    res.status(200).json({ 
      ok: true, 
      data: updatedRegistro,
      message: 'Salida del edificio registrada exitosamente.'
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
 * Registra la salida de la caseta
 * PUT /registros/:id/gate-exit
 * Creado por guardias de caseta.
 */
async function registerGateExitByGuard(req, res, next) {
  try {
    // Verificar que el guardia sea de tipo caseta
    if (req.user.guard_type !== 'caseta' && req.user.guard_type !== 'supervisor') {
      return res.status(403).json({ 
        ok: false, 
        error: 'Solo los guardias de caseta pueden registrar salidas en este punto',
        code: 'UNAUTHORIZED_GUARD_TYPE'
      });
    }
    
    const registroId = req.params.id;
    const { notes } = req.body; // Obtener las notas del cuerpo de la solicitud
    
    console.log('Registrando salida de caseta con notas:', notes);
    
    // Registrar la salida de la caseta
    const updatedRegistro = await registerGateExit(registroId, {
      guard_id: req.user.userId,
      notes: notes // Pasar las notas al modelo
    });

    res.status(200).json({ 
      ok: true, 
      data: updatedRegistro,
      message: 'Salida de la caseta registrada exitosamente.'
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
 * Busca un registro por ID de preregistro
 * GET /registros/preregistro/:id
 * Usado por guardias para buscar registros por ID de preregistro.
 */
async function findRegistroByPreregistroCode(req, res, next) {
  try {
    const preregistroId = parseInt(req.params.code, 10);
    
    if (isNaN(preregistroId)) {
      return res.status(400).json({ 
        ok: false, 
        error: 'ID de preregistro inválido',
        code: 'INVALID_PREREGISTRO_ID'
      });
    }
    
    // Buscar registros que tengan este preregistro_id
    const { rows } = await pool.query(
      `SELECT * FROM registro WHERE preregistro_id = $1`,
      [preregistroId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        ok: false, 
        error: 'No se encontró ningún registro con ese ID de preregistro',
        code: 'REGISTRO_NOT_FOUND'
      });
    }
    
    res.json({ ok: true, data: rows[0] });
  } catch (err) {
    console.error('Error en findRegistroByPreregistroCode:', err);
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
    await pool.query('BEGIN');
    
    // Verificar que el guardia sea de tipo entrada
    if (req.user.guard_type !== 'entrada' && req.user.guard_type !== 'supervisor') {
      await pool.query('ROLLBACK');
      return res.status(403).json({ 
        ok: false, 
        error: 'Solo los guardias de entrada al edificio pueden crear registros en este punto',
        code: 'UNAUTHORIZED_GUARD_TYPE'
      });
    }
    
    let visitorId = null;
    let preregistroId = null;
    
    // 1) Verificar si se está usando un código de preregistro
    if (req.body.preregistro_code) {
      // Buscar el preregistro por ID
      const preregistroIdValue = parseInt(req.body.preregistro_code, 10);
      
      if (isNaN(preregistroIdValue)) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ 
          ok: false, 
          error: 'Código de preregistro inválido',
          code: 'INVALID_PREREGISTRO_CODE'
        });
      }
      
      const { getPreregistroById } = require('../models/preregistroModel');
      const preregistro = await getPreregistroById(preregistroIdValue);
      
      if (!preregistro) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ 
          ok: false, 
          error: 'Preregistro no encontrado',
          code: 'PREREGISTRO_NOT_FOUND'
        });
      }
      
      // Usar los datos del preregistro
      visitorId = preregistro.visitor_id;
      preregistroId = preregistroIdValue;
    }
    
    // 2) Verificar si se está usando un visitante existente
    if (req.body.visitor_id && !visitorId) {
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
    } else if (!visitorId) {
      // Crear un nuevo visitante
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
    
    // 3) Crear el registro directamente con entrada al edificio
    // Primero creamos un registro en la tabla con los campos básicos
    const { rows } = await pool.query(
      `INSERT INTO registro (
        preregistro_id, 
        visitor_id, 
        entry_guard_id, 
        building_entry_time, 
        reason, 
        status
      ) VALUES ($1, $2, $3, NOW(), $4, 'active')
      RETURNING *`,
      [
        preregistroId, 
        visitorId, 
        req.user.userId, 
        req.body.reason || 'Visita'
      ]
    );
    
    const registro = rows[0];

    await pool.query('COMMIT');
    res.status(201).json({ 
      ok: true, 
      data: registro,
      message: 'Registro de entrada al edificio creado exitosamente.'
    });
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
    
    console.error('Error en createBuildingRegistroByGuard:', err);
    next(err);
  }
}

/**
 * Marca un registro como completado directamente en la caseta (sin entrar al edificio)
 * PUT /registros/:id/complete-at-gate
 * Para casos de paquetería o proveedores que no necesitan entrar al edificio.
 */
async function completeRegistroAtGate(req, res, next) {
  try {
    // Verificar que el guardia sea de tipo caseta
    if (req.user.guard_type !== 'caseta' && req.user.guard_type !== 'supervisor') {
      return res.status(403).json({ 
        ok: false, 
        error: 'Solo los guardias de caseta pueden completar registros en este punto',
        code: 'UNAUTHORIZED_GUARD_TYPE'
      });
    }
    
    const registroId = req.params.id;
    
    // Verificar que el registro exista
    const registro = await getRegistroById(registroId);
    if (!registro) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Registro no encontrado',
        code: 'REGISTRO_NOT_FOUND'
      });
    }
    
    // Verificar que el registro esté en estado 'active' (solo caseta, sin entrada al edificio)
    if (registro.status !== 'active' || registro.entry_timestamp) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Este registro ya ha sido procesado o completado',
        code: 'INVALID_REGISTRO_STATE'
      });
    }
    
    // Actualizar el registro como completado
    const result = await pool.query(
      `UPDATE registro 
       SET status = 'completed', 
           gate_exit_time = NOW()
       WHERE id = $1
       RETURNING *`,
      [registroId]
    );
    
    if (result.rowCount === 0) {
      return res.status(500).json({ 
        ok: false, 
        error: 'No se pudo actualizar el registro',
        code: 'UPDATE_FAILED'
      });
    }
    
    const updatedRegistro = result.rows[0];

    res.status(200).json({ 
      ok: true, 
      data: updatedRegistro,
      message: 'Registro completado exitosamente en caseta.'
    });
  } catch (err) {
    console.error('Error en completeRegistroAtGate:', err);
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
  createGateRegistroByGuard,
  updateWithBuildingEntryByGuard,
  registerBuildingExitByGuard,
  registerGateExitByGuard,
  createBuildingRegistroByGuard,
  completeRegistroAtGate,
  findRegistroByPreregistroCode,
  listRegistros,
  getRegistroById: getRegistroByIdController,
  updateRegistroById: updateRegistroByIdController,
  deleteRegistroById: deleteRegistroByIdController
};
