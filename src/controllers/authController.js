const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { findByUsername, saveToken } = require('../models/userModel');

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    const user = await findByUsername(username);
    if (!user) return res.status(401).json({ ok:false, error:'Usuario no encontrado' });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ ok:false, error:'Credenciales inválidas' });

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Almacenar en tabla tokens
    await saveToken(user.id, token);

    res.json({ ok:true, token });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    if (!token) {
      return res.status(400).json({ ok:false, error:'Token no proporcionado' });
    }

    // Marcar como revocado
    await pool.query(
      `UPDATE tokens SET revoked = true WHERE token = $1`,
      [token]
    );

    res.json({ ok:true, message:'Desconectado correctamente' });
  } catch (e) {
    next(err);
  }
}

module.exports = { login, logout };
