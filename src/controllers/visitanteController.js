const {
    createVisitante,
    getVisitanteById,
    searchVisitantes,
    updateVisitante,
    deleteVisitante
  } = require('../models/visitanteModel');
  
  const { handleError, checkRequiredFields, normalizeName } = require('../utils/controllerHelpers');
  
  // POST /api/visitantes crear visitante
  async function postVisitante(req, res) {
    try {
      const { nombre, tipo, telefono, empresa } = req.body;
      const nombreNormalizado = normalizeName(nombre);
      
      // Obtener el nombre del archivo de la foto de persona, ya sea desde el campo foto_persona_nombre
      // o desde el archivo subido
      const foto_ine = req.files?.foto_ine?.[0]?.filename;

      checkRequiredFields(['nombre', 'tipo'], req.body);

      if (tipo !== 'menor de edad' && tipo !== 'preregistro') {
        if (!foto_ine) {
          throw Object.assign(new Error('foto_ine es obligatoria para este tipo de visitante'), {
            status: 400,
            code: 'MISSING_FOTOS'
          });
        }
      }

      const visitante = await createVisitante({
        nombre: nombreNormalizado,
        tipo,
        telefono,
        empresa,
        foto_ine
      });
  
      res.status(201).json({ ok: true, visitante });
    } catch (error) {
      handleError(res, error);
    }
  }
  
  // GET /api/visitantes obtener visitantes
  async function getVisitantes(req, res) {
    try {
      const term = req.query.search;
  
      if (term && term.trim().length >= 2) {
        const results = await searchVisitantes(term.trim());
        return res.json({ ok: true, results });
      }
  
      // Si no hay término de búsqueda, devolver todos los visitantes
      const all = await searchVisitantes('');  // reutiliza misma función con string vacío
      return res.json({ ok: true, results: all });
    } catch (error) {
      handleError(res, error);
    }
  }
  
  // GET /api/visitantes/:id obtener visitante por id
  async function getVisitanteByIdHandler(req, res) {
    try {
      const visitante = await getVisitanteById(req.params.id);
      if (!visitante) return res.status(404).json({ ok: false, error: 'No encontrado' });
      res.json({ ok: true, visitante });
    } catch (error) {
      handleError(res, error);
    }
  }
  
  // PUT /api/visitantes/:id actualizar visitante
  async function putVisitante(req, res) {
    try {
      const fields = req.body;
      if (req.files?.foto_persona?.[0]) fields.foto_persona = req.files.foto_persona[0].filename;
      if (req.files?.foto_ine?.[0]) fields.foto_ine = req.files.foto_ine[0].filename;
      fields.nombre = normalizeName(fields.nombre);
  
      const updated = await updateVisitante(req.params.id, fields);
      res.json({ ok: true, visitante: updated });
    } catch (error) {
      handleError(res, error);
    }
  }
  
  // DELETE /api/visitantes/:id eliminar visitante
  async function deleteVisitanteHandler(req, res) {
    try {
      const deleted = await deleteVisitante(req.params.id);
      res.json({ ok: true, visitante: deleted });
    } catch (error) {
      handleError(res, error);
    }
  }
  
  // PATCH /api/visitantes/:id/foto-persona actualizar foto de persona del visitante
  async function updateVisitanteFotoPersona(req, res) {
    try {
      const visitanteId = req.params.id;
      
      // Verificar si existe el visitante
      const visitante = await getVisitanteById(visitanteId);
      if (!visitante) {
        return res.status(404).json({ ok: false, error: 'Visitante no encontrado' });
      }

      // Verificar si se subió una foto
      if (!req.files?.foto_persona?.[0]) {
        return res.status(400).json({ ok: false, error: 'No se proporcionó una foto' });
      }

      const foto_persona = req.files.foto_persona[0].filename;
      
      // Actualizar solo el campo foto_persona
      const updated = await updateVisitante(visitanteId, { foto_persona });
      
      res.json({ 
        ok: true, 
        visitante: updated,
        message: 'Foto actualizada correctamente'
      });
    } catch (error) {
      handleError(res, error);
    }
  }

  module.exports = {
    postVisitante,
    getVisitantes,
    getVisitanteByIdHandler,
    putVisitante,
    deleteVisitanteHandler,
    updateVisitanteFotoPersona
  };  