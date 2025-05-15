const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { findByUsername, saveToken, revokeToken } = require('../models/userModel');

async function login(req, res, next) {
  try {
    console.log('Solicitud de login recibida:', req.body);
    const { username, password } = req.body;
    
    console.log('Buscando usuario en la base de datos...');
    const user = await findByUsername(username);
    
    if (!user) {
      console.log('Usuario no encontrado:', username);
      return res.status(401).json({ ok:false, err:'Usuario no encontrado' });
    }
    
    console.log('Usuario encontrado, verificando contraseña...');
    const match = await bcrypt.compare(password, user.password_hash);
    
    if (!match) {
      console.log('Contraseña incorrecta para el usuario:', username);
      return res.status(401).json({ ok:false, err:'Credenciales inválidas' });
    }
    
    console.log('Credenciales válidas, generando token JWT...');
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    
    console.log('Token generado, guardando en la base de datos...');
    // Almacenar en tabla tokens
    await saveToken(user.id, token);
    
    console.log('Enviando respuesta exitosa al cliente');
    res.json({ ok:true, token });
  } catch (err) {
    console.error('Error en el proceso de login:', err);
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    console.log('Solicitud de logout recibida');
    const authHeader = req.headers['authorization'];
    console.log('Authorization header:', authHeader);
    
    if (!authHeader) {
      console.log('Error: Header de autorización no encontrado');
      return res.status(400).json({ ok:false, err:'Header de autorización no encontrado' });
    }
    
    const token = authHeader.split(' ')[1];
    console.log('Token extraído:', token ? `${token.substring(0, 10)}...` : 'null');
    
    if (!token) {
      console.log('Error: Token no proporcionado o mal formateado');
      return res.status(400).json({ ok:false, err:'Token no proporcionado o mal formateado' });
    }
    
    console.log('Revocando token...');
    try {
      // Marcar como revocado usando la función del modelo
      const revoked = await revokeToken(token);
      
      if (revoked) {
        console.log('Token revocado correctamente');
        return res.json({ ok:true, message:'Desconectado correctamente' });
      } else {
        console.log('El token no pudo ser revocado o no existe en la base de datos');
        return res.json({ ok:true, message:'Sesión finalizada' });
      }
    } catch (revokeError) {
      console.error('Error al revocar el token:', revokeError);
      // Aún así, consideramos que el logout fue exitoso desde el punto de vista del cliente
      return res.json({ ok:true, message:'Sesión finalizada (con advertencias)' });
    }
  } catch (err) {
    console.error('Error general en el proceso de logout:', err);
    next(err);
  }
}

module.exports = { login, logout };
