// src/routes/auth.js
const router = require('express').Router();
const { login, logout } = require('../controllers/authController');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');
const { verifyJWT } = require('../middlewares/auth');
const pool = require('../config/db');

router.post('/login', login);
router.post('/logout', verifyJWT, logout);

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login-failure' }), 
async (req, res, next) => {
  try {
    // 1) Generar el JWT
    const token = jwt.sign(
      { userId: req.user.id, role: req.user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // 2) Guardarlo en la tabla tokens
    await pool.query(
      `INSERT INTO tokens (user_id, token)
       VALUES ($1, $2)`,
      [req.user.id, token]
    );

    // 3) Devolverlo al cliente
    res.json({ ok: true, token });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
