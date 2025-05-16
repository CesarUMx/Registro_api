const {
  associateDriverToVisitor,
  dissociateDriverFromVisitor,
  getVisitorDrivers,
  setPrimaryDriver,
  VisitorDriverError
} = require('../models/visitorDriverModel');

/**
 * Asocia un conductor a un visitante
 * POST /visitors/:visitorId/drivers
 */
async function addDriverToVisitor(req, res, next) {
  try {
    const visitorId = req.params.visitorId;
    const { driverId, isPrimary = false } = req.body;

    if (!visitorId || !driverId) {
      return res.status(400).json({
        ok: false,
        error: 'Se requieren los IDs del visitante y del conductor',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    const association = await associateDriverToVisitor(visitorId, driverId, isPrimary);
    res.status(201).json({ ok: true, data: association });
  } catch (err) {
    if (err instanceof VisitorDriverError) {
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
 * Elimina la asociación entre un conductor y un visitante
 * DELETE /visitors/:visitorId/drivers/:driverId
 */
async function removeDriverFromVisitor(req, res, next) {
  try {
    const { visitorId, driverId } = req.params;

    if (!visitorId || !driverId) {
      return res.status(400).json({
        ok: false,
        error: 'Se requieren los IDs del visitante y del conductor',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    await dissociateDriverFromVisitor(visitorId, driverId);
    res.json({ 
      ok: true, 
      message: 'Conductor desasociado del visitante correctamente' 
    });
  } catch (err) {
    if (err instanceof VisitorDriverError) {
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
 * Obtiene todos los conductores asociados a un visitante
 * GET /visitors/:visitorId/drivers
 */
async function listDriversForVisitor(req, res, next) {
  try {
    const visitorId = req.params.visitorId;

    if (!visitorId) {
      return res.status(400).json({
        ok: false,
        error: 'Se requiere el ID del visitante',
        code: 'MISSING_VISITOR_ID'
      });
    }

    const drivers = await getVisitorDrivers(visitorId);
    res.json({ ok: true, data: drivers });
  } catch (err) {
    if (err instanceof VisitorDriverError) {
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
 * Establece un conductor como el principal para un visitante
 * PUT /visitors/:visitorId/drivers/:driverId/primary
 */
async function makePrimaryDriver(req, res, next) {
  try {
    const { visitorId, driverId } = req.params;

    if (!visitorId || !driverId) {
      return res.status(400).json({
        ok: false,
        error: 'Se requieren los IDs del visitante y del conductor',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    await setPrimaryDriver(visitorId, driverId);
    res.json({ 
      ok: true, 
      message: 'Conductor establecido como principal correctamente' 
    });
  } catch (err) {
    if (err instanceof VisitorDriverError) {
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
  addDriverToVisitor,
  removeDriverFromVisitor,
  listDriversForVisitor,
  makePrimaryDriver
};
