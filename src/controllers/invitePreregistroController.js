// src/controllers/invitePreregistroController.js
const pool = require('../config/db');
const {
  lockInviteByToken,
  markInviteUsed,
  createVisitor,
  createDriver,
  associateDriverToVisitor,
  createPreregistro,
  InvitePreregistroError
} = require('../models/invitePreregistroModel');
const upload = require('../middlewares/upload');

/**
 * Maneja el proceso de preregistro a través de una invitación
 * POST /invite/preregistro
 */
async function handleInvitePreregistro(req, res, next) {
  const token = req.query.token || req.body.token;
  if (!token) {
    return res.status(400).json({ 
      ok: false, 
      error: 'Falta token de invitación',
      code: 'MISSING_TOKEN'
    });
  }

  try {
    await pool.query('BEGIN');

    // 1. Bloquear y obtener invite
    const invite = await lockInviteByToken(token);
    if (!invite) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ 
        ok: false, 
        error: 'Invitación no encontrada',
        code: 'INVITE_NOT_FOUND'
      });
    }
    
    if (invite.used) {
      await pool.query('ROLLBACK');
      return res.status(410).json({ 
        ok: false, 
        error: 'Esta invitación ya ha sido utilizada',
        code: 'INVITE_ALREADY_USED'
      });
    }

    // 2. Crear visitante
    if (!req.body.visitor_name) {
      await pool.query('ROLLBACK');
      return res.status(400).json({ 
        ok: false, 
        error: 'El nombre del visitante es obligatorio',
        code: 'MISSING_REQUIRED_FIELD'
      });
    }
    
    if (!req.files?.idPhoto) {
      await pool.query('ROLLBACK');
      return res.status(400).json({ 
        ok: false, 
        error: 'La foto de identificación es obligatoria',
        code: 'MISSING_REQUIRED_FILE'
      });
    }
    
    const visitorId = await createVisitor({
      visitor_name: req.body.visitor_name,
      visitor_id_photo_path: `uploads/${req.files.idPhoto[0].filename}`,
      phone: req.body.phone,
      email: req.body.email,
      company: req.body.company,
      type: req.body.type || 'visitante'
    });

    // 3. Crear conductor (opcional)
    let driverId;
    if (req.body.driver_name) { // Si se proporciona driver_name, crear conductor
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
      
      driverId = await createDriver({
        driver_name: req.body.driver_name,
        driver_id_photo_path: `uploads/${driverIdPhoto}`,
        plate_photo_path: `uploads/${req.files.platePhoto[0].filename}`
      });
      
      // Asociar conductor al visitante
      await associateDriverToVisitor(visitorId, driverId, true); // true = conductor principal
    }

    // 4. Crear preregistro
    const preregistro = await createPreregistro({
      admin_id: invite.admin_id,
      invite_id: invite.id,
      visitor_id: visitorId,
      scheduled_date: req.body.scheduled_date || req.body.date, // Compatibilidad con ambos nombres
      reason: req.body.reason,
      person_visited: req.body.person_visited, // Persona que se visita
      // Si se proporcionó un conductor, automáticamente establecer parking_access a true
      parking_access: driverId ? true : (req.body.parking_access === 'true' || req.body.parking_access === true)
    });

    // 5. Marcar invite como usado
    await markInviteUsed(invite.id);

    await pool.query('COMMIT');
    res.status(201).json({ ok: true, data: preregistro });
  } catch (err) {
    await pool.query('ROLLBACK');
    
    if (err instanceof InvitePreregistroError) {
      return res.status(err.status).json({ 
        ok: false, 
        error: err.message,
        code: err.code
      });
    }
    
    // Para otros tipos de errores
    if (err.status) {
      return res.status(err.status).json({ 
        ok: false, 
        error: err.message,
        code: 'UNKNOWN_ERROR'
      });
    }
    
    next(err);
  }
}

module.exports = { handleInvitePreregistro };
