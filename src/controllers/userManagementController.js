// src/controllers/userManagementController.js
const bcrypt = require('bcrypt');
const userModel = require('../models/userManagementModel');

// Obtener todos los usuarios
async function getAllUsers(req, res, next) {
  try {
    console.log('Obteniendo todos los usuarios');
    
    const users = await userModel.getAllUsers();
    
    console.log(`Se encontraron ${users.length} usuarios`);
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
    console.log(`Obteniendo usuario con ID: ${id}`);
    
    const user = await userModel.getUserById(id);
    
    if (!user) {
      console.log(`Usuario con ID ${id} no encontrado`);
      return res.status(404).json({ ok: false, err: 'Usuario no encontrado' });
    }
    
    console.log('Usuario encontrado');
    res.json({ ok: true, user });
  } catch (err) {
    console.error(`Error al obtener usuario con ID ${req.params.id}:`, err);
    next(err);
  }
}

// Crear un nuevo usuario
async function createUser(req, res, next) {
  try {
    const { username, name, email, password, role } = req.body;
    console.log('Creando nuevo usuario:', { username, name, email, role });
    
    // Verificar si el usuario ya existe
    const userExists = await userModel.checkUserExists(username, email);
    
    if (userExists) {
      console.log('El usuario o email ya existe');
      return res.status(400).json({ ok: false, err: 'El nombre de usuario o email ya está en uso' });
    }
    
    // Obtener el ID del rol
    const roleId = await userModel.getRoleIdByName(role);
    
    if (!roleId) {
      console.log(`Rol '${role}' no encontrado`);
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
    
    const newUser = await userModel.createUser(userData);
    
    console.log('Usuario creado con éxito');
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
    console.log(`Actualizando usuario con ID: ${id}`);
    
    // Verificar si el usuario existe
    const user = await userModel.getUserById(id);
    
    if (!user) {
      console.log(`Usuario con ID ${id} no encontrado`);
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
        console.log('El nombre de usuario o email ya está en uso por otro usuario');
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
        console.log(`Rol '${role}' no encontrado`);
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
    
    console.log('Usuario actualizado con éxito');
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
    console.log(`Eliminando usuario con ID: ${id}`);
    
    // Verificar si el usuario existe
    const user = await userModel.getUserById(id);
    
    if (!user) {
      console.log(`Usuario con ID ${id} no encontrado`);
      return res.status(404).json({ ok: false, err: 'Usuario no encontrado' });
    }
    
    // Eliminar el usuario
    await userModel.deleteUser(id);
    
    console.log('Usuario eliminado con éxito');
    res.json({ ok: true, message: 'Usuario eliminado correctamente' });
  } catch (err) {
    console.error(`Error al eliminar usuario con ID ${req.params.id}:`, err);
    next(err);
  }
}

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
};
