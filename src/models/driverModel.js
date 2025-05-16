const pool = require('../config/db');

/**
 * Clase personalizada para errores del modelo Driver
 */
class DriverError extends Error {
  constructor(message, code = 'DRIVER_ERROR', status = 500) {
    super(message);
    this.name = 'DriverError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Valida que el ID sea un número entero positivo
 * @param {any} id - El ID a validar
 * @throws {DriverError} Si el ID no es válido
 */
function validateId(id) {
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId) || parsedId <= 0) {
    throw new DriverError(
      'ID inválido. Debe ser un número entero positivo.',
      'INVALID_ID',
      400
    );
  }
  return parsedId;
}

/**
 * Obtiene todos los conductores ordenados por fecha de creación
 * @returns {Promise<Array>} Lista de conductores
 * @throws {DriverError} Si ocurre un error
 */
async function getAllDrivers() {
  try {
    const { rows } = await pool.query(`
      SELECT id, driver_name, driver_id_photo_path, plate_photo_path,
             created_at, updated_at
      FROM drivers
      ORDER BY created_at DESC
    `);
    return rows;
  } catch (error) {
    console.error('Error en getAllDrivers:', error);
    throw new DriverError(
      'Error al obtener la lista de conductores.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Obtiene un conductor por su ID
 * @param {number} id - ID del conductor
 * @returns {Promise<Object|null>} El conductor encontrado o null
 * @throws {DriverError} Si ocurre un error
 */
async function getDriverById(id) {
  try {
    const validId = validateId(id);
    
    const { rows } = await pool.query(`
      SELECT * FROM drivers WHERE id = $1
    `, [validId]);
    
    return rows[0] || null;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof DriverError) {
      throw error;
    }
    
    console.error('Error en getDriverById:', error);
    throw new DriverError(
      'Error al obtener el conductor.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Crea un nuevo conductor
 * @param {Object} driverData - Datos del conductor
 * @param {string} driverData.driver_name - Nombre del conductor
 * @param {string} driverData.driver_id_photo_path - Ruta de la foto de ID
 * @param {string} driverData.plate_photo_path - Ruta de la foto de placa
 * @returns {Promise<number>} ID del conductor creado
 * @throws {DriverError} Si ocurre un error
 */
async function createDriver({ driver_name, driver_id_photo_path, plate_photo_path }) {
  try {
    // Validar datos obligatorios
    if (!driver_name) {
      throw new DriverError(
        'El nombre del conductor es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    const { rows } = await pool.query(`
      INSERT INTO drivers
        (driver_name, driver_id_photo_path, plate_photo_path)
      VALUES
        ($1, $2, $3)
      RETURNING id
    `, [driver_name, driver_id_photo_path, plate_photo_path]);
    
    return rows[0].id;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof DriverError) {
      throw error;
    }
    
    // Manejar errores específicos de PostgreSQL
    if (error.code === '23505') { // Unique violation
      throw new DriverError(
        'Ya existe un conductor con esos datos.',
        'DUPLICATE_DRIVER',
        400
      );
    }
    
    console.error('Error en createDriver:', error);
    throw new DriverError(
      'Error al crear el conductor.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Actualiza un conductor existente
 * @param {number} id - ID del conductor
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} El conductor actualizado
 * @throws {DriverError} Si ocurre un error
 */
async function updateDriver(id, data) {
  try {
    const validId = validateId(id);
    
    // Verificar si el conductor existe
    const driver = await getDriverById(validId);
    if (!driver) {
      throw new DriverError(
        `No existe un conductor con ID ${validId}`,
        'DRIVER_NOT_FOUND',
        404
      );
    }
    
    // Verificar que hay datos para actualizar
    if (!data || Object.keys(data).length === 0) {
      throw new DriverError(
        'No se proporcionaron datos para actualizar.',
        'NO_UPDATE_DATA',
        400
      );
    }
    
    const keys = Object.keys(data);
    const sets = keys.map((k, i) => `${k}=$${i+1}`).join(',');
    const values = keys.map(k => data[k]);

    const { rows } = await pool.query(
      `UPDATE drivers
         SET ${sets}, updated_at=now()
       WHERE id=$${keys.length+1}
       RETURNING *`,
      [...values, validId]
    );
    
    return rows[0];
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof DriverError) {
      throw error;
    }
    
    console.error('Error en updateDriver:', error);
    throw new DriverError(
      'Error al actualizar el conductor.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Elimina un conductor por su ID
 * @param {number} id - ID del conductor
 * @returns {Promise<boolean>} true si se eliminó correctamente
 * @throws {DriverError} Si ocurre un error
 */
async function deleteDriver(id) {
  try {
    const validId = validateId(id);
    
    // Verificar si el conductor existe
    const driver = await getDriverById(validId);
    if (!driver) {
      throw new DriverError(
        `No existe un conductor con ID ${validId}`,
        'DRIVER_NOT_FOUND',
        404
      );
    }
    
    const result = await pool.query(`DELETE FROM drivers WHERE id = $1`, [validId]);
    
    if (result.rowCount === 0) {
      throw new DriverError(
        'No se pudo eliminar el conductor.',
        'DELETE_FAILED',
        500
      );
    }
    
    return true;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof DriverError) {
      throw error;
    }
    
    // Manejar errores de restricción de clave foránea
    if (error.code === '23503') { // Foreign key violation
      throw new DriverError(
        'No se puede eliminar el conductor porque está siendo utilizado en otros registros.',
        'FOREIGN_KEY_VIOLATION',
        400
      );
    }
    
    console.error('Error en deleteDriver:', error);
    throw new DriverError(
      'Error al eliminar el conductor.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Busca conductores por nombre
 * @param {string} searchTerm - Término de búsqueda
 * @returns {Promise<Array>} Lista de conductores que coinciden
 * @throws {DriverError} Si ocurre un error
 */
async function searchDrivers(searchTerm) {
  try {
    if (!searchTerm || searchTerm.trim() === '') {
      throw new DriverError(
        'El término de búsqueda no puede estar vacío.',
        'INVALID_SEARCH_TERM',
        400
      );
    }
    
    const { rows } = await pool.query(`
      SELECT * FROM drivers
      WHERE 
        driver_name ILIKE $1
      ORDER BY created_at DESC
    `, [`%${searchTerm}%`]);
    
    return rows;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof DriverError) {
      throw error;
    }
    
    console.error('Error en searchDrivers:', error);
    throw new DriverError(
      'Error al buscar conductores.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Obtiene los conductores asociados a un visitante
 * @param {number} visitorId - ID del visitante
 * @returns {Promise<Array>} Lista de conductores asociados al visitante
 * @throws {DriverError} Si ocurre un error
 */
async function getDriversByVisitorId(visitorId) {
  try {
    const validVisitorId = validateId(visitorId);
    
    const { rows } = await pool.query(`
      SELECT d.* 
      FROM drivers d
      JOIN visitor_drivers vd ON d.id = vd.driver_id
      WHERE vd.visitor_id = $1
      ORDER BY vd.is_primary DESC, d.created_at DESC
    `, [validVisitorId]);
    
    return rows;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof DriverError) {
      throw error;
    }
    
    console.error('Error en getDriversByVisitorId:', error);
    throw new DriverError(
      'Error al obtener los conductores del visitante.',
      'DATABASE_ERROR',
      500
    );
  }
}

module.exports = {
  getAllDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver,
  searchDrivers,
  getDriversByVisitorId,
  DriverError
};
