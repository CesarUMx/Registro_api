// src/routes/userManagementRoutes.js
const express = require('express');
const router = express.Router();
const { 
  getAllUsers, 
  getUserById, 
  createUser, 
  updateUser, 
  deleteUser 
} = require('../controllers/userManagementController');
const { verifyJWT, requireRole } = require('../middlewares/auth');

// Rutas protegidas - solo administradores y sysadmins pueden acceder
router.get(
  '/', 
  verifyJWT, 
  requireRole('admin', 'sysadmin'), 
  getAllUsers
);
router.get('/:id', verifyJWT, requireRole('admin', 'sysadmin'), getUserById);
router.post('/', verifyJWT, requireRole('sysadmin'), createUser);
router.put('/:id', verifyJWT, requireRole('sysadmin'), updateUser);
router.delete('/:id', verifyJWT, requireRole('sysadmin'), deleteUser);

module.exports = router;
