/**
 * Genera un código de registro único
 * @param {number} registroId - ID del registro
 * @returns {string} Código en formato UMX+ID+3letras
 */
function generateRegistrationCode(registroId) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let randomLetters = '';
  
  for (let i = 0; i < 3; i++) {
    randomLetters += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  
  return `UMX${registroId}${randomLetters}`;
}

/**
 * Genera un código de etiqueta para conductor
 * @param {string} registrationCode - Código de registro base
 * @returns {string} Código en formato UMX+ID+3letras-CND
 */
function generateDriverTag(registrationCode) {
  return `${registrationCode}-CND`;
}

/**
 * Genera un código de etiqueta especial
 * @param {string} registrationCode - Código base del registro (ej. UMX123ABC)
 * @param {string} suffix - Sufijo especial (ej. PROV, CND)
 * @returns {string}
 */
function generateSpecialTag(registrationCode, suffix) {
  return `${registrationCode}-${suffix}`;
}

/**
 * Genera un código de etiqueta para visitante
 * @param {string} registrationCode - Código de registro base
 * @param {number} visitorNumber - Número secuencial del visitante
 * @returns {string} Código en formato UMX+ID+3letras-V01
 */
function generateVisitorTag(registrationCode, visitorNumber) {
  const paddedNumber = String(visitorNumber).padStart(2, '0');
  return `${registrationCode}-V${paddedNumber}`;
}

/**
 * Genera un código único para preregistro
 * @param {number} preregistroId - ID del preregistro
 * @returns {string} Código en formato PRE+ID+3letras (similar al de registro)
 */
function generatePreregistroCode(preregistroId) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let randomLetters = '';
  
  for (let i = 0; i < 3; i++) {
    randomLetters += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  
  return `PRE${preregistroId}${randomLetters}`;
}



/**
 * Normaliza un texto eliminando acentos y convirtiéndolo a mayúsculas
 * @param {string} text - Texto a normalizar
 * @returns {string} Texto normalizado
 */
function normalizeText(text) {
  if (!text) return '';
  
  return text.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/[^\w\s]/gi, '') // Eliminar caracteres especiales
    .toUpperCase(); // Convertir a mayúsculas
}

module.exports = {
  generateRegistrationCode,
  generateDriverTag,
  generateVisitorTag,
  generatePreregistroCode,
  normalizeText,
  generateSpecialTag
};
