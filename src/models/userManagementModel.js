// src/models/userManagementModel.js
const pool = require('../config/db');

// Obtener todos los usuarios
async function getAllUsers() {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.name, u.email, u.created_at, r.name AS role
      FROM users u
      JOIN roles r ON r.id = u.role_id
      ORDER BY u.created_at DESC
    `);
    return result.rows;
  } catch (err) {
    console.error('Error en modelo al obtener usuarios:', err);
    throw err;
  }
}

// Obtener un usuario por ID
async function getUserById(id) {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.name, u.email, u.created_at, r.name AS role
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE u.id = $1
    `, [id]);
    
    return result.rows[0];
  } catch (err) {
    console.error(`Error en modelo al obtener usuario con ID ${id}:`, err);
    throw err;
  }
}

// Verificar si un usuario existe por username o email
async function checkUserExists(username, email, excludeId = null) {
  try {
    let query = 'SELECT * FROM users WHERE username = $1 OR email = $2';
    const params = [username, email];
    
    if (excludeId) {
      query += ' AND id != $3';
      params.push(excludeId);
    }
    
    const result = await pool.query(query, params);
    return result.rows.length > 0;
  } catch (err) {
    console.error('Error en modelo al verificar si el usuario existe:', err);
    throw err;
  }
}

// Obtener ID de rol por nombre
async function getRoleIdByName(roleName) {
  try {
    const result = await pool.query(
      'SELECT id FROM roles WHERE name = $1',
      [roleName]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0].id;
  } catch (err) {
    console.error(`Error en modelo al obtener ID del rol ${roleName}:`, err);
    throw err;
  }
}

// Crear un nuevo usuario
async function createUser(userData) {
  try {
    const { username, name, email, passwordHash, roleId } = userData;
    
    const result = await pool.query(
      `INSERT INTO users (username, name, email, password_hash, role_id, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id, username, name, email, created_at`,
      [username, name, email, passwordHash, roleId]
    );
    
    return result.rows[0];
  } catch (err) {
    console.error('Error en modelo al crear usuario:', err);
    throw err;
  }
}

// Actualizar un usuario existente
async function updateUser(id, updateData) {
  try {
    const { fields, values } = updateData;
    
    // Construir la consulta dinámicamente
    let updateQuery = 'UPDATE users SET ';
    updateQuery += fields.map((field, index) => `${field} = $${index + 1}`).join(', ');
    updateQuery += ` WHERE id = $${fields.length + 1} RETURNING id, username, name, email, created_at`;
    
    // Añadir el ID al final de los valores
    values.push(id);
    
    const result = await pool.query(updateQuery, values);
    return result.rows[0];
  } catch (err) {
    console.error(`Error en modelo al actualizar usuario con ID ${id}:`, err);
    throw err;
  }
}

// Eliminar un usuario
async function deleteUser(id) {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return true;
  } catch (err) {
    console.error(`Error en modelo al eliminar usuario con ID ${id}:`, err);
    throw err;
  }
}

// Obtener usuarios con rol admin y sysadmin
async function getAdminUsers() {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, r.name AS role
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.name IN ('admin', 'sysadmin')
      ORDER BY u.name ASC
    `);
    return result.rows;
  } catch (err) {
    console.error('Error en modelo al obtener usuarios admin/sysadmin:', err);
    throw err;
  }
}

module.exports = {
  getAllUsers,
  getUserById,
  checkUserExists,
  getRoleIdByName,
  createUser,
  updateUser,
  deleteUser,
  getAdminUsers
};
