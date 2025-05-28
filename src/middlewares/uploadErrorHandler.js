/**
 * Middleware para manejar errores de carga de archivos
 * Captura errores específicos de multer y los transforma en respuestas JSON amigables
 */
function uploadErrorHandler(err, req, res, next) {
  // Si no hay error, continuar
  if (!err) {
    return next();
  }

  console.error('Error en la carga de archivos:', err);

  // Errores específicos de multer
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      ok: false,
      error: 'El archivo es demasiado grande. Máximo 25MB.',
      code: 'FILE_TOO_LARGE'
    });
  }

  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(413).json({
      ok: false,
      error: 'Demasiados archivos. Máximo 5 archivos por solicitud.',
      code: 'TOO_MANY_FILES'
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      ok: false,
      error: 'Campo de archivo no esperado.',
      code: 'UNEXPECTED_FIELD'
    });
  }

  // Error de tipo de archivo
  if (err.message && err.message.includes('Solo se permiten imágenes')) {
    return res.status(415).json({
      ok: false,
      error: err.message,
      code: 'INVALID_FILE_TYPE'
    });
  }

  // Error de "Unexpected end of form"
  if (err.message && err.message.includes('Unexpected end of form')) {
    return res.status(400).json({
      ok: false,
      error: 'Error en el formulario. Verifica que todos los campos requeridos estén completos.',
      code: 'FORM_INCOMPLETE'
    });
  }

  // Otros errores de multer
  if (err.name === 'MulterError') {
    return res.status(400).json({
      ok: false,
      error: `Error en la carga de archivos: ${err.message}`,
      code: 'UPLOAD_ERROR'
    });
  }

  // Para cualquier otro error, pasar al siguiente middleware
  next(err);
}

module.exports = uploadErrorHandler;
