const jwt = require('jsonwebtoken');
const pool = require('../config/db');

/**
 * Verifica que venga un JWT válido en Authorization header (Bearer) o en cookie.
 * Si es válido, anexa `req.user = { userId, role }`; si no, devuelve 401.
 */
async function verifyJWT(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token no proporcionado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

     // Verificar en BD que no esté revocado
     const { rows } = await pool.query(
      `SELECT revoked FROM tokens WHERE token = $1`,
      [token]
    );

    if (rows.length === 0 || rows[0].revoked) {
      return res.status(401).json({ ok: false, error: 'Token inválido o revocado' });
    }

    req.user = { userId: payload.userId, role: payload.role };
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
}

/**
 * Genera un middleware que comprueba que `req.user.role` esté en la lista de roles permitidos.
 * Ejemplo: requireRole('admin','sysadmin')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(500).json({ ok: false, error: 'verifyJWT debe ir antes de requireRole' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: 'Permiso denegado' });
    }
    next();
  };
}

module.exports = { verifyJWT, requireRole };
