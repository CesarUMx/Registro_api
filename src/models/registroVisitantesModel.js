// src/models/registroVisitantesModel.js
const pool = require('../config/db');
const { normalizeText } = require('../utils/codeGenerator');

/**
 * Clase personalizada para errores del modelo RegistroVisitantes
 */
class RegistroVisitantesError extends Error {
  constructor(message, code = 'REGISTRO_VISITANTES_ERROR', status = 500) {
    super(message);
    this.name = 'RegistroVisitantesError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Verifica si una tarjeta ya está en uso en un registro activo
 * @param {string} cardNumber - Número de tarjeta a verificar
 * @param {number} [excludeRegistroId] - ID de registro a excluir de la verificación
 * @returns {Promise<Object|null>} Información del registro que usa la tarjeta o null si no está en uso
 */
async function checkCardInUse(cardNumber, excludeRegistroId = null) {
  try {
    if (!cardNumber) return null;
    
    let query = `
      SELECT r.id, r.registration_code 
      FROM registro r
      JOIN registro_visitantes rv ON r.id = rv.registro_id
      WHERE rv.card_number = $1
        AND r.status = 'active'
    `;
    
    const params = [cardNumber];
    
    if (excludeRegistroId) {
      query += ' AND r.id != $2';
      params.push(excludeRegistroId);
    }
    
    query += ' LIMIT 1';
    
    const { rows } = await pool.query(query, params);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    console.error('Error en checkCardInUse:', error);
    throw new RegistroVisitantesError(
      'Error al verificar si la tarjeta está en uso.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Asocia un visitante a un registro
 * @param {Object} data - Datos del visitante y registro
 * @param {number} data.registro_id - ID del registro
 * @param {number} data.visitor_id - ID del visitante
 * @param {number} data.visitor_number - Número secuencial del visitante en el registro
 * @param {boolean} data.is_driver - Indica si el visitante es el conductor
 * @param {string} data.visitor_tag - Etiqueta generada para el visitante
 * @param {string} data.tag_type - Tipo de etiqueta ('etiqueta' o 'tarjeta')
 * @param {string} [data.card_number] - Número de tarjeta (solo si tag_type es 'tarjeta')
 * @returns {Promise<Object>} El registro de visitante creado
 * @throws {RegistroVisitantesError} Si ocurre un error
 */
async function addVisitorToRegistro({ 
  registro_id, 
  visitor_id, 
  visitor_number, 
  is_driver = false, 
  visitor_tag,
  tag_type = 'etiqueta',
  card_number = null 
}) {
  try {
    // Validar datos obligatorios
    if (!registro_id || !visitor_id || !visitor_number) {
      throw new RegistroVisitantesError(
        'Faltan campos obligatorios (registro_id, visitor_id, visitor_number).',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    // Validar que si el tipo es tarjeta, se proporcione un número de tarjeta
    if (tag_type === 'tarjeta' && !card_number) {
      throw new RegistroVisitantesError(
        'El número de tarjeta es obligatorio cuando el tipo es tarjeta.',
        'MISSING_CARD_NUMBER',
        400
      );
    }
    
    // Verificar si la tarjeta ya está en uso
    if (tag_type === 'tarjeta' && card_number) {
      const existingCard = await checkCardInUse(card_number, registro_id);
      if (existingCard) {
        throw new RegistroVisitantesError(
          `La tarjeta ${card_number} ya está en uso en el registro ${existingCard.registration_code}.`,
          'CARD_ALREADY_IN_USE',
          400
        );
      }
    }
    
    const { rows } = await pool.query(
      `INSERT INTO registro_visitantes
         (registro_id, visitor_id, visitor_number, is_driver, visitor_tag, tag_type, card_number)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [registro_id, visitor_id, visitor_number, is_driver, visitor_tag, tag_type, card_number]
    );
    
    return rows[0];
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof RegistroVisitantesError) {
      throw error;
    }
    
    // Manejar errores específicos de PostgreSQL
    if (error.code === '23503') { // Foreign key violation
      throw new RegistroVisitantesError(
        'El registro o visitante especificado no existe.',
        'FOREIGN_KEY_VIOLATION',
        400
      );
    }
    
    if (error.code === '23505') { // Unique violation
      throw new RegistroVisitantesError(
        'Ya existe una asociación para este visitante en este registro.',
        'DUPLICATE_RECORD',
        400
      );
    }
    
    console.error('Error en addVisitorToRegistro:', error);
    throw new RegistroVisitantesError(
      'Error al asociar el visitante al registro.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Obtiene todos los visitantes asociados a un registro
 * @param {number} registro_id - ID del registro
 * @returns {Promise<Array>} Lista de visitantes asociados
 * @throws {RegistroVisitantesError} Si ocurre un error
 */
async function getVisitorsByRegistroId(registro_id) {
  try {
    const { rows } = await pool.query(
      `SELECT rv.*, v.visitor_name, v.email, v.phone
       FROM registro_visitantes rv
       JOIN visitors v ON rv.visitor_id = v.id
       WHERE rv.registro_id = $1
       ORDER BY rv.visitor_number`,
      [registro_id]
    );
    
    return rows;
  } catch (error) {
    console.error('Error en getVisitorsByRegistroId:', error);
    throw new RegistroVisitantesError(
      'Error al obtener los visitantes del registro.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Actualiza la información de un visitante en un registro
 * @param {number} id - ID del registro_visitantes
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} El registro de visitante actualizado
 * @throws {RegistroVisitantesError} Si ocurre un error
 */
async function updateRegistroVisitante(id, { tag_type, card_number }) {
  try {
    // Obtener el registro actual para verificaciones
    const currentRecord = await pool.query(
      'SELECT * FROM registro_visitantes WHERE id = $1',
      [id]
    );
    
    if (currentRecord.rows.length === 0) {
      throw new RegistroVisitantesError(
        `No existe un registro de visitante con ID ${id}`,
        'RECORD_NOT_FOUND',
        404
      );
    }
    
    const registro_id = currentRecord.rows[0].registro_id;
    
    // Validar que si el tipo es tarjeta, se proporcione un número de tarjeta
    if (tag_type === 'tarjeta' && !card_number) {
      throw new RegistroVisitantesError(
        'El número de tarjeta es obligatorio cuando el tipo es tarjeta.',
        'MISSING_CARD_NUMBER',
        400
      );
    }
    
    // Verificar si la tarjeta ya está en uso
    if (tag_type === 'tarjeta' && card_number) {
      const existingCard = await checkCardInUse(card_number, registro_id);
      if (existingCard) {
        throw new RegistroVisitantesError(
          `La tarjeta ${card_number} ya está en uso en el registro ${existingCard.registration_code}.`,
          'CARD_ALREADY_IN_USE',
          400
        );
      }
    }
    
    const { rows } = await pool.query(
      `UPDATE registro_visitantes
       SET tag_type = $1,
           card_number = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [tag_type, card_number, id]
    );
    
    if (rows.length === 0) {
      throw new RegistroVisitantesError(
        'No se pudo actualizar el registro de visitante.',
        'UPDATE_FAILED',
        500
      );
    }
    
    return rows[0];
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof RegistroVisitantesError) {
      throw error;
    }
    
    console.error('Error en updateRegistroVisitante:', error);
    throw new RegistroVisitantesError(
      'Error al actualizar el registro de visitante.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Elimina un visitante de un registro
 * @param {number} id - ID del registro_visitantes
 * @returns {Promise<boolean>} true si se eliminó correctamente
 * @throws {RegistroVisitantesError} Si ocurre un error
 */
async function deleteRegistroVisitante(id) {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM registro_visitantes WHERE id = $1',
      [id]
    );
    
    if (rowCount === 0) {
      throw new RegistroVisitantesError(
        `No existe un registro de visitante con ID ${id}`,
        'RECORD_NOT_FOUND',
        404
      );
    }
    
    return true;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof RegistroVisitantesError) {
      throw error;
    }
    
    console.error('Error en deleteRegistroVisitante:', error);
    throw new RegistroVisitantesError(
      'Error al eliminar el registro de visitante.',
      'DATABASE_ERROR',
      500
    );
  }
}

module.exports = {
  addVisitorToRegistro,
  getVisitorsByRegistroId,
  updateRegistroVisitante,
  deleteRegistroVisitante,
  checkCardInUse
};
