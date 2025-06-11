const {
    createVehiculo,
    getVehiculosByVisitante,
    getVehiculoById,
    deleteVehiculo,
    updateVehiculo,
    searchVehiculoByPlaca
  } = require('../models/vehiculoModel');
  
  const { handleError, checkRequiredFields } = require('../utils/controllerHelpers');
  
  async function postVehiculo(req, res) {
    try {
      const { placa, id_visitante } = req.body;
      const foto_placa = req.file?.filename || null;
  
      checkRequiredFields(['placa', 'id_visitante'], req.body);
  
      const vehiculo = await createVehiculo({ foto_placa, placa, id_visitante });
      res.status(201).json({ ok: true, vehiculo });
    } catch (error) {
      handleError(res, error);
    }
  }
  
  async function getVehiculos(req, res) {
    try {
      const visitante_id = req.query.visitante_id;
      if (!visitante_id) {
        return res.status(400).json({ ok: false, error: 'visitante_id es requerido' });
      }
  
      const vehiculos = await getVehiculosByVisitante(visitante_id);
      res.json({ ok: true, vehiculos });
    } catch (error) {
      handleError(res, error);
    }
  }
  
  async function getVehiculoByIdHandler(req, res) {
    try {
      const vehiculo = await getVehiculoById(req.params.id);
      if (!vehiculo) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
      res.json({ ok: true, vehiculo });
    } catch (error) {
      handleError(res, error);
    }
  }
  
  async function deleteVehiculoHandler(req, res) {
    try {
      const eliminado = await deleteVehiculo(req.params.id);
      if (!eliminado) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado o ya inactivo' });
      res.json({ ok: true, message: 'Vehículo marcado como inactivo', vehiculo: eliminado });
    } catch (error) {
      handleError(res, error);
    }
  }

  async function putVehiculo(req, res) {
    try {
      const fields = req.body;
      if (req.file) {
        fields.foto_placa = req.file.filename;
      }
  
      const updated = await updateVehiculo(req.params.id, fields);
      if (!updated) return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
  
      res.json({ ok: true, vehiculo: updated });
    } catch (error) {
      handleError(res, error);
    }
  }

  async function searchVehiculoHandler(req, res) {
    try {
      const placa = req.query.placa;
      if (!placa) {
        return res.status(400).json({ ok: false, error: 'Parámetro "placa" requerido' });
      }
  
      const vehiculo = await searchVehiculoByPlaca(placa.trim());
      if (!vehiculo) {
        return res.status(404).json({ ok: false, error: 'Vehículo no encontrado' });
      }
  
      res.json({ ok: true, vehiculo });
    } catch (error) {
      handleError(res, error);
    }
  }
  
  
  module.exports = {
    postVehiculo,
    getVehiculos,
    getVehiculoByIdHandler,
    deleteVehiculoHandler,
    putVehiculo,
    searchVehiculoHandler
  };
  