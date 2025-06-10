const pool = require('../config/db');

/**
 * Clase personalizada para errores del modelo Visitor
 */
class VisitorError extends Error {
  constructor(message, code = 'VISITOR_ERROR', status = 500) {
    super(message);
    this.name = 'VisitorError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Valida que el ID sea un número entero positivo
 * @param {any} id - El ID a validar
 * @throws {VisitorError} Si el ID no es válido
 */
function validateId(id) {
  const parsedId = parseInt(id, 10);
  if (isNaN(parsedId) || parsedId <= 0) {
    throw new VisitorError(
      'ID inválido. Debe ser un número entero positivo.',
      'INVALID_ID',
      400
    );
  }
  return parsedId;
}

/**
 * Obtiene todos los visitantes ordenados por fecha de creación
 * @returns {Promise<Array>} Lista de visitantes
 * @throws {VisitorError} Si ocurre un error
 */
async function getAllVisitors() {
  try {
    const { rows } = await pool.query(`
      SELECT id, visitor_name, visitor_id_photo_path,
             phone, email, company, type, created_at, updated_at
      FROM visitors
      ORDER BY created_at DESC
    `);
    return rows;
  } catch (error) {
    console.error('Error en getAllVisitors:', error);
    throw new VisitorError(
      'Error al obtener la lista de visitantes.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Obtiene un visitante por su ID
 * @param {number} id - ID del visitante
 * @returns {Promise<Object|null>} El visitante encontrado o null
 * @throws {VisitorError} Si ocurre un error
 */
async function getVisitorById(id) {
  try {
    const validId = validateId(id);
    
    const { rows } = await pool.query(`
      SELECT * FROM visitors WHERE id = $1
    `, [validId]);
    
    return rows[0] || null;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof VisitorError) {
      throw error;
    }
    
    console.error('Error en getVisitorById:', error);
    throw new VisitorError(
      'Error al obtener el visitante.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Crea un nuevo visitante
 * @param {Object} visitorData - Datos del visitante
 * @param {string} visitorData.visitor_name - Nombre del visitante
 * @param {string} visitorData.visitor_id_photo_path - Ruta de la foto de ID
 * @param {string} visitorData.phone - Teléfono
 * @param {string} visitorData.email - Email
 * @param {string} visitorData.company - Empresa
 * @param {string} visitorData.type - Tipo de visitante
 * @returns {Promise<number>} ID del visitante creado
 * @throws {VisitorError} Si ocurre un error
 */
async function createVisitor({ visitor_name, visitor_id_photo_path, phone, email, company, type }) {
  try {
    // Validar datos obligatorios
    if (!visitor_name) {
      throw new VisitorError(
        'El nombre del visitante es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    if (!type) {
      throw new VisitorError(
        'El tipo de visitante es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    // Construir la consulta SQL dinámicamente según los campos disponibles
    let query;
    let params;
    
    // Si no hay foto de identificación (caso de visitante sin vehículo)
    if (!visitor_id_photo_path && type === 'sin_vehiculo') {
      query = `
        INSERT INTO visitors
          (visitor_name, phone, email, company, type)
        VALUES
          ($1, $2, $3, $4, $5)
        RETURNING id
      `;
      params = [visitor_name, phone, email, company, type];
    } else {
      query = `
        INSERT INTO visitors
          (visitor_name, visitor_id_photo_path, phone, email, company, type)
        VALUES
          ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `;
      params = [visitor_name, visitor_id_photo_path, phone, email, company, type];
    }
    
    const { rows } = await pool.query(query, params);
    
    return rows[0].id;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof VisitorError) {
      throw error;
    }
    
    // Manejar errores específicos de PostgreSQL
    if (error.code === '23505') { // Unique violation
      throw new VisitorError(
        'Ya existe un visitante con esos datos.',
        'DUPLICATE_VISITOR',
        400
      );
    }
    
    console.error('Error en createVisitor:', error);
    throw new VisitorError(
      'Error al crear el visitante.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Actualiza un visitante existente
 * @param {number} id - ID del visitante
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} El visitante actualizado
 * @throws {VisitorError} Si ocurre un error
 */
async function updateVisitor(id, data) {
  try {
    const validId = validateId(id);
    
    // Verificar si el visitante existe
    const visitor = await getVisitorById(validId);
    if (!visitor) {
      throw new VisitorError(
        `No existe un visitante con ID ${validId}`,
        'VISITOR_NOT_FOUND',
        404
      );
    }
    
    // Verificar que hay datos para actualizar
    if (!data || Object.keys(data).length === 0) {
      throw new VisitorError(
        'No se proporcionaron datos para actualizar.',
        'NO_UPDATE_DATA',
        400
      );
    }
    
    const keys = Object.keys(data);
    const sets = keys.map((k, i) => `${k}=$${i+1}`).join(',');
    const values = keys.map(k => data[k]);

    const { rows } = await pool.query(
      `UPDATE visitors
         SET ${sets}, updated_at=now()
       WHERE id=$${keys.length+1}
       RETURNING *`,
      [...values, validId]
    );
    
    return rows[0];
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof VisitorError) {
      throw error;
    }
    
    console.error('Error en updateVisitor:', error);
    throw new VisitorError(
      'Error al actualizar el visitante.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Elimina un visitante por su ID
 * @param {number} id - ID del visitante
 * @returns {Promise<boolean>} true si se eliminó correctamente
 * @throws {VisitorError} Si ocurre un error
 */
async function deleteVisitor(id) {
  try {
    const validId = validateId(id);
    
    // Verificar si el visitante existe
    const visitor = await getVisitorById(validId);
    if (!visitor) {
      throw new VisitorError(
        `No existe un visitante con ID ${validId}`,
        'VISITOR_NOT_FOUND',
        404
      );
    }
    
    const result = await pool.query(`DELETE FROM visitors WHERE id = $1`, [validId]);
    
    if (result.rowCount === 0) {
      throw new VisitorError(
        'No se pudo eliminar el visitante.',
        'DELETE_FAILED',
        500
      );
    }
    
    return true;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof VisitorError) {
      throw error;
    }
    
    // Manejar errores de restricción de clave foránea
    if (error.code === '23503') { // Foreign key violation
      throw new VisitorError(
        'No se puede eliminar el visitante porque está siendo utilizado en otros registros.',
        'FOREIGN_KEY_VIOLATION',
        400
      );
    }
    
    console.error('Error en deleteVisitor:', error);
    throw new VisitorError(
      'Error al eliminar el visitante.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Busca visitantes por nombre, email o teléfono
 * @param {string} searchTerm - Término de búsqueda
 * @returns {Promise<Array>} Lista de visitantes que coinciden
 * @throws {VisitorError} Si ocurre un error
 */
async function searchVisitors(searchTerm) {
  try {
    if (!searchTerm || searchTerm.trim() === '') {
      throw new VisitorError(
        'El término de búsqueda no puede estar vacío.',
        'INVALID_SEARCH_TERM',
        400
      );
    }
    
    const { rows } = await pool.query(`
      SELECT * FROM visitors
      WHERE 
        visitor_name ILIKE $1 OR
        email ILIKE $1 OR
        phone ILIKE $1
      ORDER BY created_at DESC
    `, [`%${searchTerm}%`]);
    
    return rows;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof VisitorError) {
      throw error;
    }
    
    console.error('Error en searchVisitors:', error);
    throw new VisitorError(
      'Error al buscar visitantes.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Busca un visitante por su código de etiqueta
 * @param {string} visitorTag - Código de etiqueta del visitante
 * @returns {Promise<Object|null>} El visitante encontrado o null
 * @throws {VisitorError} Si ocurre un error
 */
async function getVisitorByTag(visitorTag) {
  try {
    if (!visitorTag || typeof visitorTag !== 'string') {
      throw new VisitorError(
        'El código de etiqueta del visitante es requerido y debe ser una cadena de texto',
        'INVALID_VISITOR_TAG',
        400
      );
    }
    
    // Buscar en la tabla de relación registro_visitantes para encontrar el visitor_id asociado al código
    const relationQuery = `
      SELECT rv.visitor_id 
      FROM registro_visitantes rv
      WHERE rv.visitor_tag = $1
      LIMIT 1
    `;
    
    const relationResult = await pool.query(relationQuery, [visitorTag]);
    
    if (relationResult.rows.length === 0) {
      return null;
    }
    
    const visitorId = relationResult.rows[0].visitor_id;
    
    // Obtener los datos completos del visitante
    const visitorQuery = `
      SELECT * FROM visitors
      WHERE id = $1
    `;
    
    const { rows } = await pool.query(visitorQuery, [visitorId]);
    return rows.length > 0 ? rows[0] : null;
  } catch (error) {
    if (error instanceof VisitorError) {
      throw error;
    }
    console.error('Error en getVisitorByTag:', error);
    throw new VisitorError(
      `Error al buscar visitante por código: ${error.message}`,
      'VISITOR_SEARCH_ERROR',
      500
    );
  }
}

module.exports = {
  getAllVisitors,
  getVisitorById,
  createVisitor,
  updateVisitor,
  deleteVisitor,
  searchVisitors,
  getVisitorByTag,
  VisitorError
};
