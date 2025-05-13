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
  editContact,
  removeContact
} = require('../controllers/contactsController');
const upload = require('../middlewares/upload');

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
  upload.fields([
    { name: 'idPhoto',   maxCount: 1 },
    { name: 'platePhoto', maxCount: 1 },
  ]),
  createNewContact
);

router.put(
  '/:id',
  verifyJWT,
  upload.fields([
    { name: 'idPhoto',   maxCount: 1 },
    { name: 'platePhoto', maxCount: 1 },
  ]),
  editContact
);

router.delete(
  '/:id',
  verifyJWT,
  requireRole('admin','sysadmin'),
  removeContact
);

module.exports = router;
