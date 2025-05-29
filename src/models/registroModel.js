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
 * Crea un nuevo registro en la caseta (primer filtro)
 * @param {Object} data - Datos del registro
 * @param {number|null} data.preregistro_id - ID del preregistro (opcional)
 * @param {number|null} data.admin_id - ID del administrador que creó el preregistro (opcional)
 * @param {number} data.gate_guard_id - ID del guardia de caseta
 * @param {number} data.visitor_id - ID del visitante (puede ser null si solo se registra el vehículo)
 * @param {string} data.reason - Motivo de la visita (opcional en este punto)
 * @returns {Promise<Object>} El registro creado
 * @throws {RegistroError} Si ocurre un error
 */
async function createGateRegistro({ preregistro_id, admin_id, gate_guard_id, visitor_id, reason, driver_id }) {
  try {
    // Depuración: mostrar los parámetros recibidos
    console.log('Parámetros recibidos en createGateRegistro:');
    console.log('preregistro_id:', preregistro_id);
    console.log('admin_id:', admin_id);
    console.log('gate_guard_id:', gate_guard_id);
    console.log('visitor_id:', visitor_id);
    console.log('reason:', reason);
    // Validar datos obligatorios
    if (!gate_guard_id) {
      throw new RegistroError(
        'El ID del guardia de caseta es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    // Si se proporciona visitor_id, validar que exista
    if (visitor_id) {
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
    }
    
    const { rows } = await pool.query(
      `INSERT INTO registro
         (preregistro_id, admin_id, gate_guard_id, visitor_id, reason, driver_id, gate_entry_time, status)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'active')
       RETURNING *`,
      [preregistro_id, admin_id, gate_guard_id, visitor_id, reason, driver_id]
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
    
    console.error('Error en createGateRegistro:', error);
    throw new RegistroError(
      'Error al crear el registro en caseta.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Actualiza un registro con los datos de entrada al edificio (segundo filtro)
 * @param {number} id - ID del registro a actualizar
 * @param {Object} data - Datos para actualizar
 * @param {number} data.entry_guard_id - ID del guardia de entrada
 * @param {number} data.visitor_id - ID del visitante (requerido si no se proporcionó en la caseta)
 * @param {number} data.person_visited_id - ID de la persona a visitar (admin o sysadmin)
 * @param {string} data.reason - Motivo de la visita
 * @param {string} data.notes - Notas adicionales (opcional)
 * @returns {Promise<Object>} El registro actualizado
 * @throws {RegistroError} Si ocurre un error
 */
async function updateWithBuildingEntry(id, { entry_guard_id, visitor_id, person_visited_id, reason, notes }) {
  try {
    const validId = validateId(id);
    
    // Verificar que el registro existe
    const registro = await getRegistroById(validId);
    if (!registro) {
      throw new RegistroError(
        `No existe un registro con ID ${validId}`,
        'REGISTRO_NOT_FOUND',
        404
      );
    }
    
    // Validar datos obligatorios
    if (!entry_guard_id) {
      throw new RegistroError(
        'El ID del guardia de entrada es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    // Si no hay visitor_id en el registro original, debe proporcionarse ahora
    if (!registro.visitor_id && !visitor_id) {
      throw new RegistroError(
        'El ID del visitante es obligatorio para completar el registro.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    // Si se proporciona visitor_id, validar que exista
    if (visitor_id) {
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
    }
    
    // Actualizar el registro con los datos de entrada al edificio
    const { rows } = await pool.query(
      `UPDATE registro
       SET entry_guard_id = $1,
           visitor_id = COALESCE($2, visitor_id),
           person_visited_id = $3,
           reason = COALESCE($4, reason),
           notes = $5,
           building_entry_time = NOW(),
           updated_at = NOW()
       WHERE id = $6
       RETURNING *`,
      [entry_guard_id, visitor_id, person_visited_id, reason, notes, validId]
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
    
    // Manejar errores específicos de PostgreSQL
    if (error.code === '23503') { // Foreign key violation
      throw new RegistroError(
        'El preregistro, guardia o visitante especificado no existe.',
        'FOREIGN_KEY_VIOLATION',
        400
      );
    }
    
    console.error('Error en updateWithBuildingEntry:', error);
    throw new RegistroError(
      'Error al actualizar el registro con datos de entrada al edificio.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Registra la salida del edificio
 * @param {number} id - ID del registro
 * @param {Object} data - Datos adicionales
 * @param {number} data.guard_id - ID del guardia que registra la salida
 * @param {string} data.notes - Notas adicionales (opcional)
 * @returns {Promise<Object>} El registro actualizado
 * @throws {RegistroError} Si ocurre un error
 */
async function registerBuildingExit(id, { guard_id, notes }) {
  try {
    const validId = validateId(id);
    
    // Verificar que el registro existe y está activo
    const registro = await getRegistroById(validId);
    if (!registro) {
      throw new RegistroError(
        `No existe un registro con ID ${validId}`,
        'REGISTRO_NOT_FOUND',
        404
      );
    }
    if (registro.status !== 'active') {
      throw new RegistroError(
        'Este registro ya no está activo.',
        'INVALID_STATUS',
        400
      );
    }
    
    if (!registro.building_entry_time) {
      throw new RegistroError(
        'No se puede registrar la salida del edificio sin haber registrado la entrada.',
        'INVALID_OPERATION',
        400
      );
    }
    
    // Validar datos obligatorios
    if (!guard_id) {
      throw new RegistroError(
        'El ID del guardia es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    let completeRegistro = "active";
    if(registro.gate_entry_time === null){
      completeRegistro = "completed";
    }

    // Preparar las notas con prefijo si existen
    let notesWithPrefix = '';
    if (notes && notes.trim()) {
      notesWithPrefix = `Nota de edificio: ${notes.trim()}`;
    }
    
    // Obtener las notas actuales del registro
    const currentNotesResult = await pool.query(
      'SELECT notes FROM registro WHERE id = $1',
      [validId]
    );
    
    let updatedNotes = notesWithPrefix;
    
    // Si ya hay notas existentes, concatenarlas
    if (currentNotesResult.rows.length > 0 && currentNotesResult.rows[0].notes) {
      const currentNotes = currentNotesResult.rows[0].notes;
      updatedNotes = notesWithPrefix ? `${currentNotes}\n${notesWithPrefix}` : currentNotes;
    }
    
    // Actualizar el registro con la hora de salida del edificio y las notas
    const { rows } = await pool.query(
      `UPDATE registro
       SET building_exit_time = NOW(),
           updated_at = NOW(),
           status = $2,
           notes = $3
       WHERE id = $1
       RETURNING *`,
      [validId, completeRegistro, updatedNotes]
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
    
    console.error('Error en registerBuildingExit:', error);
    throw new RegistroError(
      'Error al registrar la salida del edificio.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Registra la salida por la caseta y completa el registro
 * @param {number} id - ID del registro
 * @param {Object} data - Datos adicionales
 * @param {number} data.guard_id - ID del guardia que registra la salida
 * @param {string} data.notes - Notas adicionales (opcional)
 * @returns {Promise<Object>} El registro actualizado
 * @throws {RegistroError} Si ocurre un error
 */
async function registerGateExit(id, { guard_id, notes }) {
  try {
    const validId = validateId(id);
    
    // Verificar que el registro existe y está activo
    const registro = await getRegistroById(validId);
    if (!registro) {
      throw new RegistroError(
        `No existe un registro con ID ${validId}`,
        'REGISTRO_NOT_FOUND',
        404
      );
    }
    
    if (registro.status !== 'active') {
      throw new RegistroError(
        'Este registro ya no está activo.',
        'INVALID_STATUS',
        400
      );
    }
    
    // Validar datos obligatorios
    if (!guard_id) {
      throw new RegistroError(
        'El ID del guardia es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    // Preparar las notas con prefijo si existen
    let notesWithPrefix = '';
    if (notes && notes.trim()) {
      notesWithPrefix = `Nota de caseta: ${notes.trim()}`;
    }
    
    // Obtener las notas actuales del registro
    const currentNotesResult = await pool.query(
      'SELECT notes FROM registro WHERE id = $1',
      [validId]
    );
    
    let updatedNotes = notesWithPrefix;
    
    // Si ya hay notas existentes, concatenarlas
    if (currentNotesResult.rows.length > 0 && currentNotesResult.rows[0].notes) {
      const currentNotes = currentNotesResult.rows[0].notes;
      updatedNotes = notesWithPrefix ? `${currentNotes}\n${notesWithPrefix}` : currentNotes;
    }
    
    // Actualizar el registro con la hora de salida por la caseta y completar
    const { rows } = await pool.query(
      `UPDATE registro
       SET gate_exit_time = NOW(),
           exited_at = NOW(),
           status = 'completed',
           notes = $2,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [validId, updatedNotes]
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
    
    console.error('Error en registerGateExit:', error);
    throw new RegistroError(
      'Error al registrar la salida por la caseta.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Busca un registro por código de preregistro
 * @param {string} code - Código del preregistro (formato PR-123)
 * @returns {Promise<Object|null>} El registro encontrado o null
 * @throws {RegistroError} Si ocurre un error
 */
async function findByPreregistroCode(code) {
  try {
    // Extraer el ID numérico del código (PR-123 -> 123)
    const matches = code.match(/PR-(\d+)/);
    if (!matches || !matches[1]) {
      throw new RegistroError(
        'Formato de código inválido. Debe ser PR-XXX donde XXX es el ID del preregistro.',
        'INVALID_CODE_FORMAT',
        400
      );
    }
    
    const preregistroId = parseInt(matches[1], 10);
    
    // Buscar registros activos con ese preregistro_id
    const { rows } = await pool.query(
      `SELECT r.*, v.visitor_name, v.phone, v.email, v.company, v.type
       FROM registro r
       LEFT JOIN visitors v ON r.visitor_id = v.id
       WHERE r.preregistro_id = $1 AND r.status = 'active'
       ORDER BY r.created_at DESC
       LIMIT 1`,
      [preregistroId]
    );
    
    return rows[0] || null;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof RegistroError) {
      throw error;
    }
    
    console.error('Error en findByPreregistroCode:', error);
    throw new RegistroError(
      'Error al buscar registro por código de preregistro.',
      'DATABASE_ERROR',
      500
    );
  }
}

/**
 * Obtiene todos los registros con información detallada del visitante y conductor
 * @returns {Promise<Array>} Lista de registros
 * @throws {RegistroError} Si ocurre un error
 */
async function getAllRegistros() {
  try {
    const { rows } = await pool.query(`
      SELECT r.*, 
             v.visitor_name, v.phone, v.email, v.company, v.type, v.visitor_id_photo_path,
             d.driver_name, d.driver_id_photo_path, d.plate_photo_path
      FROM registro r
      LEFT JOIN visitors v ON r.visitor_id = v.id
      LEFT JOIN drivers d ON r.driver_id = d.id
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
    console.log('Valid ID:', validId);
    
    // Obtener datos básicos del registro
    const { rows } = await pool.query(`
      SELECT r.*
      FROM registro r
      WHERE r.id = $1
    `, [validId]);

    if (rows.length === 0) {
      return null;
    }
    
    let registro = rows[0];
    
    // Si hay un visitante, obtener sus detalles
    if (registro.visitor_id !== null) {
      console.log('visitor_id found, fetching visitor details');
      const visitorResult = await pool.query(`
        SELECT v.visitor_name, v.phone, v.email, v.company, v.type, v.visitor_id_photo_path
        FROM visitors v
        WHERE v.id = $1
      `, [registro.visitor_id]);
      
      if (visitorResult.rows.length > 0) {
        registro = { ...registro, ...visitorResult.rows[0] };
      }
    }
    
    // Si hay una persona visitada, obtener sus detalles
    if (registro.person_visited_id !== null) {
      console.log('person_visited_id found, fetching user details');
      const userResult = await pool.query(`
        SELECT u.name as person_visited_name, r.name as person_visited_role
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE u.id = $1
      `, [registro.person_visited_id]);
      
      if (userResult.rows.length > 0) {
        registro = { ...registro, ...userResult.rows[0] };
      }
    }
    
    return registro;
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
};
