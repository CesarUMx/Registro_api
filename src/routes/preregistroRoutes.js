const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { verifyJWT, requireRole } = require('../middlewares/auth');
const {
  postCrearPreregistro,
  getPreregistros,
  getPreregistroPorId,
  getPreregistroPorCodigo,
  getVisitantePreregistro,
  getVehiculoPreregistro,
  postGenerarLinkUnico,
  postEnviarPorCorreo,
  getPreregistroPorToken,
  postCompletarPreregistro,
  patchEstadoPreregistro,
  patchIniciarPreregistro,
  getVerificarFotosFaltantes,
  postCargarFotoVisitante,
  postCargarFotoVehiculo
} = require('../controllers/preregistroController');
const { getBitacoraPreregistro } = require('../controllers/bitacoraController');

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

// Middleware de autenticación para todas las rutas
router.use(verifyJWT);

// POST /api/preregistros - Crear nuevo preregistro (solo admin y sysadmin)
router.post('/', requireRole('admin', 'sysadmin'), postCrearPreregistro);

// POST /api/preregistros/list - Obtener lista de preregistros con paginación
router.post('/list', requireRole('admin', 'sysadmin', 'guardia'), getPreregistros);

// GET /api/preregistros/codigo/:codigo - Obtener preregistro por código
router.get('/codigo/:codigo', requireRole('admin', 'sysadmin', 'guardia'), getPreregistroPorCodigo);

// GET /api/preregistros/:id - Obtener preregistro por ID
router.get('/:id', requireRole('admin', 'sysadmin', 'guardia'), getPreregistroPorId);

// POST /api/preregistros/generar-link - Generar link único para preregistro (solo admin y sysadmin)
router.post('/generar-link', requireRole('admin', 'sysadmin'), postGenerarLinkUnico);

// POST /api/preregistros/enviar-correo - Enviar preregistro completo por correo (solo admin y sysadmin)
router.post('/enviar-correo', requireRole('admin', 'sysadmin'), postEnviarPorCorreo);

// PATCH /api/preregistros/:id/status - Actualizar estado de preregistro
router.patch('/:id/status', requireRole('admin', 'sysadmin', 'guardia'), patchEstadoPreregistro);

// GET /api/preregistros/:id/verificar-fotos - Verificar qué fotos faltan para iniciar preregistro
router.get('/:id/verificar-fotos', requireRole('admin', 'sysadmin', 'guardia'), getVerificarFotosFaltantes);

// PATCH /api/preregistros/:id/iniciar - Iniciar preregistro con fotos del conductor y placa
router.patch('/:id/iniciar', 
  requireRole('admin', 'sysadmin', 'guardia'),
  patchIniciarPreregistro
);

// POST /api/preregistros/cargar-foto-visitante - Cargar fotos de visitante (foto_persona y/o foto_ine)
router.post('/cargar-foto-visitante',
  requireRole('admin', 'sysadmin', 'guardia'),
  upload.fields([
    { name: 'foto_persona', maxCount: 1 },
    { name: 'foto_ine', maxCount: 1 }
  ]),
  postCargarFotoVisitante
);

// POST /api/preregistros/cargar-foto-vehiculo - Cargar foto de placa de vehículo
router.post('/cargar-foto-vehiculo',
  requireRole('admin', 'sysadmin', 'guardia'),
  upload.single('foto_placa'),
  postCargarFotoVehiculo
);

// GET /api/preregistros/:id/visitantes/:numero - Obtener visitante específico de un preregistro
router.get('/:id/visitantes/:numero',
  requireRole('admin', 'sysadmin', 'guardia'),
  getVisitantePreregistro
);

// GET /api/preregistros/:id/vehiculos/:numero - Obtener vehículo específico de un preregistro
router.get('/:id/vehiculos/:numero',
  requireRole('admin', 'sysadmin', 'guardia'),
  getVehiculoPreregistro
);

// GET /api/preregistros/:id/bitacora - Obtener bitácora completa de un preregistro
router.get('/:id/bitacora',
  requireRole('admin', 'sysadmin', 'guardia'),
  getBitacoraPreregistro
);

module.exports = router;
