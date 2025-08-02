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

/**
 * Busca un conductor por su código de etiqueta
 * @param {string} driverTag - Código de etiqueta del conductor
 * @returns {Promise<Object|null>} El conductor encontrado o null
 * @throws {DriverError} Si ocurre un error
 */
async function getDriverByTag(driverTag) {
  try {
    if (!driverTag || typeof driverTag !== 'string') {
      throw new DriverError(
        'El código de etiqueta del conductor es requerido y debe ser una cadena de texto',
        'INVALID_DRIVER_TAG',
        400
      );
    }
    
    // Buscar en la tabla de relación registro_visitantes para encontrar el driver_id asociado al código
    // y también verificar si es conductor-visitante
    const relationQuery = `
      SELECT 
        rv.driver_id,
        rv.is_driver_visitor,
        rv.driver_visitor_id,
        rv.registro_id,
        r.registration_code
      FROM registro_visitantes rv
      JOIN registro r ON rv.registro_id = r.id
      WHERE rv.driver_tag = $1
      LIMIT 1
    `;
    
    const relationResult = await pool.query(relationQuery, [driverTag]);
    
    if (relationResult.rows.length === 0) {
      return null;
    }
    
    const { driver_id, is_driver_visitor, driver_visitor_id, registro_id, registration_code } = relationResult.rows[0];
    
    // Obtener los datos completos del conductor
    const driverQuery = `
      SELECT * FROM drivers
      WHERE id = $1
    `;
    
    const { rows } = await pool.query(driverQuery, [driver_id]);
    
    if (rows.length === 0) {
      return null;
    }
    
    const driver = rows[0];
    
    // Añadir información adicional sobre si es conductor-visitante
    driver.is_driver_visitor = is_driver_visitor || false;
    driver.driver_visitor_id = driver_visitor_id;
    driver.registro_id = registro_id;
    driver.registration_code = registration_code;
    
    // Si es conductor-visitante, obtener los datos del visitante asociado
    if (is_driver_visitor && driver_visitor_id) {
      const visitorQuery = `
        SELECT * FROM visitors
        WHERE id = $1
      `;
      
      const visitorResult = await pool.query(visitorQuery, [driver_visitor_id]);
      
      if (visitorResult.rows.length > 0) {
        driver.visitor_data = visitorResult.rows[0];
      }
    }
    
    return driver;
  } catch (error) {
    if (error instanceof DriverError) {
      throw error;
    }
    console.error('Error en getDriverByTag:', error);
    throw new DriverError(
      `Error al buscar conductor por código: ${error.message}`,
      'DRIVER_SEARCH_ERROR',
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
  getDriverByTag,
  DriverError
};
