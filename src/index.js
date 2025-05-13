// src/index.js
require('dotenv').config();
const express = require('express');
const pool    = require('./config/db');  // <— importa el pool
const app     = express();
const authRouter = require('./routes/auth');
const passport = require('./config/passport');

app.use(passport.initialize());

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'API corriendo correctamente' });
});

app.get('/db-health', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT NOW()');
    res.json({ ok: true, now: rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'DB connection error' });
  }
});

app.use('/auth', express.json(), authRouter);

app.get('/login-failure', (req, res) => {
  res.status(401).json({ ok: false, error: 'Autenticación con Google fallida' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
