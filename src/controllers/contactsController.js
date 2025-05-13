const {
    getAllContacts,
    getContactById,
    createContact,
    updateContact,
    deleteContact
  } = require('../models/contactModel');
  
  // GET /contacts
  async function listContacts(req, res, next) {
    try {
      const contacts = await getAllContacts();
      res.json({ ok: true, data: contacts });
    } catch (err) {
      next(err);
    }
  }
  
  // GET /contacts/:id
  async function showContact(req, res, next) {
    try {
      const contact = await getContactById(req.params.id);
      if (!contact) return res.status(404).json({ ok:false, error:'No encontrado' });
      res.json({ ok: true, data: contact });
    } catch (err) {
      next(err);
    }
  }
  
  // POST /contacts
  async function createNewContact(req, res, next) {
    try {
      const payload = req.body;
      const contact = await createContact(payload);
      res.status(201).json({ ok: true, data: contact });
    } catch (err) {
      next(err);
    }
  }

  // PUT /contacts/:id
  async function updateContactById(req, res, next) {
    try {
      const payload = req.body;
      const contact = await updateContact(req.params.id, payload);
      res.json({ ok: true, data: contact });
    } catch (err) {
      next(err);
    }
  }
  
  // DELETE /contacts/:id
  async function removeContact(req, res, next) {
    try {
      await deleteContact(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
  
  module.exports = {
    listContacts,
    showContact,
    createNewContact,
    updateContactById,
    removeContact
  };
  