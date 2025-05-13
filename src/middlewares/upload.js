const multer  = require('multer');
const path    = require('path');
const crypto  = require('crypto');

// 1. Configuración del disco
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');                     // carpeta de destino
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, name);                           // nombre único
  }
});

// 2. Filtro MIME para sólo imágenes
function fileFilter(req, file, cb) {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes'), false);
  }
}

// 3. Límite máximo (p. ej. 15 MB)
const limits = { fileSize: 15 * 1024 * 1024 };

// 4. Exportar instancia
const upload = multer({ storage, fileFilter, limits });
module.exports = upload;
