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
      // 1) Extrae los datos de texto
      const { driver_name, phone, email, company, type } = req.body;
  
      // 2) Extrae los nombres de archivo (name o filename según tu impl)
      const idPhotoFile   = req.files.idPhoto?.[0]?.filename;
      const platePhotoFile= req.files.platePhoto?.[0]?.filename;
      if (!idPhotoFile || !platePhotoFile) {
        return res.status(400).json({ ok:false, error:'Faltan imágenes' });
      }
  
      // 3) Llama al modelo pasándole rutas de imágenes
      const contact = await createContact({
        driver_name,
        id_photo_path:    `uploads/${idPhotoFile}`,
        plate_photo_path: `uploads/${platePhotoFile}`,
        phone,
        email,
        company,
        type
      });
  
      res.status(201).json({ ok: true, data: contact });
    } catch (err) {
      next(err);
    }
  }

  // PUT /contacts/:id
  async function editContact(req, res, next) {
    try {
      const id = req.params.id;
      const payload = {};
      // Campos de texto
      ['driver_name','phone','email','company','type'].forEach(f => {
        if (req.body[f]) payload[f] = req.body[f];
      });
      // Imágenes nuevas (sobrescriben si vienen)
      if (req.files.idPhoto) {
        payload.id_photo_path = `uploads/${req.files.idPhoto[0].filename}`;
      }
      if (req.files.platePhoto) {
        payload.plate_photo_path = `uploads/${req.files.platePhoto[0].filename}`;
      }
      if (Object.keys(payload).length === 0) {
        return res.status(400).json({ ok:false, error:'Nada para actualizar' });
      }
      const updated = await updateContact(id, payload);
      res.json({ ok: true, data: updated });
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
    editContact,
    removeContact
  };
  