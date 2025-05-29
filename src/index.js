// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
// Eliminamos la importación de express-fileupload para usar solo multer
const app     = express();
const authRouter = require('./routes/auth');
const passport = require('./config/passport');
const invitesRouter = require('./routes/invites');
const invitePreregRouter = require('./routes/invitePreregistro');
const preregistrosRouter = require('./routes/preregistros');
const registrosRouter = require('./routes/registros');
const userManagementRouter = require('./routes/userManagementRoutes');

// Nuevas rutas para visitantes y conductores
const visitorRouter = require('./routes/visitors');
const driverRouter = require('./routes/drivers');
const visitorDriverRouter = require('./routes/visitorDrivers');
const errorHandler = require('./middlewares/errorHandler');

// Configuración CORS
app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://172.18.0.45',
      'http://localhost',
      'http://DAROKDEV.mondragonmexico.net'
    ];
    // Permitir solicitudes sin origen (como aplicaciones móviles o curl)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Origen bloqueado por CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));


app.use(passport.initialize());
app.use(express.json());

// NOTA: Eliminamos express-fileupload para evitar conflictos con multer
// que se usa en las rutas específicas para la carga de archivos

// Servir archivos estáticos desde la carpeta uploads
app.use('/uploads', express.static('uploads'));

// Ruta raíz
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'API corriendo correctamente cesar' });
});

// Rutas de autenticación (sin prefijo /api para mantener compatibilidad con Google OAuth)
app.use('/auth', authRouter);
app.get('/login-failure', (req, res) => {
  res.status(401).json({ ok: false, error: 'Autenticación con Google fallida' });
});

// Prefijo /api para todas las rutas de la API

// Rutas no protegidas
app.use('/preregistro', invitePreregRouter);

// Rutas protegidas
// Quitamos el prefijo /api para mantener compatibilidad con el frontend
app.use('/api/visitors', visitorRouter);
app.use('/api/drivers', driverRouter);
// Montar el enrutador de relaciones visitante-conductor directamente en la raíz
// porque sus rutas ya incluyen los prefijos completos
app.use(visitorDriverRouter); // Para rutas como /visitors/:visitorId/drivers
app.use('/api/invites', invitesRouter);  
app.use('/preregistros', preregistrosRouter);
app.use('/api/registros', registrosRouter);
app.use('/api/users', userManagementRouter);

// Para cualquier ruta no definida:
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});

// Manejar errores
app.use(errorHandler);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
