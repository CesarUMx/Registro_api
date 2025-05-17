// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
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
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));


app.use(passport.initialize());
app.use(express.json());

// Servir archivos estáticos desde la carpeta uploads
app.use('/uploads', express.static('uploads'));

// Ruta raíz
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'API corriendo correctamente' });
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
app.use('/visitors', visitorRouter);
app.use('/drivers', driverRouter);
// Montar el enrutador de relaciones visitante-conductor directamente en la raíz
// porque sus rutas ya incluyen los prefijos completos
app.use(visitorDriverRouter); // Para rutas como /visitors/:visitorId/drivers
app.use('/invites', invitesRouter);  
app.use('/preregistros', preregistrosRouter);
app.use('/registros', registrosRouter);
app.use('/users', userManagementRouter);

// Para cualquier ruta no definida:
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});

// Manejar errores
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
