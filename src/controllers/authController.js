const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { findByUsername, saveToken, revokeToken } = require('../models/userModel');

// Función para generar un nuevo token JWT
async function generateToken(user, revokeOldToken = false) {
  // Crear el payload del token
  const tokenPayload = { userId: user.id, role: user.role };
  
  // Incluir el tipo de guardia en el token si existe
  if (user.guard_type) {
    tokenPayload.guard_type = user.guard_type;
  }
  
  // Si se solicita revocar el token anterior, hacerlo
  if (revokeOldToken) {
    try {
      // Buscar y revocar todos los tokens activos del usuario
      const { rows } = await pool.query(
        'SELECT token FROM tokens WHERE user_id = $1 AND revoked = false',
        [user.id]
      );
      
      // Revocar cada token encontrado
      for (const row of rows) {
        await revokeToken(row.token);
      }
    } catch (error) {
      console.error('Error al revocar tokens anteriores:', error);
      // Continuamos con la generación del nuevo token incluso si hay error
    }
  }
  
  const token = jwt.sign(
    tokenPayload,
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  
  // Almacenar en tabla tokens
  await saveToken(user.id, token);
  
  return token;
}

async function login(req, res, next) {
  try {
    const { username, password } = req.body;
    
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.name, u.password_hash, r.name AS role, u.guard_type
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.username = $1`, 
      [username]
    );
    const user = rows[0];
    
    if (!user) {
      console.error('Usuario no encontrado:', username);
      return res.status(401).json({ ok:false, err:'Usuario no encontrado' });
    }
    
    const match = await bcrypt.compare(password, user.password_hash);
    
    if (!match) {
      console.error('Contraseña incorrecta para el usuario:', username);
      return res.status(401).json({ ok:false, err:'Credenciales inválidas' });
    }
    
    // Generar token JWT
    const token = await generateToken(user);
    
    // Incluir información adicional del usuario en la respuesta
    res.json({ 
      ok: true, 
      token,
      user: {
        username: user.username,
        name: user.name || '',
        role: user.role
      }
    });
  } catch (err) {
    console.error('Error en el proceso de login:', err);
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
      console.error('Error: Header de autorización no encontrado');
      return res.status(400).json({ ok:false, err:'Header de autorización no encontrado' });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      console.error('Error: Token no proporcionado o mal formateado');
      return res.status(400).json({ ok:false, err:'Token no proporcionado o mal formateado' });
    }
    
    try {
      // Marcar como revocado usando la función del modelo
      const revoked = await revokeToken(token);
      
      if (revoked) {
        return res.json({ ok:true, message:'Desconectado correctamente' });
      } else {
        console.error('El token no pudo ser revocado o no existe en la base de datos');
        return res.json({ ok:true, message:'Sesión finalizada' });
      }
    } catch (revokeError) {
      console.error('Error al revocar el token:', revokeError);
      return res.json({ ok:true, message:'Sesión finalizada (con advertencias)' });
    }
  } catch (err) {
    console.error('Error general en el proceso de logout:', err);
    next(err);
  }
}

module.exports = { login, logout, generateToken };
