const path = require('path');
const fs = require('fs').promises;
const {
  getAllDrivers,
  getDriverById,
  createDriver,
  updateDriver,
  deleteDriver,
  searchDrivers,
  getDriversByVisitorId,
  DriverError
} = require('../models/driverModel');

/**
 * Lista todos los conductores
 * GET /drivers
 */
async function listDrivers(req, res, next) {
  try {
    const drivers = await getAllDrivers();
    res.json({ ok: true, data: drivers });
  } catch (err) {
    if (err instanceof DriverError) {
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
 * Muestra un conductor específico
 * GET /drivers/:id
 */
async function showDriver(req, res, next) {
  try {
    const driver = await getDriverById(req.params.id);
    if (!driver) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Conductor no encontrado',
        code: 'DRIVER_NOT_FOUND'
      });
    }
    res.json({ ok: true, data: driver });
  } catch (err) {
    if (err instanceof DriverError) {
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
 * Crea un nuevo conductor
 * POST /drivers
 */
async function createNewDriver(req, res, next) {
  try {
    // 1) Extrae los datos de texto
    const { driver_name } = req.body;

    if (!driver_name) {
      return res.status(400).json({ 
        ok: false, 
        error: 'El nombre del conductor es obligatorio',
        code: 'MISSING_REQUIRED_FIELD'
      });
    }

    // 2) Extrae los nombres de archivo
    const idPhotoFile = req.files?.idPhoto?.[0]?.filename;
    const platePhotoFile = req.files?.platePhoto?.[0]?.filename;
    
    if (!idPhotoFile || !platePhotoFile) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Las fotos de identificación y placa son obligatorias',
        code: 'MISSING_REQUIRED_FILES'
      });
    }

    // 3) Llama al modelo pasándole rutas de imágenes
    const driverId = await createDriver({
      driver_name,
      driver_id_photo_path: `uploads/${idPhotoFile}`,
      plate_photo_path: `uploads/${platePhotoFile}`
    });

    // 4) Obtiene el conductor completo para devolverlo en la respuesta
    const newDriver = await getDriverById(driverId);
    
    res.status(201).json({ ok: true, data: newDriver });
  } catch (err) {
    if (err instanceof DriverError) {
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
 * Actualiza un conductor existente
 * PUT /drivers/:id
 */
async function editDriver(req, res, next) {
  try {
    const id = req.params.id;

    // Verificar que el conductor existe
    const existing = await getDriverById(id);
    if (!existing) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Conductor no encontrado',
        code: 'DRIVER_NOT_FOUND'
      });
    }

    const payload = {};
    // Campos de texto
    ['driver_name'].forEach(f => {
      if (req.body[f] !== undefined) payload[f] = req.body[f];
    });

    // Actualizar foto de identificación si se proporciona
    if (req.files?.idPhoto) {
      const oldPath = path.join(__dirname, '..', existing.driver_id_photo_path);
      // Intentar borrar el archivo antiguo (ignorar error si no existe)
      await fs.unlink(oldPath).catch(() => {});
      // Guardar la ruta relativa al disco
      const newFile = req.files.idPhoto[0].filename;
      payload.driver_id_photo_path = `uploads/${newFile}`;
    }

    // Actualizar foto de placa si se proporciona
    if (req.files?.platePhoto) {
      const oldPath = path.join(__dirname, '..', existing.plate_photo_path);
      // Intentar borrar el archivo antiguo (ignorar error si no existe)
      await fs.unlink(oldPath).catch(() => {});
      // Guardar la ruta relativa al disco
      const newFile = req.files.platePhoto[0].filename;
      payload.plate_photo_path = `uploads/${newFile}`;
    }

    if (Object.keys(payload).length === 0) {
      return res.status(400).json({ 
        ok: false, 
        error: 'No se proporcionaron datos para actualizar',
        code: 'NO_UPDATE_DATA'
      });
    }

    const updated = await updateDriver(id, payload);
    res.json({ ok: true, data: updated });
  } catch (err) {
    if (err instanceof DriverError) {
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
 * Elimina un conductor
 * DELETE /drivers/:id
 */
async function removeDriver(req, res, next) {
  try {
    // Verificar que el conductor existe
    const existing = await getDriverById(req.params.id);
    if (!existing) {
      return res.status(404).json({ 
        ok: false, 
        error: 'Conductor no encontrado',
        code: 'DRIVER_NOT_FOUND'
      });
    }

    // Eliminar las fotos
    if (existing.driver_id_photo_path) {
      const idPhotoPath = path.join(__dirname, '..', existing.driver_id_photo_path);
      await fs.unlink(idPhotoPath).catch(() => {});
    }
    
    if (existing.plate_photo_path) {
      const platePhotoPath = path.join(__dirname, '..', existing.plate_photo_path);
      await fs.unlink(platePhotoPath).catch(() => {});
    }

    await deleteDriver(req.params.id);
    res.json({ ok: true, message: 'Conductor eliminado correctamente' });
  } catch (err) {
    if (err instanceof DriverError) {
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
 * Busca conductores por nombre
 * GET /drivers/search?q=query
 */
async function searchDriversByName(req, res, next) {
  try {
    const query = req.query.q;
    if (!query) {
      return res.status(400).json({ 
        ok: false, 
        error: 'El término de búsqueda es obligatorio',
        code: 'MISSING_SEARCH_TERM'
      });
    }

    const drivers = await searchDrivers(query);
    res.json({ ok: true, data: drivers });
  } catch (err) {
    if (err instanceof DriverError) {
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
 * Obtiene los conductores asociados a un visitante
 * GET /visitors/:visitorId/drivers
 */
async function getDriversForVisitor(req, res, next) {
  try {
    const visitorId = req.params.visitorId;
    if (!visitorId) {
      return res.status(400).json({ 
        ok: false, 
        error: 'El ID del visitante es obligatorio',
        code: 'MISSING_VISITOR_ID'
      });
    }

    const drivers = await getDriversByVisitorId(visitorId);
    res.json({ ok: true, data: drivers });
  } catch (err) {
    if (err instanceof DriverError) {
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
  listDrivers,
  showDriver,
  createNewDriver,
  editDriver,
  removeDriver,
  searchDriversByName,
  getDriversForVisitor
};
