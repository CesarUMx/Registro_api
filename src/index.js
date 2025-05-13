// src/index.js
require('dotenv').config();
const express = require('express');
const app     = express();
const authRouter = require('./routes/auth');
const passport = require('./config/passport');
const { verifyJWT, requireRole } = require('./middlewares/auth');
const upload = require('./middlewares/upload');


app.use(passport.initialize());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'API corriendo correctamente' });
});

app.use('/auth', authRouter);
app.get('/login-failure', (req, res) => {
  res.status(401).json({ ok: false, error: 'Autenticación con Google fallida' });
});

//rutas protegidas

//rutas de test
app.get('/protected', verifyJWT, requireRole('admin','sysadmin'), (req, res) => {
  res.json({ ok: true, message: 'Ruta protegida', user: req.user });
});

app.post('/upload', verifyJWT, upload.fields([
  { name: 'idPhoto', maxCount: 1 },
  { name: 'platePhoto', maxCount: 1 }
]), (req, res) => {
  res.json({ ok: true, message: 'Archivos subidos correctamente', files: req.files });
});
  

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
