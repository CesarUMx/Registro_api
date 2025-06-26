// src/controllers/userManagementController.js
const bcrypt = require('bcrypt');
const userModel = require('../models/userManagementModel');
const { generateToken } = require('./authController');
const pool = require('../config/db');

// Obtener todos los usuarios
async function getAllUsers(req, res, next) {
  try {
    let users;
    
    // Si es supervisor, solo mostrar usuarios con rol guardia
    if (req.user.role === 'guardia' && req.user.guard_type === 'supervisor') {
      users = await userModel.getGuardUsers();
    } else {
      users = await userModel.getAllUsers();
    }
    
    res.json({ ok: true, users });
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    next(err);
  }
}

// Obtener un usuario por ID
async function getUserById(req, res, next) {
  try {
    const { id } = req.params;
    const user = await userModel.getUserById(id);
    
    if (!user) {
      console.error(`Usuario con ID ${id} no encontrado`);
      return res.status(404).json({ ok: false, err: 'Usuario no encontrado' });
    }
    
    res.json({ ok: true, user });
  } catch (err) {
    console.error(`Error al obtener usuario con ID ${req.params.id}:`, err);
    next(err);
  }
}

// Crear un nuevo usuario
async function createUser(req, res, next) {
  try {
    const { username, name, email, password, role, guardType } = req.body;
    
    // Si es supervisor, solo permitir crear usuarios con rol guardia
    if (req.user.role === 'guardia' && req.user.guard_type === 'supervisor' && role !== 'guardia') {
      return res.status(403).json({ 
        ok: false, 
        err: 'Como supervisor, solo puedes crear usuarios con rol de guardia' 
      });
    }
    
    // Verificar si el usuario ya existe
    const userExists = await userModel.checkUserExists(username, email);
    
    if (userExists) {
      console.error('El usuario o email ya existe');
      return res.status(400).json({ ok: false, err: 'El nombre de usuario o email ya está en uso' });
    }
    
    // Obtener el ID del rol
    const roleId = await userModel.getRoleIdByName(role);
    
    if (!roleId) {
      console.error(`Rol '${role}' no encontrado`);
      return res.status(400).json({ ok: false, err: 'Rol no válido' });
    }
    
    // Hashear la contraseña
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Crear el usuario
    const userData = {
      username,
      name,
      email,
      passwordHash,
      roleId
    };
    
    // Si es un guardia, incluir el tipo de guardia
    if (role === 'guardia' && guardType) {
      userData.guardType = guardType;
    }
    
    const newUser = await userModel.createUser(userData);
    res.status(201).json({ ok: true, user: newUser });
  } catch (err) {
    console.error('Error al crear usuario:', err);
    next(err);
  }
}

// Actualizar un usuario existente
async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { username, name, email, role, password } = req.body;
    
    // Verificar si el usuario existe
    const user = await userModel.getUserById(id);
    
    if (!user) {
      console.error(`Usuario con ID ${id} no encontrado`);
      return res.status(404).json({ ok: false, err: 'Usuario no encontrado' });
    }
    
    // Verificar si el nuevo username o email ya está en uso por otro usuario
    if (username || email) {
      const userExists = await userModel.checkUserExists(
        username || '', 
        email || '', 
        id
      );
      
      if (userExists) {
        console.error('El nombre de usuario o email ya está en uso por otro usuario');
        return res.status(400).json({ ok: false, err: 'El nombre de usuario o email ya está en uso por otro usuario' });
      }
    }
    
    // Preparar los datos para actualizar
    const fields = [];
    const values = [];
    
    if (username) {
      fields.push('username');
      values.push(username);
    }
    
    if (name) {
      fields.push('name');
      values.push(name);
    }
            
    if (email) {
      fields.push('email');
      values.push(email);
    }
    
    if (role) {
      const roleId = await userModel.getRoleIdByName(role);
      
      if (!roleId) {
        console.error(`Rol '${role}' no encontrado`);
        return res.status(400).json({ ok: false, err: 'Rol no válido' });
      }
      
      fields.push('role_id');
      values.push(roleId);
    }
    
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      fields.push('password_hash');
      values.push(passwordHash);
    }
    
    // Si no hay campos para actualizar
    if (fields.length === 0) {
      return res.status(400).json({ ok: false, err: 'No se proporcionaron datos para actualizar' });
    }
    
    // Actualizar el usuario
    const updateData = { fields, values };
    const updatedUser = await userModel.updateUser(id, updateData);
    
    res.json({ ok: true, user: updatedUser });
  } catch (err) {
    console.error(`Error al actualizar usuario con ID ${req.params.id}:`, err);
    next(err);
  }
}

// Eliminar un usuario
async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    
    // Verificar si el usuario existe
    const user = await userModel.getUserById(id);
    
    if (!user) {
      console.error(`Usuario con ID ${id} no encontrado`);
      return res.status(404).json({ ok: false, err: 'Usuario no encontrado' });
    }
    
    // Eliminar el usuario
    await userModel.deleteUser(id);
    res.json({ ok: true, message: 'Usuario eliminado correctamente' });
  } catch (err) {
    console.error(`Error al eliminar usuario con ID ${req.params.id}:`, err);
    next(err);
  }
}

// Obtener usuarios con rol admin y sysadmin
async function getAdminUsers(req, res, next) {
  try {
    const users = await userModel.getAdminUsers();
    res.json({ ok: true, data: users });
  } catch (err) {
    console.error('Error al obtener usuarios admin/sysadmin:', err);
    next(err);
  }
}

// Actualizar solo el tipo de guardia (para supervisores o para guardias actualizando su propio tipo)
async function updateGuardType(req, res, next) {
  try {
    // Obtener el ID del usuario a actualizar
    // Si hay un ID en los parámetros (ruta de supervisor), usar ese
    // Si no, usar el ID del usuario autenticado (guardia actualizando su propio tipo)
    const userId = req.params.id || req.user.userId;
    
    // Aceptar tanto guardType como guard_type para mayor compatibilidad
    const guardType = req.body.guardType || req.body.guard_type;
    
    if (!guardType) {
      return res.status(400).json({ ok: false, error: 'Tipo de guardia no proporcionado' });
    }
    
    // Verificar que el usuario a actualizar exista y sea guardia
    const user = await userModel.getUserById(userId);
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    }
    
    if (user.role !== 'guardia') {
      return res.status(403).json({ 
        ok: false, 
        error: 'Solo puedes modificar el tipo de guardia para usuarios con rol de guardia' 
      });
    }
    
    // Verificar que el tipo de guardia sea válido
    const validTypes = ['caseta', 'entrada', 'supervisor'];
    if (!validTypes.includes(guardType)) {
      return res.status(400).json({
        ok: false,
        error: `Tipo de guardia inválido. Debe ser uno de: ${validTypes.join(', ')}`
      });
    }
    
    // Actualizar el tipo de guardia
    const updatedUser = await userModel.updateGuardType(userId, guardType);
    
    // Obtener el usuario completo para generar un nuevo token
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.name, r.name AS role, u.guard_type
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`, 
      [userId]
    );
    
    const userFull = rows[0];
    
    if (!userFull) {
      return res.status(404).json({ ok: false, error: 'No se pudo obtener la información completa del usuario' });
    }
    
    // Generar un nuevo token con el tipo de guardia actualizado y revocar el anterior
    const newToken = await generateToken(userFull, true); // El segundo parámetro true indica que se deben revocar los tokens anteriores
    
    // Devolver el usuario actualizado y el nuevo token
    res.json({ 
      ok: true, 
      user: updatedUser,
      token: newToken
    });
  } catch (err) {
    const userId = req.params.id || (req.user ? req.user.userId : 'desconocido');
    console.error(`Error al actualizar tipo de guardia para usuario ${userId}:`, err);
    next(err);
  }
}

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getAdminUsers,
  updateGuardType
};
