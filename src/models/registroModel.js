// src/models/registroModel.js
const pool = require('../config/db');

/**
 * Clase personalizada para errores del modelo Registro
 */
class RegistroError extends Error {
  constructor(message, code = 'REGISTRO_ERROR', status = 500) {
    super(message);
    this.name = 'RegistroError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Valida que el ID sea un número entero positivo
 * @param {any} id - El ID a validar
 * @throws {RegistroError} Si el ID no es válido
 */
function validateId(id) {
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId) || parsedId <= 0) {
    throw new RegistroError(
      'ID inválido. Debe ser un número entero positivo.',
      'INVALID_ID',
      400
    );
  }
  return parsedId;
}

/**
 * Crea un nuevo registro de entrada
 * @param {Object} data - Datos del registro
 * @param {number|null} data.preregistro_id - ID del preregistro (opcional)
 * @param {number} data.guard_user_id - ID del guardia
 * @param {number} data.visitor_id - ID del visitante
 * @param {string} data.reason - Motivo de la visita
 * @returns {Promise<Object>} El registro creado
 * @throws {RegistroError} Si ocurre un error
 */
async function createRegistro({ preregistro_id, guard_user_id, visitor_id, reason }) {
  try {
    // Validar datos obligatorios
    if (!guard_user_id) {
      throw new RegistroError(
        'El ID del guardia es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    if (!visitor_id) {
      throw new RegistroError(
        'El ID del visitante es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    // Validar que el visitante exista
    const visitorExists = await pool.query(
      'SELECT id FROM visitors WHERE id = $1',
      [visitor_id]
    );
    
    if (visitorExists.rows.length === 0) {
      throw new RegistroError(
        `No existe un visitante con ID ${visitor_id}`,
        'VISITOR_NOT_FOUND',
        404
      );
    }
    
    const { rows } = await pool.query(
      `INSERT INTO registro
         (preregistro_id, guard_user_id, visitor_id, reason)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [preregistro_id, guard_user_id, visitor_id, reason]
    );
    
    return rows[0];
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof RegistroError) {
      throw error;
    }
    
    // Manejar errores específicos de PostgreSQL
    if (error.code === '23503') { // Foreign key violation
      throw new RegistroError(
        'El preregistro, guardia o visitante especificado no existe.',
        'FOREIGN_KEY_VIOLATION',
        400
      );
    }
    
    console.error('Error en createRegistro:', error);
    throw new RegistroError(
      'Error al crear el registro.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Obtiene todos los registros con información detallada del visitante
 * @returns {Promise<Array>} Lista de registros
 * @throws {RegistroError} Si ocurre un error
 */
async function getAllRegistros() {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, v.visitor_name, v.phone, v.email, v.company, v.type, v.visitor_id_photo_path
      FROM registro r
      JOIN visitors v ON r.visitor_id = v.id
      ORDER BY r.entered_at DESC
    `);
    return rows;
  } catch (error) {
    console.error('Error en getAllRegistros:', error);
    throw new RegistroError(
      'Error al obtener la lista de registros.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Obtiene un registro por su ID con información detallada del visitante
 * @param {number} id - ID del registro
 * @returns {Promise<Object|null>} El registro encontrado o null
 * @throws {RegistroError} Si ocurre un error
 */
async function getRegistroById(id) {
  try {
    const validId = validateId(id);
    
    const { rows } = await pool.query(`
      SELECT r.*, v.visitor_name, v.phone, v.email, v.company, v.type, v.visitor_id_photo_path
      FROM registro r
      JOIN visitors v ON r.visitor_id = v.id
      WHERE r.id = $1
    `, [validId]);
    
    return rows[0] || null;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof RegistroError) {
      throw error;
    }
    
    console.error('Error en getRegistroById:', error);
    throw new RegistroError(
      'Error al obtener el registro.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Actualiza un registro existente
 * @param {number} id - ID del registro
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} El registro actualizado
 * @throws {RegistroError} Si ocurre un error
 */
async function updateRegistroById(id, data) {
  try {
    const validId = validateId(id);
    
    // Verificar si el registro existe
    const registro = await getRegistroById(validId);
    if (!registro) {
      throw new RegistroError(
        `No existe un registro con ID ${validId}`,
        'REGISTRO_NOT_FOUND',
        404
      );
    }
    
    // Verificar que hay datos para actualizar
    if (!data || Object.keys(data).length === 0) {
      throw new RegistroError(
        'No se proporcionaron datos para actualizar.',
        'NO_UPDATE_DATA',
        400
      );
    }
    
    const keys = Object.keys(data);
    const sets = keys.map((k, i) => `${k} = $${i+1}`).join(',');
    const values = keys.map(k => data[k]);

    const { rows } = await pool.query(
      `UPDATE registro
         SET ${sets}, updated_at = now()
       WHERE id = $${keys.length + 1}
       RETURNING *`,
      [...values, validId]
    );
    
    if (rows.length === 0) {
      throw new RegistroError(
        'No se pudo actualizar el registro.',
        'UPDATE_FAILED',
        500
      );
    }
    
    return rows[0];
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof RegistroError) {
      throw error;
    }
    
    console.error('Error en updateRegistroById:', error);
    throw new RegistroError(
      'Error al actualizar el registro.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Elimina un registro por su ID
 * @param {number} id - ID del registro
 * @returns {Promise<boolean>} true si se eliminó correctamente
 * @throws {RegistroError} Si ocurre un error
 */
async function deleteRegistroById(id) {
  try {
    const validId = validateId(id);
    
    // Verificar si el registro existe
    const registro = await getRegistroById(validId);
    if (!registro) {
      throw new RegistroError(
        `No existe un registro con ID ${validId}`,
        'REGISTRO_NOT_FOUND',
        404
      );
    }
    
    const result = await pool.query(
      `DELETE FROM registro WHERE id = $1`,
      [validId]
    );
    
    if (result.rowCount === 0) {
      throw new RegistroError(
        'No se pudo eliminar el registro.',
        'DELETE_FAILED',
        500
      );
    }
    
    return true;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof RegistroError) {
      throw error;
    }
    
    console.error('Error en deleteRegistroById:', error);
    throw new RegistroError(
      'Error al eliminar el registro.',
      'DATABASE_ERROR',
      500
    );
  }
}

module.exports = {
  createRegistro,
  getAllRegistros,
  getRegistroById,
  updateRegistroById,
  deleteRegistroById,
  RegistroError
};
