// src/routes/userManagementRoutes.js
const express = require('express');
const router = express.Router();
const { 
  getAllUsers, 
  getUserById, 
  createUser, 
  updateUser, 
  deleteUser,
  getAdminUsers,
  updateGuardType
} = require('../controllers/userManagementController');
const { verifyJWT, requireRole, requireGuardType } = require('../middlewares/auth');

// Middleware personalizado para permitir acceso a supervisores
const allowSupervisorAccess = (req, res, next) => {
  // Si es admin o sysadmin, continuar
  if (req.user.role === 'admin' || req.user.role === 'sysadmin') {
    return next();
  }
  
  // Si es guardia pero no supervisor, denegar acceso
  if (req.user.role === 'guardia' && req.user.guard_type !== 'supervisor') {
    return res.status(403).json({ ok: false, error: 'Permiso denegado' });
  }
  
  // Si es supervisor, continuar
  if (req.user.role === 'guardia' && req.user.guard_type === 'supervisor') {
    return next();
  }
  
  // Por defecto, denegar acceso
  return res.status(403).json({ ok: false, error: 'Permiso denegado' });
};

// Rutas protegidas - administradores, sysadmins y supervisores pueden acceder
router.get(
  '/', 
  verifyJWT, 
  allowSupervisorAccess, 
  getAllUsers
);
router.get('/admins', verifyJWT, getAdminUsers);
router.get('/:id', verifyJWT, allowSupervisorAccess, getUserById);

// Ruta específica para que los supervisores actualicen solo el tipo de guardia
router.put('/:id/guard-type', verifyJWT, requireRole('guardia'), requireGuardType('supervisor'), updateGuardType);

// Rutas para crear, actualizar y eliminar usuarios (sysadmin y supervisores para crear guardias)
router.post('/', verifyJWT, allowSupervisorAccess, createUser);
router.put('/:id', verifyJWT, requireRole('sysadmin'), updateUser);
router.delete('/:id', verifyJWT, requireRole('sysadmin'), deleteUser);

module.exports = router;
