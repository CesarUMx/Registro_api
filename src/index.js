// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
// Eliminamos la importación de express-fileupload para usar solo multer
const app     = express();
const authRouter = require('./routes/auth');
const passport = require('./config/passport');
const userManagementRouter = require('./routes/userManagementRoutes');
const errorHandler = require('./middlewares/errorHandler');
const vehiculoRouter = require('./routes/vehiculoRoutes');
const visitanteRouter = require('./routes/visitanteRoutes');
const registroRouter = require('./routes/registroRoutes');
const capturaRouter = require('./routes/capturaRoutes');
// Importar el programador de alertas de demora
const { iniciarProgramadorAlertasDemora } = require('./schedulers/alertasDemoraScheduler');

// Configuración CORS
app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:5173',
      'http://localhost:3000',
      'http://172.18.0.92:3000',
      'http://localhost:5173',
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
  res.json({ ok: true, message: 'API corriendo correctamente pruebas' });
});

// Rutas de autenticación (sin prefijo /api para mantener compatibilidad con Google OAuth)
app.use('/auth', authRouter);
app.get('/login-failure', (req, res) => {
  res.status(401).json({ ok: false, error: 'Autenticación con Google fallida' });
});

//camara RTSP
app.use('/api/captura', capturaRouter);

app.use('/api/users', userManagementRouter);
app.use('/api/vehiculos', vehiculoRouter);
app.use('/api/visitantes', visitanteRouter);
app.use('/api/registro', registroRouter);
// Para cualquier ruta no definida:
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});

// Manejar errores
app.use(errorHandler);

const PORT = process.env.PORT || 3002;
app.listen(PORT, async () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
  
  // Iniciar el programador de alertas de demora
  // Como ahora es una función asíncrona, usamos await para esperar a que termine
  console.log('Iniciando programador de alertas de demora...');
  try {
    await iniciarProgramadorAlertasDemora();
    console.log('Programador de alertas de demora iniciado correctamente');
  } catch (error) {
    console.error('Error al iniciar el programador de alertas de demora:', error);
  }
});
