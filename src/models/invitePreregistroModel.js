const pool = require('../config/db');

/**
 * Clase personalizada para errores del modelo InvitePreregistro
 */
class InvitePreregistroError extends Error {
  constructor(message, code = 'INVITE_PREREGISTRO_ERROR', status = 500) {
    super(message);
    this.name = 'InvitePreregistroError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Bloquea una invitación por su token para evitar uso concurrente
 * @param {string} token - Token único de la invitación
 * @returns {Promise<Object|null>} La invitación encontrada o null
 * @throws {InvitePreregistroError} Si ocurre un error
 */
async function lockInviteByToken(token) {
  try {
    if (!token) {
      throw new InvitePreregistroError(
        'El token de invitación es obligatorio.',
        'MISSING_TOKEN',
        400
      );
    }
    
    const res = await pool.query(
      `SELECT id, admin_id, used
       FROM preregistro_invites
       WHERE token = $1
       FOR UPDATE`,
      [token]
    );
    
    return res.rows[0] || null;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof InvitePreregistroError) {
      throw error;
    }
    
    console.error('Error en lockInviteByToken:', error);
    throw new InvitePreregistroError(
      'Error al bloquear la invitación.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Marca una invitación como utilizada
 * @param {number} inviteId - ID de la invitación
 * @returns {Promise<boolean>} true si se marcó correctamente
 * @throws {InvitePreregistroError} Si ocurre un error
 */
async function markInviteUsed(inviteId) {
  try {
    if (!inviteId) {
      throw new InvitePreregistroError(
        'El ID de la invitación es obligatorio.',
        'MISSING_INVITE_ID',
        400
      );
    }
    
    const result = await pool.query(
      `UPDATE preregistro_invites
         SET used = true, used_at = now()
       WHERE id = $1`,
      [inviteId]
    );
    
    if (result.rowCount === 0) {
      throw new InvitePreregistroError(
        'No se pudo marcar la invitación como utilizada.',
        'UPDATE_FAILED',
        500
      );
    }
    
    return true;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof InvitePreregistroError) {
      throw error;
    }
    
    console.error('Error en markInviteUsed:', error);
    throw new InvitePreregistroError(
      'Error al marcar la invitación como utilizada.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Crea un nuevo visitante
 * @param {Object} data - Datos del visitante
 * @param {string} data.visitor_name - Nombre del visitante
 * @param {string} data.visitor_id_photo_path - Ruta de la foto de ID
 * @param {string} data.phone - Teléfono del visitante (opcional)
 * @param {string} data.email - Email del visitante (opcional)
 * @param {string} data.company - Compañía del visitante (opcional)
 * @param {string} data.type - Tipo de visitante
 * @returns {Promise<number>} ID del visitante creado
 * @throws {InvitePreregistroError} Si ocurre un error
 */
async function createVisitor(data) {
  try {
    const { visitor_name, visitor_id_photo_path, phone, email, company, type } = data;
    
    // Validar datos obligatorios
    if (!visitor_name) {
      throw new InvitePreregistroError(
        'El nombre del visitante es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    const res = await pool.query(
      `INSERT INTO visitors
         (visitor_name, visitor_id_photo_path, phone, email, company, type)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [visitor_name, visitor_id_photo_path, phone, email, company, type]
    );
    
    return res.rows[0].id;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof InvitePreregistroError) {
      throw error;
    }
    
    // Manejar errores específicos de PostgreSQL
    if (error.code === '23505') { // Unique violation
      throw new InvitePreregistroError(
        'Ya existe un visitante con esos datos.',
        'DUPLICATE_VISITOR',
        400
      );
    }
    
    console.error('Error en createVisitor:', error);
    throw new InvitePreregistroError(
      'Error al crear el visitante.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Crea un nuevo conductor
 * @param {Object} data - Datos del conductor
 * @param {string} data.driver_name - Nombre del conductor
 * @param {string} data.driver_id_photo_path - Ruta de la foto de ID
 * @param {string} data.plate_photo_path - Ruta de la foto de placa
 * @returns {Promise<number>} ID del conductor creado
 * @throws {InvitePreregistroError} Si ocurre un error
 */
async function createDriver(data) {
  try {
    const { driver_name, driver_id_photo_path, plate_photo_path } = data;
    
    // Validar datos obligatorios
    if (!driver_name) {
      throw new InvitePreregistroError(
        'El nombre del conductor es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    const res = await pool.query(
      `INSERT INTO drivers
         (driver_name, driver_id_photo_path, plate_photo_path)
       VALUES ($1,$2,$3)
       RETURNING id`,
      [driver_name, driver_id_photo_path, plate_photo_path]
    );
    
    return res.rows[0].id;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof InvitePreregistroError) {
      throw error;
    }
    
    // Manejar errores específicos de PostgreSQL
    if (error.code === '23505') { // Unique violation
      throw new InvitePreregistroError(
        'Ya existe un conductor con esos datos.',
        'DUPLICATE_DRIVER',
        400
      );
    }
    
    console.error('Error en createDriver:', error);
    throw new InvitePreregistroError(
      'Error al crear el conductor.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Asocia un conductor a un visitante
 * @param {number} visitorId - ID del visitante
 * @param {number} driverId - ID del conductor
 * @param {boolean} isPrimary - Si es el conductor principal
 * @returns {Promise<Object>} La asociación creada
 * @throws {InvitePreregistroError} Si ocurre un error
 */
async function associateDriverToVisitor(visitorId, driverId, isPrimary = false) {
  try {
    // Validar datos obligatorios
    if (!visitorId) {
      throw new InvitePreregistroError(
        'El ID del visitante es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    if (!driverId) {
      throw new InvitePreregistroError(
        'El ID del conductor es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    const res = await pool.query(
      `INSERT INTO visitor_drivers
         (visitor_id, driver_id, is_primary)
       VALUES ($1,$2,$3)
       RETURNING *`,
      [visitorId, driverId, isPrimary]
    );
    
    return res.rows[0];
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof InvitePreregistroError) {
      throw error;
    }
    
    // Manejar errores específicos de PostgreSQL
    if (error.code === '23505') { // Unique violation
      throw new InvitePreregistroError(
        'Este conductor ya está asociado a este visitante.',
        'DUPLICATE_ASSOCIATION',
        400
      );
    }
    
    console.error('Error en associateDriverToVisitor:', error);
    throw new InvitePreregistroError(
      'Error al asociar el conductor al visitante.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Crea un nuevo preregistro
 * @param {Object} data - Datos del preregistro
 * @param {number} data.admin_id - ID del administrador
 * @param {number} data.invite_id - ID de la invitación
 * @param {number} data.visitor_id - ID del visitante
 * @param {string} data.scheduled_date - Fecha programada del preregistro
 * @param {string} data.reason - Motivo de la visita
 * @param {string} data.person_visited - Persona que se visita
 * @param {boolean} data.parking_access - Indica si necesita acceso al estacionamiento
 * @returns {Promise<Object>} El preregistro creado
 * @throws {InvitePreregistroError} Si ocurre un error
 */
async function createPreregistro(data) {
  try {
    const { admin_id, invite_id, visitor_id, scheduled_date, reason, person_visited, parking_access } = data;
    
    // Validar datos obligatorios
    if (!admin_id) {
      throw new InvitePreregistroError(
        'El ID del administrador es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    if (!visitor_id) {
      throw new InvitePreregistroError(
        'El ID del visitante es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    const res = await pool.query(
      `INSERT INTO preregistro
         (admin_id, invite_id, visitor_id, scheduled_date, reason, person_visited, parking_access)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [admin_id, invite_id, visitor_id, scheduled_date, reason, person_visited, parking_access || false]
    );
    
    return res.rows[0];
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof InvitePreregistroError) {
      throw error;
    }
    
    // Manejar errores específicos de PostgreSQL
    if (error.code === '23503') { // Foreign key violation
      throw new InvitePreregistroError(
        'El administrador, invitación o visitante especificado no existe.',
        'FOREIGN_KEY_VIOLATION',
        400
      );
    }
    
    console.error('Error en createPreregistro:', error);
    throw new InvitePreregistroError(
      'Error al crear el preregistro.',
      'DATABASE_ERROR',
      500
    );
  }
}

module.exports = {
  lockInviteByToken,
  markInviteUsed,
  createVisitor,
  createDriver,
  associateDriverToVisitor,
  createPreregistro,
  InvitePreregistroError
};
