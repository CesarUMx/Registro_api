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

  //funcion para actualizar el numero de personas que salieron e intentar cerrar el registro
  async function actualizarSalida(salen, registroId, client, tip) {

    let cerrado = false;

    // valor de n_salieron
    const resultSalieron = await client.query(`
      SELECT n_salieron
      FROM registro
      WHERE id = $1
    `, [registroId]);

    const nSalieron = resultSalieron.rows[0].n_salieron;

    //actualizar el numeor de personas que salen
    await client.query(`
      UPDATE registro
      SET n_salieron = $1
      WHERE id = $2
    `, [nSalieron + salen, registroId]);

    // traer n_visitantes y n_salieron
    const result = await client.query(`
      SELECT n_visitantes, n_salieron
      FROM registro
      WHERE id = $1
    `, [registroId]);

    const resVehiculos = await client.query(`
      SELECT COUNT(*) FILTER (WHERE hora_salida IS NOT NULL) AS salieron,
             COUNT(*) AS total
      FROM registro_vehiculos
      WHERE registro_id = $1
    `, [registroId]);

    const { n_visitantes, n_salieron } = result.rows[0];

    if ((parseInt(n_visitantes) === parseInt(n_salieron)) && (parseInt(resVehiculos.rows[0].salieron) === parseInt(resVehiculos.rows[0].total))) {
      // Determinar qué campo de hora actualizar según el tipo de salida
      const campoHora = tip === 'edificio' ? 'hora_salida_edificio' : 'hora_salida_caseta';
      
      await client.query(`
        UPDATE registro
        SET estatus = 'completo',
        ${campoHora} = NOW()
        WHERE id = $1
      `, [registroId]);
      cerrado = true;
    }

    return cerrado;
  }

  module.exports = {
    validateTarjetaDisponible,
    actualizarSalida
  };