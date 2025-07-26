const pool = require('../config/db');
const { normalizeName } = require('../utils/controllerHelpers');

async function createVisitante({ nombre, tipo, telefono, empresa, foto_persona, foto_ine }) {

  const normalizado = normalizeName(nombre);
  const existe = await searchVisitantes(normalizado);

  if (existe.length > 0) {
    throw Object.assign(new Error('Visitante ya existe'), {
      status: 400,
      code: 'VISITANTE_EXISTS'
    });
  }

  const result = await pool.query(
    `INSERT INTO visitantes (nombre, tipo, telefono, empresa, foto_persona, foto_ine)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [nombre, tipo, telefono, empresa, foto_persona, foto_ine]
  );
  return result.rows[0];
}

async function getVisitanteById(id) {
  const result = await pool.query(
    'SELECT * FROM visitantes WHERE activo = true AND id = $1',
    [id]
  );
  return result.rows[0];
}

async function searchVisitantes(query) {
  const normalizado = normalizeName(query);

  if (normalizado && normalizado.length >= 2) {
    const result = await pool.query(
      `SELECT id, nombre, telefono, empresa, tipo
       FROM visitantes
       WHERE activo = true AND (
         nombre ILIKE $1
       )
       ORDER BY nombre ASC
       LIMIT 10`,
      [`%${normalizado}%`]
    );
    return result.rows;
  } else {
    const all = await pool.query(
      `SELECT id, nombre, telefono, empresa, tipo
       FROM visitantes
       WHERE activo = true
       ORDER BY nombre ASC`
    );
    return all.rows;
  }
}

async function updateVisitante(id, fields) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  const updates = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');

  const result = await pool.query(
    `UPDATE visitantes SET ${updates} WHERE id = $${keys.length + 1} RETURNING *`,
    [...values, id]
  );
  return result.rows[0];
}

async function deleteVisitante(id) {
    const result = await pool.query(
      `UPDATE visitantes SET activo = false WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }
  

/**
 * Crear o buscar visitante (para preregistros públicos)
 */
async function crearOBuscarVisitante(visitanteData) {
  const { nombre, telefono, empresa } = visitanteData;
  
  // Buscar si ya existe por nombre (normalizado)
  const normalizado = normalizeName(nombre);
  const visitantesExistentes = await searchVisitantes(normalizado);
  
  if (visitantesExistentes.length > 0) {
    // Si existe, tomar el primero y actualizar datos si es necesario
    const visitanteExistente = visitantesExistentes[0];
    const camposActualizar = {};
    
    if (telefono && telefono !== visitanteExistente.telefono) {
      camposActualizar.telefono = telefono;
    }
    if (empresa && empresa !== visitanteExistente.empresa) {
      camposActualizar.empresa = empresa;
    }
    
    if (Object.keys(camposActualizar).length > 0) {
      await updateVisitante(visitanteExistente.id, camposActualizar);
      return { ...visitanteExistente, ...camposActualizar };
    }
    
    return visitanteExistente;
  }
  
  // Si no existe, crear nuevo visitante
  const result = await pool.query(
    `INSERT INTO visitantes (nombre, tipo, telefono, empresa)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [
      nombre,
      visitanteData.tipo || 'externo',
      telefono || '',
      empresa || ''
    ]
  );
  
  return result.rows[0];
}

module.exports = {
  createVisitante,
  getVisitanteById,
  searchVisitantes,
  updateVisitante,
  deleteVisitante,
  crearOBuscarVisitante
};
