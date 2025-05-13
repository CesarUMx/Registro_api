// src/config/db.js
require('dotenv').config();          // carga .env
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  max:      10,         // número máximo de conexiones en el pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

pool.on('connect', () => {
  console.log('🗄️  Conectado a PostgreSQL');
});

pool.on('error', (err) => {
  console.error('⛔ Error en el cliente de PostgreSQL', err);
  process.exit(-1);
});

module.exports = pool;
