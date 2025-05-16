const pool = require('../config/db');

/**
 * Clase personalizada para errores del modelo VisitorDriver
 */
class VisitorDriverError extends Error {
  constructor(message, code = 'VISITOR_DRIVER_ERROR', status = 500) {
    super(message);
    this.name = 'VisitorDriverError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Valida que el ID sea un número entero positivo
 * @param {any} id - El ID a validar
 * @throws {VisitorDriverError} Si el ID no es válido
 */
function validateId(id) {
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId) || parsedId <= 0) {
    throw new VisitorDriverError(
      'ID inválido. Debe ser un número entero positivo.',
      'INVALID_ID',
      400
    );
  }
  return parsedId;
}

/**
 * Asocia un conductor a un visitante
 * @param {number} visitorId - ID del visitante
 * @param {number} driverId - ID del conductor
 * @param {boolean} isPrimary - Indica si es el conductor principal
 * @returns {Promise<Object>} - La relación creada
 * @throws {VisitorDriverError} Si ocurre un error
 */
async function associateDriverToVisitor(visitorId, driverId, isPrimary = false) {
  try {
    // Validar IDs
    const validVisitorId = validateId(visitorId);
    const validDriverId = validateId(driverId);

    // Verificar si el visitante existe
    const visitorCheck = await pool.query('SELECT id FROM visitors WHERE id = $1', [validVisitorId]);
    if (visitorCheck.rows.length === 0) {
      throw new VisitorDriverError(
        `No existe un visitante con ID ${validVisitorId}`,
        'VISITOR_NOT_FOUND',
        404
      );
    }

    // Verificar si el conductor existe
    const driverCheck = await pool.query('SELECT id FROM drivers WHERE id = $1', [validDriverId]);
    if (driverCheck.rows.length === 0) {
      throw new VisitorDriverError(
        `No existe un conductor con ID ${validDriverId}`,
        'DRIVER_NOT_FOUND',
        404
      );
    }

    // Si es primario, actualizar cualquier otro conductor primario para este visitante
    if (isPrimary) {
      await pool.query(
        'UPDATE visitor_drivers SET is_primary = false WHERE visitor_id = $1 AND is_primary = true',
        [validVisitorId]
      );
    }

    // Crear la asociación
    const { rows } = await pool.query(
      `INSERT INTO visitor_drivers (visitor_id, driver_id, is_primary)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [validVisitorId, validDriverId, isPrimary]
    );

    return rows[0];
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof VisitorDriverError) {
      throw error;
    }

    // Manejar errores específicos de PostgreSQL
    if (error.code === '23505') { // Unique violation
      throw new VisitorDriverError(
        'Este conductor ya está asociado a este visitante.',
        'DUPLICATE_ASSOCIATION',
        400
      );
    }

    // Registrar el error para depuración
    console.error('Error en associateDriverToVisitor:', error);
    
    // Lanzar un error genérico
    throw new VisitorDriverError(
      'Error al asociar conductor con visitante.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Desasocia un conductor de un visitante
 * @param {number} visitorId - ID del visitante
 * @param {number} driverId - ID del conductor
 * @returns {Promise<boolean>} - true si se eliminó correctamente
 * @throws {VisitorDriverError} Si ocurre un error
 */
async function dissociateDriverFromVisitor(visitorId, driverId) {
  try {
    // Validar IDs
    const validVisitorId = validateId(visitorId);
    const validDriverId = validateId(driverId);

    // Eliminar la asociación
    const result = await pool.query(
      'DELETE FROM visitor_drivers WHERE visitor_id = $1 AND driver_id = $2',
      [validVisitorId, validDriverId]
    );

    if (result.rowCount === 0) {
      throw new VisitorDriverError(
        'No existe una asociación entre este visitante y conductor.',
        'ASSOCIATION_NOT_FOUND',
        404
      );
    }

    return true;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof VisitorDriverError) {
      throw error;
    }

    // Registrar el error para depuración
    console.error('Error en dissociateDriverFromVisitor:', error);
    
    // Lanzar un error genérico
    throw new VisitorDriverError(
      'Error al desasociar conductor de visitante.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Establece un conductor como primario para un visitante
 * @param {number} visitorId - ID del visitante
 * @param {number} driverId - ID del conductor
 * @returns {Promise<Object>} - La relación actualizada
 * @throws {VisitorDriverError} Si ocurre un error
 */
async function setPrimaryDriver(visitorId, driverId) {
  try {
    // Validar IDs
    const validVisitorId = validateId(visitorId);
    const validDriverId = validateId(driverId);

    // Verificar si existe la asociación
    const checkAssociation = await pool.query(
      'SELECT id FROM visitor_drivers WHERE visitor_id = $1 AND driver_id = $2',
      [validVisitorId, validDriverId]
    );

    if (checkAssociation.rows.length === 0) {
      throw new VisitorDriverError(
        'No existe una asociación entre este visitante y conductor.',
        'ASSOCIATION_NOT_FOUND',
        404
      );
    }

    // Actualizar todos los conductores a no primarios
    await pool.query(
      'UPDATE visitor_drivers SET is_primary = false WHERE visitor_id = $1',
      [validVisitorId]
    );

    // Establecer el conductor especificado como primario
    const { rows } = await pool.query(
      `UPDATE visitor_drivers 
       SET is_primary = true, updated_at = now()
       WHERE visitor_id = $1 AND driver_id = $2
       RETURNING *`,
      [validVisitorId, validDriverId]
    );

    return rows[0];
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof VisitorDriverError) {
      throw error;
    }

    // Registrar el error para depuración
    console.error('Error en setPrimaryDriver:', error);
    
    // Lanzar un error genérico
    throw new VisitorDriverError(
      'Error al establecer conductor primario.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Obtiene todas las asociaciones de un visitante
 * @param {number} visitorId - ID del visitante
 * @returns {Promise<Array>} - Lista de asociaciones
 * @throws {VisitorDriverError} Si ocurre un error
 */
async function getVisitorDriverAssociations(visitorId) {
  try {
    // Validar ID
    const validVisitorId = validateId(visitorId);

    // Obtener las asociaciones
    const { rows } = await pool.query(
      `SELECT vd.*, d.driver_name, d.driver_id_photo_path, d.plate_photo_path
       FROM visitor_drivers vd
       JOIN drivers d ON vd.driver_id = d.id
       WHERE vd.visitor_id = $1
       ORDER BY vd.is_primary DESC, vd.created_at DESC`,
      [validVisitorId]
    );

    return rows;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof VisitorDriverError) {
      throw error;
    }

    // Registrar el error para depuración
    console.error('Error en getVisitorDriverAssociations:', error);
    
    // Lanzar un error genérico
    throw new VisitorDriverError(
      'Error al obtener asociaciones de conductores.',
      'DATABASE_ERROR',
      500
    );
  }
}

module.exports = {
  associateDriverToVisitor,
  dissociateDriverFromVisitor,
  setPrimaryDriver,
  getVisitorDriverAssociations,
  VisitorDriverError
};
