// src/utils/controllerHelpers.js
const pool = require('../config/db');
/**
 * Ejecuta una función dentro de una transacción de base de datos
 * @param {Function} callback - Función a ejecutar dentro de la transacción
 * @param {Object} [existingClient] - Cliente de conexión existente (opcional)
 * @returns {Promise<any>} - Resultado de la función callback
 */
async function withTransaction(callback, existingClient = null) {
  // Si se proporciona un cliente existente, lo usamos
  // De lo contrario, creamos uno nuevo
  const client = existingClient || await pool.connect();
  const shouldReleaseClient = !existingClient;
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Solo liberamos el cliente si lo creamos nosotros
    if (shouldReleaseClient) {
      client.release();
    }
  }
}

/**
 * Valida que el tipo de guardia sea uno de los permitidos
 * @param {Object} user - Usuario actual
 * @param {Array<string>} allowedTypes - Tipos de guardia permitidos
 * @param {number} statusCode - Código de estado HTTP en caso de error
 * @throws {Error} Si el tipo de guardia no está permitido
 */
function validateGuardType(user, allowedTypes, statusCode = 403) {
  if (!allowedTypes.includes(user.guard_type)) {
    const error = new Error(`Solo los guardias de tipo ${allowedTypes.join(', ')} pueden realizar esta acción`);
    error.status = statusCode;
    error.code = 'UNAUTHORIZED_GUARD_TYPE';
    throw error;
  }
}

/**
 * Maneja errores de manera estándar para respuestas HTTP
 * @param {Object} res - Objeto de respuesta Express
 * @param {Error} error - Error a manejar
 * @returns {Object} Respuesta HTTP con el error formateado
 */
function handleError(res, error) {
  console.error('Error:', error);
  return res.status(error.status || 500).json({
    ok: false,
    error: error.message || 'Error interno del servidor',
    code: error.code || 'SERVER_ERROR'
  });
}

/**
 * Valida campos requeridos en un objeto
 * @param {string[]} fields - Campos requeridos
 * @param {Object} body - Objeto a validar
 * @throws {Error} Si faltan campos requeridos
 */
function checkRequiredFields(fields, body) {
  const missing = fields.filter(field => !(field in body));
  if (missing.length > 0) {
    const error = new Error(`Faltan campos requeridos: ${missing.join(', ')}`);
    error.status = 400;
    error.code = 'MISSING_FIELDS';
    throw error;
  }
}

/**
 * Normaliza un nombre eliminando acentos y aplicando mayúscula inicial en cada palabra
 * @param {string} texto - Nombre a normalizar
 * @returns {string} - Nombre formateado
 */
function normalizeName(texto) {
  if (!texto) return '';

  return texto
    .normalize('NFD')                         // Eliminar acentos
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, '')                // Eliminar símbolos
    .toLowerCase()
    .replace(/\s+/g, ' ')                    // Espacios múltiples a uno solo
    .trim()
    .split(' ')
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/**
 * Verifica si un usuario existe y tiene un rol válido para ser visitado
 * @param {number} idUsuario
 * @returns {Promise<void>} lanza error si no es válido
 */
async function validatePersonaAVistar(idUsuario) {
  const { rows } = await pool.query(
    `SELECT id, role_id FROM users WHERE id = $1 AND activo = true`,
    [idUsuario]
  );

  if (rows.length === 0) {
    const error = new Error('La persona a visitar no existe o está inactiva');
    error.status = 404;
    error.code = 'PERSONA_NO_EXISTE';
    throw error;
  }

  const usuario = rows[0];
  if (![2, 3].includes(usuario.role_id)) {
    const error = new Error('La persona a visitar no tiene un rol válido para visitas');
    error.status = 400;
    error.code = 'ROL_INVALIDO_VISITA';
    throw error;
  }
}


async function validarCampos(edificio, idPersonaVisitar, motivo, visitantes) {

  if (!['prepa', 'universidad'].includes(edificio)) {
    const error = new Error('El campo "edificio" debe ser "prepa" o "universidad"');
    error.status = 400;
    error.code = 'INVALID_EDIFICIO';
    throw error;
  }

  if (idPersonaVisitar === undefined || idPersonaVisitar === null) {
    const error = new Error('El campo "id_persona_a_visitar" es obligatorio');
    error.status = 400;
    error.code = 'MISSING_ID_VISITADO';
    throw error;
  }

  await validatePersonaAVistar(idPersonaVisitar);

  if (!motivo || motivo.trim() === '') {
    const error = new Error('El campo "motivo" es obligatorio');
    error.status = 400;
    error.code = 'MISSING_MOTIVO';
    throw error;
  }

  if (!Array.isArray(visitantes) || visitantes.length === 0) {
    const error = new Error('Se requiere al menos un visitante para ingresar al edificio');
    error.status = 400;
    error.code = 'NO_VISITANTES';
    throw error;
  }

  // Validar campos por visitante
  for (const v of visitantes) {
    if (!v.id_visitante || !v.tag_type) {
      const error = new Error('Cada visitante debe incluir id_visitante y tag_type');
      error.status = 400;
      error.code = 'INVALID_VISITANTE_ENTRY';
      throw error;
    }

    if (v.tag_type === 'tarjeta' && !v.n_tarjeta) {
      const error = new Error('n_tarjeta es obligatorio si el tag_type es "tarjeta"');
      error.status = 400;
      error.code = 'MISSING_TARJETA';
      throw error;
    }
  }

}


module.exports = {
  withTransaction,
  validateGuardType,
  handleError,
  checkRequiredFields,
  normalizeName,
  validatePersonaAVistar,
  validarCampos
};
