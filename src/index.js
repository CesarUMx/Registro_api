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
const preregistroRouter = require('./routes/preregistroRoutes');
const preregistroPublicoRouter = require('./routes/preregistroPublicoRoutes');
const bitacoraRouter = require('./routes/bitacoraRoutes');
// Importar los programadores de tareas
const { iniciarProgramadorAlertasDemora } = require('./schedulers/alertasDemoraScheduler');
const { iniciarProgramadorFinalizarPreregistros } = require('./schedulers/finalizarPreregistrosScheduler');
const { iniciarProgramadorCerrarRegistrosAlumnos } = require('./schedulers/cerrarRegistrosAlumnosScheduler');

// Configuración CORS
app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      process.env.FRONTEND_URL
    ];
    // Permitir solicitudes sin origen (como aplicaciones móviles o curl)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Origen bloqueado por CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


app.use(passport.initialize());
app.use(express.json());

// NOTA: Eliminamos express-fileupload para evitar conflictos con multer
// que se usa en las rutas específicas para la carga de archivos

// Servir archivos estáticos desde la carpeta uploads
const path = require('path');
// Servir los archivos estáticos desde la ruta /uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
// También servir los archivos en la raíz para compatibilidad con Nginx
app.use('/api/uploads', express.static(path.join(__dirname, '../uploads')));

// Ruta raíz
app.get('/api', (req, res) => {
  res.json({ ok: true, message: 'API corriendo correctamente' });
});

// Rutas de autenticación (sin prefijo /api para mantener compatibilidad con Google OAuth)
app.use('/api/auth', authRouter);
app.get('/api/login-failure', (req, res) => {
  res.status(401).json({ ok: false, error: 'Autenticación con Google fallida' });
});

//camara RTSP
app.use('/api/captura', capturaRouter);

// Rutas públicas (sin autenticación)
app.use('/api/preregistro-publico', preregistroPublicoRouter);

// Rutas protegidas (con autenticación)
app.use('/api/users', userManagementRouter);
app.use('/api/vehiculos', vehiculoRouter);
app.use('/api/visitantes', visitanteRouter);
app.use('/api/registro', registroRouter);
app.use('/api/preregistros', preregistroRouter);
app.use('/api/eventos', require('./routes/eventoRoutes'));
app.use('/api/bitacora', bitacoraRouter);
// Para cualquier ruta no definida:
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});

// Manejar errores
app.use(errorHandler);

const PORT = process.env.PORT || 3002;
app.listen(PORT, async () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
  
  // Iniciar los programadores de tareas
  // Como son funciones asíncronas, usamos await para esperar a que terminen
  //console.log('Iniciando programadores de tareas...');
  try {
    //await iniciarProgramadorAlertasDemora();
    //console.log('Programador de alertas de demora iniciado correctamente');
    console.log('alertas demora desactivadas');

    
    await iniciarProgramadorFinalizarPreregistros();
    console.log('Programador para finalizar preregistros iniciado correctamente');
    
    // Iniciar programador para cerrar registros de alumnos a las 10 PM
    await iniciarProgramadorCerrarRegistrosAlumnos();
    console.log('Programador para cerrar registros de alumnos iniciado correctamente');

  } catch (error) {
    console.error('Error al iniciar los programadores de tareas:', error);
  }
});
