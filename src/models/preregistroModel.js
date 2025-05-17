const pool = require('../config/db');

/**
 * Clase personalizada para errores del modelo Preregistro
 */
class PreregistroError extends Error {
  constructor(message, code = 'PREREGISTRO_ERROR', status = 500) {
    super(message);
    this.name = 'PreregistroError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Valida que el ID sea un número entero positivo
 * @param {any} id - El ID a validar
 * @throws {PreregistroError} Si el ID no es válido
 */
function validateId(id) {
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId) || parsedId <= 0) {
    throw new PreregistroError(
      'ID inválido. Debe ser un número entero positivo.',
      'INVALID_ID',
      400
    );
  }
  return parsedId;
}

/**
 * Devuelve todos los preregistros con información detallada del visitante.
 * @returns {Promise<Array>} Lista de preregistros
 * @throws {PreregistroError} Si ocurre un error
 */
async function getAllPreregistros() {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, v.visitor_name, v.phone, v.email, v.company, v.type, v.visitor_id_photo_path
      FROM preregistro p
      JOIN visitors v ON p.visitor_id = v.id
      ORDER BY p.created_at DESC
    `);
    return rows;
  } catch (error) {
    console.error('Error en getAllPreregistros:', error);
    throw new PreregistroError(
      'Error al obtener la lista de preregistros.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Devuelve los preregistros de un admin con información detallada del visitante
 * @param {number} adminId - ID del administrador
 * @returns {Promise<Array>} Lista de preregistros del administrador
 * @throws {PreregistroError} Si ocurre un error
 */
async function getPreregistrosByAdmin(adminId) {
  try {
    const validAdminId = validateId(adminId);
    
    const { rows } = await pool.query(`
      SELECT p.*, v.visitor_name, v.phone, v.email, v.company, v.type, v.visitor_id_photo_path
      FROM preregistro p
      JOIN visitors v ON p.visitor_id = v.id
      WHERE p.admin_id = $1
      ORDER BY p.created_at DESC
    `, [validAdminId]);
    
    return rows;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof PreregistroError) {
      throw error;
    }
    
    console.error('Error en getPreregistrosByAdmin:', error);
    throw new PreregistroError(
      'Error al obtener los preregistros del administrador.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Devuelve un preregistro por su ID con información detallada del visitante.
 * @param {number} id - ID del preregistro
 * @returns {Promise<Object|null>} El preregistro encontrado o null
 * @throws {PreregistroError} Si ocurre un error
 */
async function getPreregistroById(id) {
  try {
    const validId = validateId(id);
    
    const { rows } = await pool.query(`
      SELECT p.*, v.visitor_name, v.phone, v.email, v.company, v.type, v.visitor_id_photo_path
      FROM preregistro p
      JOIN visitors v ON p.visitor_id = v.id
      WHERE p.id = $1
    `, [validId]);
    
    return rows[0] || null;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof PreregistroError) {
      throw error;
    }
    
    console.error('Error en getPreregistroById:', error);
    throw new PreregistroError(
      'Error al obtener el preregistro.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Actualiza campos dinámicos de un preregistro.
 * @param {number} id - ID del preregistro
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} El preregistro actualizado
 * @throws {PreregistroError} Si ocurre un error
 */
async function updatePreregistroById(id, data) {
  try {
    const validId = validateId(id);
    
    // Verificar si el preregistro existe
    const preregistro = await getPreregistroById(validId);
    if (!preregistro) {
      throw new PreregistroError(
        `No existe un preregistro con ID ${validId}`,
        'PREREGISTRO_NOT_FOUND',
        404
      );
    }
    
    // Verificar que hay datos para actualizar
    if (!data || Object.keys(data).length === 0) {
      throw new PreregistroError(
        'No se proporcionaron datos para actualizar.',
        'NO_UPDATE_DATA',
        400
      );
    }
    
    const keys = Object.keys(data);
    const sets = keys.map((k, i) => `${k} = $${i+1}`).join(',');
    const values = keys.map(k => data[k]);

    console.log('Campos a actualizar:', keys);
    console.log('Valores a actualizar:', values);
    console.log('Consulta SQL:', `UPDATE preregistro SET ${sets}, updated_at = now() WHERE id = $${keys.length + 1} RETURNING *`);

    const { rows } = await pool.query(
      `UPDATE preregistro
         SET ${sets}, updated_at = now()
       WHERE id = $${keys.length + 1}
       RETURNING *`,
      [...values, validId]
    );
    
    console.log('Resultado de la actualización:', rows[0]);
    
    if (rows.length === 0) {
      throw new PreregistroError(
        'No se pudo actualizar el preregistro.',
        'UPDATE_FAILED',
        500
      );
    }
    
    return rows[0];
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof PreregistroError) {
      throw error;
    }
    
    console.error('Error en updatePreregistroById:', error);
    throw new PreregistroError(
      'Error al actualizar el preregistro.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Elimina un preregistro (y deja intacto el visitante).
 * @param {number} id - ID del preregistro
 * @returns {Promise<boolean>} true si se eliminó correctamente
 * @throws {PreregistroError} Si ocurre un error
 */
async function deletePreregistroById(id) {
  try {
    const validId = validateId(id);
    
    // Verificar si el preregistro existe
    const preregistro = await getPreregistroById(validId);
    if (!preregistro) {
      throw new PreregistroError(
        `No existe un preregistro con ID ${validId}`,
        'PREREGISTRO_NOT_FOUND',
        404
      );
    }
    
    const result = await pool.query(
      `DELETE FROM preregistro WHERE id = $1`,
      [validId]
    );
    
    if (result.rowCount === 0) {
      throw new PreregistroError(
        'No se pudo eliminar el preregistro.',
        'DELETE_FAILED',
        500
      );
    }
    
    return true;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof PreregistroError) {
      throw error;
    }
    
    console.error('Error en deletePreregistroById:', error);
    throw new PreregistroError(
      'Error al eliminar el preregistro.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Crea un nuevo preregistro asociado a un visitante
 * @param {Object} data - Datos del preregistro
 * @param {number} data.visitor_id - ID del visitante
 * @param {number} data.admin_id - ID del administrador
 * @param {string} data.scheduled_date - Fecha programada del preregistro
 * @param {string} data.reason - Motivo de la visita
 * @param {string} data.person_visited - Persona que se visita
 * @param {boolean} data.parking_access - Indica si necesita acceso al estacionamiento
 * @param {string} data.invite_id - ID de la invitación (opcional)
 * @returns {Promise<number>} ID del preregistro creado
 * @throws {PreregistroError} Si ocurre un error
 */
async function createPreregistro(data) {
  try {
    // Validar datos obligatorios
    if (!data.visitor_id) {
      throw new PreregistroError(
        'El ID del visitante es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    if (!data.admin_id) {
      throw new PreregistroError(
        'El ID del administrador es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    // Validar que el visitante exista
    const visitorExists = await pool.query(
      'SELECT id FROM visitors WHERE id = $1',
      [data.visitor_id]
    );
    
    if (visitorExists.rows.length === 0) {
      throw new PreregistroError(
        `No existe un visitante con ID ${data.visitor_id}`,
        'VISITOR_NOT_FOUND',
        404
      );
    }
    
    // Crear el preregistro
    const { rows } = await pool.query(`
      INSERT INTO preregistro (
        visitor_id, admin_id, scheduled_date, reason, person_visited, parking_access, invite_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `, [
      data.visitor_id,
      data.admin_id,
      data.scheduled_date,
      data.reason,
      data.person_visited || null,
      data.parking_access !== undefined ? data.parking_access : false,
      data.invite_id || null
    ]);
    
    return rows[0].id;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof PreregistroError) {
      throw error;
    }
    
    // Manejar errores específicos de PostgreSQL
    if (error.code === '23503') { // Foreign key violation
      throw new PreregistroError(
        'El visitante o administrador especificado no existe.',
        'FOREIGN_KEY_VIOLATION',
        400
      );
    }
    
    console.error('Error en createPreregistro:', error);
    throw new PreregistroError(
      'Error al crear el preregistro.',
      'DATABASE_ERROR',
      500
    );
  }
}

module.exports = {
  getAllPreregistros,
  getPreregistroById,
  updatePreregistroById,
  deletePreregistroById,
  getPreregistrosByAdmin,
  createPreregistro,
  PreregistroError
};
