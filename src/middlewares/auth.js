const jwt = require('jsonwebtoken');

/**
 * Verifica que venga un JWT válido en Authorization header (Bearer) o en cookie.
 * Si es válido, anexa `req.user = { userId, role }`; si no, devuelve 401.
 */
function verifyJWT(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Token no proporcionado' });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
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
