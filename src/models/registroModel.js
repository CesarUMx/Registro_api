// src/models/registroModel.js
const pool = require('../config/db');
const { generateRegistrationCode, generateDriverTag, generateVisitorTag, normalizeText } = require('../utils/codeGenerator');
const registroVisitantesModel = require('./registroVisitantesModel');
const { getDriverById } = require('./driverModel');

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
 * Crea un nuevo registro en la caseta
 * @param {Object} data - Datos del registro
 * @param {number} data.driver_id - ID del conductor
 * @param {number} data.visitor_id - ID del visitante principal (opcional)
 * @param {Array} data.visitors - Lista de visitantes adicionales (opcional)
 * @param {string} data.vehicle_type - Tipo de vehículo
 * @param {string} data.tag_type - Tipo de etiqueta (tarjeta o etiqueta)
 * @param {string} data.card_number - Número de tarjeta (si tag_type es tarjeta)
 * @param {number} data.num_passengers - Número de pasajeros
 * @param {string} data.comments - Comentarios adicionales
 * @param {number} data.user_id - ID del usuario que crea el registro
 * @param {boolean} data.is_driver_visitor - Indica si el conductor también es visitante
 * @param {number} data.driver_visitor_id - ID del visitante que también es conductor (si is_driver_visitor es true)
 * @returns {Promise<Object>} Registro creado
 * @throws {RegistroError} Si ocurre un error
 */
async function createGateRegistro({ 
  preregistro_id, 
  admin_id, 
  gate_guard_id, 
  visitor_id, 
  reason, 
  driver_id, 
  num_passengers = 1, 
  tag_type = 'etiqueta', 
  card_number = null,
  visitors = [],
  is_driver_visitor = false,
  driver_visitor_id = null,
  person_visited_id = null
}) {
  const client = await pool.connect();
  try {
    // Validar datos obligatorios
    if (!gate_guard_id) {
      throw new RegistroError(
        'El ID del guardia de caseta es obligatorio.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    // Iniciar transacción
    await client.query('BEGIN');
    
    // Si se proporciona visitor_id, validar que exista
    if (visitor_id) {
      const visitorExists = await client.query(
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
    
    // Si se proporciona driver_id, validar que exista
    if (driver_id) {
      const driverExists = await client.query(
        'SELECT id FROM drivers WHERE id = $1',
        [driver_id]
      );
      
      if (driverExists.rows.length === 0) {
        throw new RegistroError(
          `No existe un conductor con ID ${driver_id}`,
          'DRIVER_NOT_FOUND',
          404
        );
      }
    }
    
    // Crear el registro principal
    const { rows } = await client.query(
      `INSERT INTO registro
         (preregistro_id, admin_id, gate_guard_id, visitor_id, reason, driver_id, 
          gate_entry_time, status, num_passengers, tag_type, person_visited_id)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'active', $7, $8, $9)
       RETURNING *`,
      [preregistro_id, admin_id, gate_guard_id, visitor_id, reason, driver_id, num_passengers, tag_type, person_visited_id]
    );
    
    const registro = rows[0];
    
    // Generar código de registro único
    const registrationCode = generateRegistrationCode(registro.id);
    
    // Actualizar el registro con el código generado
    await client.query(
      `UPDATE registro SET registration_code = $1 WHERE id = $2`,
      [registrationCode, registro.id]
    );
    
    registro.registration_code = registrationCode;
    
    // Si hay conductor, crear su registro en registro_visitantes
    if (driver_id) {
      // Obtener información del conductor
      const driverResult = await client.query(
        'SELECT * FROM drivers WHERE id = $1',
        [driver_id]
      );
      
      if (driverResult.rows.length > 0) {
        const driver = driverResult.rows[0];
        const driverTag = generateDriverTag(registrationCode);
        
        // Ya no actualizamos la tabla drivers con el código generado
        // El código se guarda solo en la tabla registro_visitantes
        
        // Verificar si la tarjeta ya está en uso
        if (tag_type === 'tarjeta' && card_number) {
          const existingCard = await registroVisitantesModel.checkCardInUse(card_number);
          if (existingCard) {
            throw new RegistroError(
              `La tarjeta ${card_number} ya está en uso en el registro ${existingCard.registration_code}.`,
              'CARD_ALREADY_IN_USE',
              400
            );
          }
        }
        
        // Crear registro de conductor en registro_visitantes con el código
        await client.query(
          `INSERT INTO registro_visitantes
             (registro_id, visitor_id, driver_id, visitor_number, is_driver, visitor_tag, driver_tag, tag_type, card_number, is_driver_visitor, driver_visitor_id)
           VALUES ($1, NULL, $2, 1, TRUE, NULL, $3, $4, $5, $6, $7)`,
          [registro.id, driver_id, driverTag, tag_type, card_number, is_driver_visitor, driver_visitor_id]
        );
        
        // Si el conductor también es visitante, registramos esta relación
        if (is_driver_visitor && driver_visitor_id) {
          // Verificar que el visitante exista
          const visitorExists = await client.query(
            'SELECT id FROM visitors WHERE id = $1',
            [driver_visitor_id]
          );
          
          if (visitorExists.rows.length === 0) {
            throw new RegistroError(
              `No existe un visitante con ID ${driver_visitor_id} para asociar con el conductor`,
              'VISITOR_NOT_FOUND',
              404
            );
          }
        }
      }
    }
    
    // Procesar visitantes adicionales si se proporcionan
    if (visitors && visitors.length > 0) {
      for (let i = 0; i < visitors.length; i++) {
        const visitorInfo = visitors[i];
        const visitorNumber = i + 2; // El conductor es 1, los visitantes empiezan en 2
        const visitorTag = generateVisitorTag(registrationCode, i + 1); // V01, V02, etc.
        
        // Ya no actualizamos la tabla visitors con el código generado
        // El código se guarda solo en la tabla registro_visitantes
        
        // Verificar si la tarjeta ya está en uso
        if (visitorInfo.tag_type === 'tarjeta' && visitorInfo.card_number) {
          const existingCard = await registroVisitantesModel.checkCardInUse(visitorInfo.card_number);
          if (existingCard) {
            throw new RegistroError(
              `La tarjeta ${visitorInfo.card_number} ya está en uso en el registro ${existingCard.registration_code}.`,
              'CARD_ALREADY_IN_USE',
              400
            );
          }
        }
        
        // Crear registro de visitante en registro_visitantes con el código
        await client.query(
          `INSERT INTO registro_visitantes
             (registro_id, visitor_id, visitor_number, is_driver, visitor_tag, tag_type, card_number)
           VALUES ($1, $2, $3, FALSE, $4, $5, $6)`,
          [registro.id, visitorInfo.visitor_id, visitorNumber, visitorTag, 
           visitorInfo.tag_type || 'etiqueta', visitorInfo.card_number]
        );
      }
    }
    
    // Si hay un visitante principal, crear su registro en registro_visitantes
    if (visitor_id) {
      const visitorTag = generateVisitorTag(registrationCode, 1); // V01
      const visitorNumber = visitors.length > 0 ? visitors.length + 2 : 2; // El conductor es 1, este visitante sería el siguiente
      
      // Ya no actualizamos la tabla visitors con el código generado
      // El código se guarda solo en la tabla registro_visitantes
      
      // Crear registro de visitante principal en registro_visitantes con el código
      await client.query(
        `INSERT INTO registro_visitantes
           (registro_id, visitor_id, visitor_number, is_driver, visitor_tag, tag_type, card_number)
         VALUES ($1, $2, $3, FALSE, $4, $5, NULL)`,
        [registro.id, visitor_id, visitorNumber, visitorTag, 'etiqueta']
      );
    }
    
    // Confirmar transacción
    await client.query('COMMIT');
    
    // Obtener el registro completo con todos los visitantes asociados
    const result = await getRegistroById(registro.id);
    
    return result;
  } catch (error) {
    // Revertir transacción en caso de error
    await client.query('ROLLBACK');
    
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
  } finally {
    client.release();
  }
}

/**
 * Actualiza un registro con la entrada al edificio
 * @param {number} id - ID del registro
 * @param {Object} data - Datos para actualizar
 * @param {number} data.entry_guard_id - ID del guardia de entrada
 * @param {number} data.visitor_id - ID del visitante principal
 * @param {Array<number>} data.additional_visitors - IDs de visitantes adicionales
 * @param {number} data.person_visited_id - ID de la persona a visitar
 * @param {string} data.reason - Motivo de la visita
 * @param {string} data.notes - Notas adicionales
 * @returns {Promise<Object>} Registro actualizado
 * @throws {RegistroError} Si ocurre un error
 */
async function updateWithBuildingEntry(id, { 
  entry_guard_id, 
  visitor_id, 
  additional_visitors = [],
  person_visited_id, 
  reason, 
  notes 
}) {
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
    
    // Iniciar transacción para manejar múltiples operaciones
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Actualizar el registro con los datos de entrada al edificio
      const { rows } = await client.query(
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
      
      const updatedRegistro = rows[0];
      
      // Procesar visitante principal si existe
      if (visitor_id) {
        // Verificar si ya existe un registro para este visitante
        const existingVisitor = await client.query(
          `SELECT id FROM registro_visitantes 
           WHERE registro_id = $1 AND visitor_id = $2`,
          [validId, visitor_id]
        );
        
        // Si no existe, crear un nuevo registro en registro_visitantes
        if (existingVisitor.rows.length === 0) {
          const registrationCode = updatedRegistro.registration_code;
          const visitorTag = generateVisitorTag(registrationCode, 1); // V01
          
          await client.query(
            `INSERT INTO registro_visitantes
             (registro_id, visitor_id, visitor_number, is_driver, visitor_tag, tag_type, card_number)
             VALUES ($1, $2, $3, FALSE, $4, 'etiqueta', NULL)`,
            [validId, visitor_id, 1, visitorTag]
          );
        }
      }
      
      // Procesar visitantes adicionales
      if (additional_visitors && additional_visitors.length > 0) {
        // Obtener el número de pasajeros del registro
        const numPassengers = updatedRegistro.num_passengers || 1;
        
        // Obtener visitantes ya registrados para este registro
        const existingVisitorsResult = await client.query(
          `SELECT visitor_id FROM registro_visitantes WHERE registro_id = $1`,
          [validId]
        );
        
        const existingVisitorIds = existingVisitorsResult.rows.map(row => row.visitor_id);
        
        // Filtrar solo los visitantes que no están ya registrados
        const newVisitorIds = additional_visitors.filter(id => !existingVisitorIds.includes(id));
        
        // Verificar que no se exceda el número de pasajeros
        const totalVisitors = existingVisitorIds.length + newVisitorIds.length;
        if (totalVisitors > numPassengers) {
          throw new RegistroError(
            `No se pueden registrar más de ${numPassengers} visitantes para este registro`,
            'EXCEEDED_PASSENGERS_COUNT',
            400
          );
        }
        
        // Registrar nuevos visitantes adicionales
        for (let i = 0; i < newVisitorIds.length; i++) {
          const visitorId = newVisitorIds[i];
          const visitorNumber = existingVisitorIds.length + i + 1;
          const registrationCode = updatedRegistro.registration_code;
          const visitorTag = generateVisitorTag(registrationCode, visitorNumber);
          
          await client.query(
            `INSERT INTO registro_visitantes
             (registro_id, visitor_id, visitor_number, is_driver, visitor_tag, tag_type, card_number)
             VALUES ($1, $2, $3, FALSE, $4, 'etiqueta', NULL)`,
            [validId, visitorId, visitorNumber, visitorTag]
          );
        }
      }
      
      // Confirmar transacción
      await client.query('COMMIT');
      
      // Obtener el registro completo con todos los visitantes asociados
      const result = await getRegistroById(validId);
      return result;
  } catch (error) {
    // Revertir transacción en caso de error
    await client.query('ROLLBACK');
    
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
  } finally {
    client.release();
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
             d.driver_name, d.driver_id_photo_path, d.plate_photo_path, 
             u.name as person_visited_name
      FROM registro r
      LEFT JOIN visitors v ON r.visitor_id = v.id
      LEFT JOIN drivers d ON r.driver_id = d.id
      LEFT JOIN users u ON r.person_visited_id = u.id
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
 * Obtiene un registro por su ID con información detallada del visitante y todos los visitantes asociados
 * @param {number} id - ID del registro
 * @returns {Promise<Object|null>} El registro encontrado o null
 * @throws {RegistroError} Si ocurre un error
 */
async function getRegistroById(id) {
  try {
    const validId = validateId(id);
    
    // Obtener el registro principal con sus relaciones
    const { rows } = await pool.query(
      `SELECT r.*,
              v.visitor_name, v.email, v.phone,
              d.driver_name, d.plate_photo_path,
              ag.username as admin_username,
              ag.email as admin_email,
              gg.username as gate_guard_username,
              eg.username as entry_guard_username,
              pv.username as person_visited_username,
              pv.email as person_visited_email,
              pr.code as preregistro_code
       FROM registro r
       LEFT JOIN visitors v ON r.visitor_id = v.id
       LEFT JOIN drivers d ON r.driver_id = d.id
       LEFT JOIN users ag ON r.admin_id = ag.id
       LEFT JOIN users gg ON r.gate_guard_id = gg.id
       LEFT JOIN users eg ON r.entry_guard_id = eg.id
       LEFT JOIN users pv ON r.person_visited_id = pv.id
       LEFT JOIN preregistro pr ON r.preregistro_id = pr.id
       WHERE r.id = $1`,
      [validId]
    );
    
    if (rows.length === 0) {
      return null;
    }
    
    const registro = rows[0];
    
    // Obtener todos los visitantes asociados al registro
    const visitantesResult = await pool.query(
      `SELECT rv.*, 
              v.visitor_name, v.email, v.phone
       FROM registro_visitantes rv
       LEFT JOIN visitors v ON rv.visitor_id = v.id
       WHERE rv.registro_id = $1
       ORDER BY rv.visitor_number`,
      [validId]
    );
    
    // Obtener conductor de registro_visitantes (is_driver = true)
    const conductorResult = await pool.query(
      `SELECT rv.* 
       FROM registro_visitantes rv
       WHERE rv.registro_id = $1 AND rv.is_driver = true
       LIMIT 1`,
      [validId]
    );
    
    // Agregar visitantes y conductor al resultado
    registro.visitantes = visitantesResult.rows;
    registro.conductor_tag = conductorResult.rows.length > 0 ? conductorResult.rows[0] : null;
    
    return registro;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof RegistroError) {
      throw error;
    }
    
    console.error('Error en getRegistroById:', error);
    throw new RegistroError(
      'Error al obtener el registro por ID.',
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

async function updateDriverVisitor(registroId, is_driver_visitor) {
  try {
    const validId = validateId(registroId);
    
    // Verificar que el registro existe
    const registro = await getRegistroById(validId);
    if (!registro) {
      throw new RegistroError(
        `No existe un registro con ID ${validId}`,
        'REGISTRO_NOT_FOUND',
        404
      );
    }
    
    if (!registro.driver_id) {
      throw new RegistroError(
        'Este registro no tiene conductor asociado',
        'NO_DRIVER_ASSOCIATED',
        400
      );
    }
    
    // Actualizar el campo is_driver_visitor
    const { rows } = await pool.query(
      `UPDATE registro_visitantes
       SET is_driver_visitor = $1, form_driver = true
       WHERE registro_id = $2 AND is_driver = true
       RETURNING *`,
      [is_driver_visitor, validId]
    );
    
    // PARA SACAR EL driver_name lo buscamos con el driver_id
    const driver = await getDriverById(registro.driver_id);
    if (!driver) {
      throw new RegistroError(
        'El conductor no existe',
        'DRIVER_NOT_FOUND',
        404
      );
    }

    // validamos que exista el visitante por  el visitor_name  sea el de driver_name, y el type sea conductor, no tenemos el visitor_id
    const { rows: visitorRows } = await pool.query(
      `SELECT * FROM visitors
       WHERE visitor_name = $1 AND type = 'conductor'
       LIMIT 1`,
      [driver.driver_name]
    );

    let visitor_id;

    // si no existe el visitante, lo creamos copiamos el driver_name = visitor_name, driver_id_photo_path = visitor_id_photo_path y type = 'conductor'
    //devolvemos el visitor_id
    if (visitorRows.length === 0) {
      const { rows: visitorRow } = await pool.query(
        `INSERT INTO visitors
         (visitor_name, visitor_id_photo_path, type)
         VALUES
         ($1, $2, 'conductor')`,
        [driver.driver_name, driver.driver_id_photo_path]
      );
      console.log(visitorRow);
      const { rows: actualizado } = await pool.query(
        `SELECT * FROM visitors
         WHERE visitor_name = $1 AND type = 'conductor'
         LIMIT 1`,
        [driver.driver_name]
      );

      visitor_id = actualizado[0].id;
    } else {
    // si existe el visitante, devolvemos el visitor_id
      visitor_id = visitorRows[0].id;
    }

    // actualizamos el registro_visitantes con el visitor_id
    const { rows: registroVisitantesRows } = await pool.query(
      `UPDATE registro_visitantes
       SET visitor_id = $1
       WHERE registro_id = $2 AND is_driver = true
       RETURNING *`,
      [visitor_id, validId]
    );
    
    return rows[0];
    
    
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof RegistroError) {
      throw error;
    }
    
    console.error('Error en updateDriverVisitorStatus:', error);
    throw new RegistroError(
      'Error al actualizar el estado del conductor.',
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

/**
 * Busca un registro por su código de registro
 * @param {string} code - Código de registro
 * @returns {Promise<Object|null>} El registro encontrado o null
 * @throws {RegistroError} Si ocurre un error
 */
async function getRegistroByCode(code) {
  try {
    if (!code || typeof code !== 'string') {
      throw new RegistroError(
        'El código de registro es requerido y debe ser una cadena de texto',
        'INVALID_REGISTRATION_CODE',
        400
      );
    }
    
    const { rows } = await pool.query(`
      SELECT r.*, 
             v.visitor_name, v.phone, v.email, v.company, v.type, v.visitor_id_photo_path,
             d.driver_name, d.driver_id_photo_path, d.plate_photo_path, 
             u.name as person_visited_name
      FROM registro r
      LEFT JOIN visitors v ON r.visitor_id = v.id
      LEFT JOIN drivers d ON r.driver_id = d.id
      LEFT JOIN users u ON r.person_visited_id = u.id
      WHERE r.registration_code = $1
      LIMIT 1
    `, [code]);
    
    if (rows.length === 0) {
      return null;
    }
    
    // Obtener todos los visitantes asociados a este registro
    const registro = rows[0];
    const visitantesResult = await pool.query(`
      SELECT rv.*, v.visitor_name, v.phone, v.email, v.company, v.type, v.visitor_id_photo_path
      FROM registro_visitantes rv
      LEFT JOIN visitors v ON rv.visitor_id = v.id
      WHERE rv.registro_id = $1
      ORDER BY rv.visitor_number ASC
    `, [registro.id]);
    
    registro.visitantes = visitantesResult.rows;
    
    return registro;
  } catch (error) {
    if (error instanceof RegistroError) {
      throw error;
    }
    console.error('Error en getRegistroByCode:', error);
    throw new RegistroError(
      `Error al buscar registro por código: ${error.message}`,
      'REGISTRO_SEARCH_ERROR',
      500
    );
  }
}

/**
 * Obtiene todos los visitantes asociados a un registro
 * @param {number} registroId - ID del registro
 * @returns {Promise<Array>} Lista de visitantes asociados al registro
 * @throws {RegistroError} Si ocurre un error
 */
async function getVisitantesByRegistroId(registroId) {
  try {
    const validId = validateId(registroId);
    
    // Obtener todos los visitantes asociados al registro
    const { rows } = await pool.query(
      `SELECT rv.id, rv.visitor_id, rv.visitor_number, rv.is_driver, rv.visitor_tag, rv.driver_tag, rv.tag_type, rv.card_number,
              v.visitor_name, v.visitor_id_photo_path, v.phone, v.email, v.company, v.type
       FROM registro_visitantes rv
       JOIN visitors v ON rv.visitor_id = v.id
       WHERE rv.registro_id = $1
       ORDER BY rv.visitor_number ASC`,
      [validId]
    );
    
    return rows;
  } catch (error) {
    // Si ya es un error personalizado, propagarlo
    if (error instanceof RegistroError) {
      throw error;
    }
    
    console.error('Error al obtener visitantes del registro:', error);
    throw new RegistroError(
      `Error al obtener visitantes del registro: ${error.message}`,
      'VISITANTES_SEARCH_ERROR',
      500
    );
  }
}

/**
 * Crea un nuevo registro directamente en la entrada al edificio (sin pasar por caseta)
 * @param {Object} data - Datos del registro
 * @param {number} data.preregistro_id - ID del preregistro (opcional)
 * @param {number} data.visitor_id - ID del visitante principal
 * @param {number} data.entry_guard_id - ID del guardia de entrada
 * @param {string} data.reason - Motivo de la visita
 * @param {number} data.num_passengers - Número de pasajeros
 * @param {string} data.tag_type - Tipo de etiqueta (tarjeta o etiqueta)
 * @param {string} data.card_number - Número de tarjeta (si tag_type es tarjeta)
 * @returns {Promise<Object>} Registro creado
 * @throws {RegistroError} Si ocurre un error
 */
async function createBuildingRegistro({ 
  preregistro_id, 
  visitor_id, 
  entry_guard_id, 
  reason, 
  num_passengers = 1, 
  tag_type = 'etiqueta', 
  card_number = null,
  person_visited_id = null,
  person_visited_name = null,
  person_visited_role = null
}) {
  try {
    // Validación mínima esencial
    if (!visitor_id || !entry_guard_id) {
      throw new RegistroError(
        'El ID del visitante y del guardia son obligatorios.',
        'MISSING_REQUIRED_FIELD',
        400
      );
    }
    
    // Consulta SQL para crear el registro con entrada directa al edificio
    const { rows } = await pool.query(
      `INSERT INTO registro (
        preregistro_id, 
        visitor_id, 
        entry_guard_id, 
        building_entry_time, 
        reason, 
        status,
        num_passengers,
        tag_type,
        person_visited_id
      ) VALUES ($1, $2, $3, NOW(), $4, 'active', $5, $6, $7)
      RETURNING *`,
      [
        preregistro_id, 
        visitor_id, 
        entry_guard_id, 
        reason || 'Visita',
        num_passengers,
        tag_type,
        person_visited_id
      ]
    );
    
    const registro = rows[0];
    
    // Generar código de registro único
    try {
      // Importar correctamente el módulo codeGenerator
      const codeGenerator = require('../utils/codeGenerator');
      const registrationCode = codeGenerator.generateRegistrationCode(registro.id);
      
      // Actualizar el registro con el código generado
      const updateResult = await pool.query(
        `UPDATE registro SET registration_code = $1 WHERE id = $2 RETURNING *`,
        [registrationCode, registro.id]
      );
      
      if (updateResult.rows.length > 0) {
        // Usar el registro actualizado que viene de la base de datos
        const updatedRegistro = updateResult.rows[0];
        console.log(`Código de registro generado y guardado: ${registrationCode}`);
        return updatedRegistro;
      } else {
        // Si no se pudo actualizar, al menos agregamos el código al objeto que tenemos
        registro.registration_code = registrationCode;
        console.warn(`No se pudo actualizar el registro en la BD, pero se generó el código: ${registrationCode}`);
      }
    } catch (codeError) {
      console.error('Error al generar/guardar el código de registro:', codeError);
      // Intentar generar un código alternativo si falla el generador principal
      const fallbackCode = `UMX${registro.id}XYZ`;
      try {
        await pool.query(
          `UPDATE registro SET registration_code = $1 WHERE id = $2`,
          [fallbackCode, registro.id]
        );
        registro.registration_code = fallbackCode;
        console.warn(`Se usó un código de respaldo: ${fallbackCode}`);
      } catch (fallbackError) {
        console.error('Error al guardar el código de respaldo:', fallbackError);
      }
    }
    
    // Devolver el registro (con o sin código, dependiendo de si se pudo generar)
    
    return registro;
  } catch (error) {
    // Manejo básico de errores
    if (error instanceof RegistroError) throw error;
    
    throw new RegistroError(
      `Error al crear registro en la entrada del edificio: ${error.message}`,
      'DATABASE_ERROR',
      500
    );
  }
}

module.exports = {
  createGateRegistro,
  createBuildingRegistro,
  updateWithBuildingEntry,
  registerBuildingExit,
  registerGateExit,
  findByPreregistroCode,
  getAllRegistros,
  getRegistroById,
  updateRegistroById,
  deleteRegistroById,
  getRegistroByCode,
  getVisitantesByRegistroId,
  updateDriverVisitor,
  RegistroError
};
