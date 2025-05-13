// src/routes/contacts.js
const router = require('express').Router();
const {
  verifyJWT,
  requireRole
} = require('../middlewares/auth');
const {
  listContacts,
  showContact,
  createNewContact,
  updateContactById,
  removeContact
} = require('../controllers/contactsController');

router.get(
  '/',
  verifyJWT,
  listContacts
);

router.get(
  '/:id',
  verifyJWT,
  showContact
);

router.post(
  '/',
  verifyJWT,
  createNewContact
);

router.put(
  '/:id',
  verifyJWT,
  updateContactById
);

router.delete(
  '/:id',
  verifyJWT,
  requireRole('admin','sysadmin'),
  removeContact
);

module.exports = router;
