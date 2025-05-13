// src/index.js
require('dotenv').config();
const express = require('express');
const app     = express();
const authRouter = require('./routes/auth');
const passport = require('./config/passport');
const upload = require('./middlewares/upload');
const contactRouter = require('./routes/contacts');
const invitesRouter = require('./routes/invites');


app.use(passport.initialize());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'API corriendo correctamente' });
});

//rutas de autenticación
app.use('/auth', authRouter);
app.get('/login-failure', (req, res) => {
  res.status(401).json({ ok: false, error: 'Autenticación con Google fallida' });
});

//rutas protegidas
app.use('/contacts', contactRouter);
app.use('/invites', invitesRouter);  

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
