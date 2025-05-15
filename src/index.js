// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app     = express();
const authRouter = require('./routes/auth');
const passport = require('./config/passport');
const contactRouter = require('./routes/contacts');
const invitesRouter = require('./routes/invites');
const invitePreregRouter = require('./routes/invitePreregistro');
const preregistrosRouter = require('./routes/preregistros');
const registrosRouter = require('./routes/registros');
const errorHandler = require('./middlewares/errorHandler');

// Configuración CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));


app.use(passport.initialize());
app.use(express.json());

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
const apiRouter = express.Router();

// Rutas no protegidas
apiRouter.use('/preregistro', invitePreregRouter);

// Rutas protegidas
apiRouter.use('/contacts', contactRouter);
apiRouter.use('/invites', invitesRouter);  
apiRouter.use('/preregistros', preregistrosRouter);
apiRouter.use('/registros', registrosRouter);

// Aplicar el prefijo /api a todas las rutas de la API
app.use('/api', apiRouter);

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
