// src/index.js
require('dotenv').config();
const express = require('express');
const app     = express();
const authRouter = require('./routes/auth');
const passport = require('./config/passport');
const contactRouter = require('./routes/contacts');
const invitesRouter = require('./routes/invites');
const invitePreregRouter = require('./routes/invitePreregistro');
const preregistrosRouter = require('./routes/preregistros');
const registrosRouter = require('./routes/registros');
const errorHandler = require('./middlewares/errorHandler');


app.use(passport.initialize());
app.use(express.json());

// rutas no protegidas
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'API corriendo correctamente' });
});
app.use('/preregistro', invitePreregRouter);


//rutas de autenticación
app.use('/auth', authRouter);
app.get('/login-failure', (req, res) => {
  res.status(401).json({ ok: false, error: 'Autenticación con Google fallida' });
});

//rutas protegidas
app.use('/contacts', contactRouter);
app.use('/invites', invitesRouter);  
app.use('/preregistros', preregistrosRouter);
app.use('/registros', registrosRouter);

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
