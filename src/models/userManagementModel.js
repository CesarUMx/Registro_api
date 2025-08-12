// src/models/userManagementModel.js
const pool = require('../config/db');
require('dotenv').config();


// Obtener todos los usuarios
async function getAllUsers() {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.name, u.email, u.created_at, r.name AS role, u.guard_type
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
      SELECT u.id, u.username, u.name, u.email, u.created_at, r.name AS role, u.guard_type
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
    // Si no se proporciona username o email, no hay nada que verificar
    if (!username && !email) {
      return false;
    }
    
    // Construir la consulta dinámicamente basada en los parámetros proporcionados
    let conditions = [];
    const params = [];
    let paramIndex = 1;
    
    if (username) {
      conditions.push(`username = $${paramIndex}`);
      params.push(username);
      paramIndex++;
    }
    
    if (email) {
      conditions.push(`email = $${paramIndex}`);
      params.push(email);
      paramIndex++;
    }
    
    // Si no hay condiciones, no hay nada que verificar
    if (conditions.length === 0) {
      return false;
    }
    
    let query = `SELECT * FROM users WHERE (${conditions.join(' OR ')})`;
    
    // Excluir el ID del usuario que se está actualizando
    if (excludeId) {
      query += ` AND id != $${paramIndex}`;
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
    const { username, name, email, passwordHash, roleId, guardType } = userData;
    
    // Si es un guardia y se especificó un tipo, incluirlo en la consulta
    let query;
    let params;
    
    if (guardType) {
      query = `INSERT INTO users (username, name, email, password_hash, role_id, guard_type, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, NOW())
              RETURNING id, username, name, email, guard_type, created_at`;
      params = [username, name, email, passwordHash, roleId, guardType];
    } else {
      query = `INSERT INTO users (username, name, email, password_hash, role_id, created_at)
              VALUES ($1, $2, $3, $4, $5, NOW())
              RETURNING id, username, name, email, created_at`;
      params = [username, name, email, passwordHash, roleId];
    }
    
    const result = await pool.query(query, params);
    
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
    await pool.query(
      'UPDATE users SET activo = false WHERE id = $1',
      [id]
    );
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

// Actualizar solo el tipo de guardia
async function updateGuardType(id, guardType) {
  try {
    const result = await pool.query(
      `UPDATE users 
       SET guard_type = $1 
       WHERE id = $2 
       RETURNING id, username, name, email, guard_type`,
      [guardType, id]
    );
    
    return result.rows[0];
  } catch (err) {
    console.error(`Error en modelo al actualizar tipo de guardia para usuario ${id}:`, err);
    throw err;
  }
}

// Obtener usuarios con rol guardia
async function getGuardUsers() {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.name, u.email, u.created_at, r.name AS role, u.guard_type
      FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.name = 'guardia'
      ORDER BY u.created_at DESC
    `);
    return result.rows;
  } catch (err) {
    console.error('Error en modelo al obtener usuarios guardia:', err);
    throw err;
  }
}

// Validar si existe un usuario con el código de empleado proporcionado
async function validarCodigoEmpleado(codigo) {
  try {
    const result = await pool.query(`
      SELECT u.id, u.name, u.email
      FROM users u
      WHERE u.codigo_empleado = $1
    `, [codigo]);
    
    if (result.rows.length === 0) {
      return { valido: false };
    }
    
    return { 
      valido: true, 
      usuario: result.rows[0],
      tipo: 'empleado'
    };
  } catch (err) {
    console.error(`Error al validar código de empleado ${codigo}:`, err);
    throw err;
  }
}

// Función para validar matrícula de alumno usando la API académica
async function validarMatriculaAlumno(matricula) {
  try {
    const axios = require('axios');
    const Autorizacion = 'Basic ' + process.env.ACADEMIC_KEY;
    
    // Configuración de la petición a la API
    const config = {
      method: 'get',
      url: `https://apis.academic.lat/v3/schoolControl/students?onlyCurrentStudents=false&pageNumber=1&rowsPerPage=1&registrationTag=${matricula}`,
      headers: { 
        'accept': 'application/json', 
        'authorization': Autorizacion 
      }
    };
    
    // Realizar la petición a la API
    const response = await axios(config);
    
    // Verificar si la respuesta es exitosa y contiene datos
    if (response.data.resultado.exito) {
      // Si hay datos de estudiante, extraer la información necesaria
      const estudiante = response.data.informacion && response.data.informacion.length > 0 
        ? response.data.informacion[0] 
        : null;
      
      if (estudiante) {
        return {
          valido: true,
          alumno: {
            id: estudiante.id || null,
            nombre: estudiante.nombre || '',
            matricula: estudiante.matricula || matricula
          },
          tipo: 'alumno'
        };
      }
    }
    
    // Si no se encontró el estudiante o la respuesta no fue exitosa
    return { valido: false };
    
  } catch (err) {
    console.error(`Error al validar matrícula de alumno ${matricula}:`, err);
    // En caso de error en la API, devolvemos que no es válido
    return { valido: false, error: err.message };
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
  getAdminUsers,
  updateGuardType,
  getGuardUsers,
  validarCodigoEmpleado,
  validarMatriculaAlumno
};
