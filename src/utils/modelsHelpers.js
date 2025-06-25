// Valida si la tarjeta ya está en uso en algún registro activo (estatus != 'completo')
async function validateTarjetaDisponible(n_tarjeta, client) {
    const result = await client.query(`
      SELECT rv.id
      FROM registro_visitantes rv
      JOIN registro r ON rv.registro_id = r.id
      WHERE rv.n_tarjeta = $1
        AND r.estatus != 'completo'
      LIMIT 1
    `, [n_tarjeta]);
  
    if (result.rows.length > 0) {
      const error = new Error(`La tarjeta ${n_tarjeta} ya está asignada a otro registro activo`);
      error.status = 400;
      error.code = 'TARJETA_EN_USO';
      throw error;
    }
  }

  module.exports = {
    validateTarjetaDisponible
  };