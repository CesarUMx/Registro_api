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
    console.log('Verificando token:', token.substring(0, 15) + '...');
    console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Definido' : 'No definido');
    
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
      console.log('Token verificado correctamente. Payload:', payload);
    } catch (jwtError) {
      console.error('Error al verificar JWT:', jwtError.message);
      return res.status(401).json({ ok: false, error: 'Token inválido o expirado', details: jwtError.message });
    }

    // Verificar en BD que no esté revocado
    console.log('Verificando si el token está revocado en la BD...');
    const { rows } = await pool.query(
      `SELECT revoked FROM tokens WHERE token = $1`,
      [token]
    );
    console.log('Resultado de la consulta de tokens:', { rowCount: rows.length, revoked: rows[0]?.revoked });

    if (rows.length === 0 || rows[0].revoked) {
      console.log('Token no encontrado en BD o revocado');
      return res.status(401).json({ ok: false, error: 'Token inválido o revocado' });
    }
    
    console.log('Token válido y no revocado');
    
    // Inicializar el objeto de usuario con los datos del payload
    req.user = { 
      userId: payload.userId, 
      role: payload.role 
    };
    
    // Si el tipo de guardia viene en el token, usarlo directamente
    if (payload.guard_type) {
      req.user.guard_type = payload.guard_type;
      console.log('Tipo de guardia obtenido del token:', payload.guard_type);
    }
    // Si no viene en el token pero es un guardia, intentar obtenerlo de la BD
    else if (payload.role === 'guardia') {
      console.log('Tipo de guardia no encontrado en el token, buscando en BD...');
      const { getGuardType } = require('../models/userModel');
      const guardType = await getGuardType(payload.userId);
      
      if (guardType) {
        req.user.guard_type = guardType;
        console.log('Tipo de guardia obtenido de la BD:', guardType);
      } else {
        console.log('No se encontró tipo de guardia en la BD');
      }
    }
    
    // Para depuración
    console.log('Usuario autenticado:', req.user);
    
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

/**
 * Genera un middleware que comprueba que `req.user.guard_type` esté en la lista de tipos de guardia permitidos.
 * Solo aplica si el rol es 'guardia', de lo contrario pasa al siguiente middleware.
 * Ejemplo: requireGuardType('entrada', 'supervisor')
 */
function requireGuardType(...allowedTypes) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(500).json({ ok: false, error: 'verifyJWT debe ir antes de requireGuardType' });
    }
    
    // Si no es guardia, no aplicamos esta restricción
    if (req.user.role !== 'guardia') {
      return next();
    }
    
    // Si es guardia pero no tiene tipo, error
    if (!req.user.guard_type) {
      return res.status(403).json({ ok: false, error: 'Tipo de guardia no definido' });
    }
    
    // Verificar si el tipo de guardia está permitido
    if (!allowedTypes.includes(req.user.guard_type)) {
      return res.status(403).json({ 
        ok: false, 
        error: `Acceso denegado. Solo guardias de tipo: ${allowedTypes.join(', ')} pueden realizar esta acción` 
      });
    }
    
    next();
  };
}

module.exports = { verifyJWT, requireRole, requireGuardType };
