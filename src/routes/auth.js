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
    
    // Validar que el ID de usuario existe
    if (!req.user || !req.user.userId) {
      console.error('Token válido pero sin ID de usuario');
      return res.status(401).json({ ok: false, error: 'Token inválido o usuario no encontrado' });
    }
    
    try {
      // Obtener información adicional del usuario desde la base de datos con tiempo límite
      const queryPromise = pool.query(
        `SELECT u.guard_type
         FROM users u
         WHERE u.id = $1`, 
        [req.user.userId]
      );
      
      // Establecer un tiempo límite para la consulta a la base de datos
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Tiempo de espera de la consulta excedido')), 3000);
      });
      
      // Usar Promise.race para establecer un tiempo límite
      const { rows } = await Promise.race([queryPromise, timeoutPromise]);
      
      const userData = rows[0] || {};
      
      return res.status(200).json({ 
        ok: true, 
        user: { 
          id: req.user.userId, 
          role: req.user.role,
          guard_type: userData.guard_type || req.user.guard_type
        } 
      });
    } catch (dbError) {
      console.error('Error en la consulta a la base de datos:', dbError);
      // Si hay un error en la consulta a la base de datos, devolver los datos básicos del usuario
      return res.status(200).json({ 
        ok: true, 
        user: { 
          id: req.user.userId, 
          role: req.user.role,
          guard_type: req.user.guard_type || null
        },
        warning: 'Datos parciales debido a un error en la base de datos'
      });
    }
  } catch (error) {
    console.error('Error general al verificar token:', error);
    return res.status(500).json({ ok: false, error: 'Error al verificar token' });
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
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    // Obtenemos el nombre del usuario si existe
    let userName = '';
    if (req.user.name) {
      userName = req.user.name;
    } else {
      // Si no hay nombre en req.user, intentar obtenerlo de la base de datos
      try {
        const userResult = await pool.query(
          `SELECT name FROM users WHERE id = $1`,
          [req.user.id]
        );
        if (userResult.rows.length > 0 && userResult.rows[0].name) {
          userName = userResult.rows[0].name;
        }
      } catch (error) {
        console.error('Error al obtener el nombre del usuario:', error);
      }
    }
    
    // Redirigimos al frontend con el token, rol y nombre como parámetros de consulta
    res.redirect(`${frontendUrl}?token=${token}&role=${req.user.role}&name=${encodeURIComponent(userName)}`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
