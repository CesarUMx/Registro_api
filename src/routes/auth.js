// src/routes/auth.js
const router = require('express').Router();
const { login, logout } = require('../controllers/authController');
const passport = require('../config/passport');
const jwt = require('jsonwebtoken');
const { verifyJWT } = require('../middlewares/auth');
const pool = require('../config/db');

router.post('/login', login);
router.post('/logout', verifyJWT, logout);

// Ruta para verificar si el token es válido
router.get('/verify', verifyJWT, async (req, res) => {
  try {
    // Si llegamos aquí, el token es válido (el middleware verifyJWT ya lo verificó)
    
    // Obtener información adicional del usuario desde la base de datos
    const { rows } = await pool.query(
      `SELECT u.guard_type
       FROM users u
       WHERE u.id = $1`, 
      [req.user.userId]
    );
    
    const userData = rows[0] || {};
    
    console.log('Verificación de token para usuario:', {
      userId: req.user.userId,
      role: req.user.role,
      guard_type: userData.guard_type || req.user.guard_type
    });
    
    res.status(200).json({ 
      ok: true, 
      user: { 
        id: req.user.userId, 
        role: req.user.role,
        guard_type: userData.guard_type || req.user.guard_type
      } 
    });
  } catch (error) {
    console.error('Error al verificar token:', error);
    res.status(500).json({ ok: false, error: 'Error al verificar token' });
  }
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: '/login-failure' }), 
async (req, res, next) => {
  try {
    // 1) Generar el JWT
    const tokenPayload = { userId: req.user.id, role: req.user.role };
    
    // Si el usuario tiene un tipo de guardia, incluirlo en el token
    if (req.user.guard_type) {
      tokenPayload.guard_type = req.user.guard_type;
      console.log('Incluyendo tipo de guardia en el token OAuth:', req.user.guard_type);
    }
    
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // 2) Guardarlo en la tabla tokens
    await pool.query(
      `INSERT INTO tokens (user_id, token)
       VALUES ($1, $2)`,
      [req.user.id, token]
    );

    // 3) Redirigir al frontend con el token
    // Obtenemos la URL del frontend desde las variables de entorno o usamos la URL de Vite por defecto
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    
    // Redirigimos al frontend con el token como parámetro de consulta
    res.redirect(`${frontendUrl}?token=${token}&role=${req.user.role}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
