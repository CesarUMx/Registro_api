// src/controllers/userManagementController.js
const bcrypt = require('bcrypt');
const userModel = require('../models/userManagementModel');
const { generateToken } = require('./authController');
const pool = require('../config/db');
const emailService = require('../services/emailService');
const crypto = require('crypto');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

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
    const { username, name, email, role, guardType, google_auth } = req.body;
    let { password } = req.body;
    const sendCredentials = req.body.sendCredentials !== false; // Por defecto, enviar credenciales
    
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
    
    // Si es autenticación por credenciales y no hay contraseña o es carga masiva, generar una aleatoria
    if (!google_auth && (!password || req.body.generatePassword)) {
      // Generar contraseña aleatoria de 8 caracteres
      password = crypto.randomBytes(4).toString('hex');
      console.log(`Contraseña generada para ${username}: ${password}`);
    }
    
    // Hashear la contraseña si no es autenticación con Google
    let passwordHash = null;
    if (!google_auth) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    
    // Crear el usuario
    const userData = {
      username,
      name,
      email,
      passwordHash,
      roleId,
      google_auth: google_auth || false
    };
    
    // Si es un guardia, incluir el tipo de guardia
    if (role === 'guardia' && guardType) {
      userData.guardType = guardType;
    }
    
    const newUser = await userModel.createUser(userData);
    
    // Enviar credenciales por correo si no es autenticación con Google
    if (!google_auth && sendCredentials && email) {
      try {
        await emailService.enviarCredencialesUsuario(email, name || username, username, password);
        console.log(`Credenciales enviadas por correo a ${email}`);
      } catch (emailError) {
        console.error('Error al enviar credenciales por correo:', emailError);
        // No interrumpir el flujo si falla el envío de correo
      }
    }
    
    res.status(201).json({ 
      ok: true, 
      user: newUser,
      credentialsEmailed: !google_auth && sendCredentials && email ? true : false
    });
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
    next(err);
  }
}

// Configuración de multer para la carga de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '../uploads');
    // Crear directorio si no existe
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Aceptar solo archivos CSV
    if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      return cb(new Error('Solo se permiten archivos CSV'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 1024 * 1024 * 5 } // Límite de 5MB
});

// Middleware para manejar la carga de archivos
const uploadMiddleware = upload.single('usersFile');

// Función para procesar la carga masiva de usuarios
async function bulkCreateUsers(req, res, next) {
  try {
    // Usar una promesa para manejar el middleware de multer
    await new Promise((resolve, reject) => {
      uploadMiddleware(req, res, function (err) {
        if (err instanceof multer.MulterError) {
          // Error de multer
          return reject({
            status: 400,
            message: `Error en la carga del archivo: ${err.message}`
          });
        } else if (err) {
          // Error desconocido
          return reject({
            status: 500,
            message: `Error inesperado: ${err.message}`
          });
        }
        resolve();
      });
    });

    // Verificar si se subió un archivo
    if (!req.file) {
      return res.status(400).json({ 
        ok: false, 
        err: 'No se ha proporcionado ningún archivo CSV' 
      });
    }

    const filePath = req.file.path;
    const results = [];
    const errors = [];
    let processedCount = 0;
    let successCount = 0;

    // Procesar el archivo CSV
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', async (data) => {
          try {
            // Validar datos mínimos requeridos
            if (!data.username || !data.email || !data.role) {
              errors.push({
                row: processedCount + 1,
                error: 'Faltan campos obligatorios (username, email, role)',
                data
              });
              processedCount++;
              return;
            }

            // Preparar datos del usuario
            const userData = {
              username: data.username,
              name: data.name || data.username,
              email: data.email,
              role: data.role,
              codigo_empleado: data.codigo_empleado,
              generatePassword: true, // Generar contraseña aleatoria
              sendCredentials: true  // Enviar credenciales por correo
            };

            // Agregar tipo de guardia si corresponde
            if (data.role === 'guardia' && data.guardType) {
              userData.guardType = data.guardType;
            }

            // Crear usuario (reutilizando la función existente)
            const userReq = { 
              body: userData,
              user: req.user // Pasar el usuario autenticado para validaciones
            };
            const userRes = {
              status: function(code) {
                return {
                  json: function(data) {
                    if (code === 201) {
                      successCount++;
                      results.push({
                        username: userData.username,
                        email: userData.email,
                        role: userData.role,
                        success: true,
                        credentialsEmailed: data.credentialsEmailed
                      });
                    } else {
                      errors.push({
                        row: processedCount + 1,
                        error: data.err || 'Error desconocido',
                        data: userData
                      });
                    }
                  }
                };
              }
            };

            // Llamar a createUser de forma sincrónica para cada usuario
            await new Promise(resolve => {
              createUser(userReq, userRes, (err) => {
                if (err) {
                  errors.push({
                    row: processedCount + 1,
                    error: err.message || 'Error al crear usuario',
                    data: userData
                  });
                }
                resolve();
              });
              processedCount++;
            });
          } catch (err) {
            errors.push({
              row: processedCount + 1,
              error: err.message || 'Error al procesar fila',
              data
            });
            processedCount++;
          }
        })
        .on('end', () => {
          // Eliminar el archivo temporal
          fs.unlink(filePath, (err) => {
            if (err) console.error('Error al eliminar archivo temporal:', err);
          });
          resolve();
        })
        .on('error', (err) => {
          reject(err);
        });
    });

    // Devolver resultados
    res.json({
      ok: true,
      message: `Proceso completado. ${successCount} usuarios creados exitosamente, ${errors.length} errores.`,
      processed: processedCount,
      success: successCount,
      errors: errors.length > 0 ? errors : undefined,
      results: results.length > 0 ? results : undefined
    });

  } catch (err) {
    console.error('Error en carga masiva de usuarios:', err);
    
    // Si el error fue generado por nuestro middleware
    if (err.status) {
      return res.status(err.status).json({ ok: false, err: err.message });
    }
    
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
  updateGuardType,
  bulkCreateUsers
};
