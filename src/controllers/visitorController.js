const path = require('path');
const fs = require('fs').promises;
const {
  getAllVisitors,
  getVisitorById,
  createVisitor,
  updateVisitor,
  deleteVisitor,
  searchVisitors,
  VisitorError
} = require('../models/visitorModel');

/**
 * Lista todos los visitantes
 * GET /visitors
 */
async function listVisitors(req, res, next) {
  try {
    const visitors = await getAllVisitors();
    res.json({ ok: true, data: visitors });
  } catch (err) {
    if (err instanceof VisitorError) {
      return res.status(err.status).json({ 
        ok: false, 
        error: err.message,
        code: err.code
      });
    }
    next(err);
  }
}

/**
 * Muestra un visitante específico
 * GET /visitors/:id
 */
async function showVisitor(req, res, next) {
  try {
    const visitor = await getVisitorById(req.params.id);
    if (!visitor) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Visitante no encontrado',
        code: 'VISITOR_NOT_FOUND'
      });
    }
    res.json({ ok: true, data: visitor });
  } catch (err) {
    if (err instanceof VisitorError) {
      return res.status(err.status).json({ 
        ok: false, 
        error: err.message,
        code: err.code
      });
    }
    next(err);
  }
}

/**
 * Crea un nuevo visitante
 * POST /visitors
 */
async function createNewVisitor(req, res, next) {
  try {
    // 1) Extrae los datos de texto
    const { visitor_name, phone, email, company, type } = req.body;

    if (!visitor_name) {
      return res.status(400).json({ 
        ok: false, 
        error: 'El nombre del visitante es obligatorio',
        code: 'MISSING_REQUIRED_FIELD'
      });
    }

    // 2) Extrae los nombres de archivo
    const idPhotoFile = req.files?.idPhoto?.[0]?.filename;
    
    // La foto de identificación es opcional para visitantes sin vehículo
    // pero obligatoria para otros tipos de visitantes
    if (!idPhotoFile && type !== 'sin_vehiculo') {
      return res.status(400).json({ 
        ok: false, 
        error: 'La foto de identificación es obligatoria',
        code: 'MISSING_REQUIRED_FILE'
      });
    }

    // 3) Llama al modelo pasándole rutas de imágenes
    const visitorData = {
      visitor_name,
      phone,
      email,
      company,
      type
    };
    
    // Agregar la ruta de la foto solo si existe
    if (idPhotoFile) {
      visitorData.visitor_id_photo_path = `uploads/${idPhotoFile}`;
    }
    
    const visitorId = await createVisitor(visitorData);

    // 4) Obtiene el visitante completo para devolverlo en la respuesta
    const newVisitor = await getVisitorById(visitorId);
    
    res.status(201).json({ ok: true, data: newVisitor });
  } catch (err) {
    if (err instanceof VisitorError) {
      return res.status(err.status).json({ 
        ok: false, 
        error: err.message,
        code: err.code
      });
    }
    next(err);
  }
}

/**
 * Actualiza un visitante existente
 * PUT /visitors/:id
 */
async function editVisitor(req, res, next) {
  try {
    const id = req.params.id;

    // Verificar que el visitante existe
    const existing = await getVisitorById(id);
    if (!existing) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Visitante no encontrado',
        code: 'VISITOR_NOT_FOUND'
      });
    }

    const payload = {};
    // Campos de texto
    ['visitor_name', 'phone', 'email', 'company', 'type'].forEach(f => {
      if (req.body[f] !== undefined) payload[f] = req.body[f];
    });

    // Actualizar foto de identificación si se proporciona
    if (req.files?.idPhoto) {
      const oldPath = path.join(__dirname, '..', existing.visitor_id_photo_path);
      // Intentar borrar el archivo antiguo (ignorar error si no existe)
      await fs.unlink(oldPath).catch(() => {});
      // Guardar la ruta relativa al disco
      const newFile = req.files.idPhoto[0].filename;
      payload.visitor_id_photo_path = `uploads/${newFile}`;
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'No se proporcionaron datos para actualizar',
        code: 'NO_UPDATE_DATA'
      });
    }

    const updated = await updateVisitor(id, payload);
    res.json({ ok: true, data: updated });
  } catch (err) {
    if (err instanceof VisitorError) {
      return res.status(err.status).json({ 
        ok: false, 
        error: err.message,
        code: err.code
      });
    }
    next(err);
  }
}

/**
 * Elimina un visitante
 * DELETE /visitors/:id
 */
async function removeVisitor(req, res, next) {
  try {
    // Verificar que el visitante existe
    const existing = await getVisitorById(req.params.id);
    if (!existing) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Visitante no encontrado',
        code: 'VISITOR_NOT_FOUND'
      });
    }

    // Eliminar la foto de identificación
    if (existing.visitor_id_photo_path) {
      const filePath = path.join(__dirname, '..', existing.visitor_id_photo_path);
      await fs.unlink(filePath).catch(() => {});
    }

    await deleteVisitor(req.params.id);
    res.json({ ok: true, message: 'Visitante eliminado correctamente' });
  } catch (err) {
    if (err instanceof VisitorError) {
      return res.status(err.status).json({ 
        ok: false, 
        error: err.message,
        code: err.code
      });
    }
    next(err);
  }
}

/**
 * Busca visitantes por nombre
 * GET /visitors/search?q=query o GET /visitors/search?name=query
 */
async function searchVisitorsByName(req, res, next) {
  try {
    // Aceptar tanto 'q' como 'name' como parámetros de búsqueda
    const query = req.query.q || req.query.name;
    if (!query) {
      return res.status(400).json({ 
        ok: false, 
        error: 'El término de búsqueda es obligatorio',
        code: 'MISSING_SEARCH_TERM'
      });
    }

    const visitors = await searchVisitors(query);
    res.json({ ok: true, data: visitors });
  } catch (err) {
    if (err instanceof VisitorError) {
      return res.status(err.status).json({ 
        ok: false, 
        error: err.message,
        code: err.code
      });
    }
    next(err);
  }
}

module.exports = {
  listVisitors,
  showVisitor,
  createNewVisitor,
  editVisitor,
  removeVisitor,
  searchVisitorsByName
};
