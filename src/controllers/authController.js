// src/controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { findByUsername } = require('../models/userModel');

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

    res.json({ ok:true, token });
  } catch (err) {
    next(err);
  }
}

module.exports = { login };
