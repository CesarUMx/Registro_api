const multer  = require('multer');
const path    = require('path');
const crypto  = require('crypto');
const fs      = require('fs');

// Asegurarse de que la carpeta uploads exista
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads', { recursive: true });
}

// 1. Configuración del disco con mejor manejo de errores
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Verificar si la carpeta uploads existe y es accesible
    fs.access('uploads', fs.constants.W_OK, (err) => {
      if (err) {
        console.error('Error de acceso a la carpeta uploads:', err);
        return cb(new Error('No se puede acceder a la carpeta de destino'), false);
      }
      cb(null, 'uploads/');
    });
  },
  filename: (req, file, cb) => {
    try {
      // Generar un nombre de archivo único
      const ext = path.extname(file.originalname);
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    } catch (error) {
      console.error('Error al generar nombre de archivo:', error);
      cb(new Error('Error al procesar el archivo'), false);
    }
  }
});

// 2. Filtro MIME mejorado para sólo imágenes
function fileFilter(req, file, cb) {
  // Lista de tipos MIME permitidos
  const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Solo se permiten imágenes (${allowedMimes.join(', ')})`), false);
  }
}

// 3. Límite máximo aumentado a 25 MB
const limits = { 
  fileSize: 25 * 1024 * 1024,  // 25MB max file size
  files: 5                     // Máximo 5 archivos por solicitud
};

// 4. Exportar instancia con manejo de errores
const upload = multer({ 
  storage, 
  fileFilter, 
  limits,
  // Agregar manejo de errores de multer
  onError: function(err, next) {
    console.error('Error en multer:', err);
    next(err);
  }
});

module.exports = upload;
