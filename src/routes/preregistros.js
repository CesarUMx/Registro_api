// src/routes/preregistros.js
const router = require('express').Router();
const upload = require('../middlewares/upload');
const { verifyJWT, requireRole } = require('../middlewares/auth');
const {
  listPreregistros,
  showPreregistro,
  createPreregistroByAdmin,
  editPreregistro,
  removePreregistro
} = require('../controllers/preregistroController');

// Listar todos (admin/sysadmin)
router.get(
  '/',
  verifyJWT,
  requireRole('admin','sysadmin'),
  listPreregistros
);

// Ver uno (admin/sysadmin)
router.get(
  '/:id',
  verifyJWT,
  requireRole('admin','sysadmin'),
  showPreregistro
);

// Crear preregistro con visitante y conductor opcional
router.post(
  '/',
  verifyJWT,
  requireRole('admin','sysadmin'),
  upload.fields([
    // Para el visitante
    { name: 'idPhoto', maxCount: 1 },
    // Para el conductor (opcionales)
    { name: 'driverIdPhoto', maxCount: 1 },
    { name: 'platePhoto', maxCount: 1 }
  ]),
  createPreregistroByAdmin
);

// Editar fecha/motivo (solo admin)
router.put(
  '/:id',
  verifyJWT,
  requireRole('admin','sysadmin'),
  upload.none(), // Procesar form-data sin archivos
  editPreregistro
);

// Eliminar (solo admin)
router.delete(
  '/:id',
  verifyJWT,
  requireRole('sysadmin'),
  removePreregistro
);

module.exports = router;
