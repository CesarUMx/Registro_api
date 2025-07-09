const { crearRegistroYConductor, agregarVisitantesEdificio,
  crearRegistroPeatonal, buscarRegistroPorCodigo, salidaEdificio,
  salidaCaseta, obtenerListadoRegistrosDataTable, obtenerDetalleRegistro,
  asociarVehiculoARegistro, nombreVisitante, registrarSalidaCasetaParcial
} = require('../models/registroModel');
const { checkRequiredFields, handleError, validateGuardType, validarCampos,
} = require('../utils/controllerHelpers');
const { getUserById } = require('../models/userManagementModel');
const { enviarAlertaVisita } = require('../services/emailService');

async function postRegistroEntradaCaseta(req, res) {
  try {
    // Verificamos que sea guardia de tipo caseta
    validateGuardType(req.user, ['caseta']);

    const {
      id_vehiculo,
      id_visitante_conductor,
      tipo_conductor,
      n_visitantes,
      tag_type,
      n_tarjeta,
      id_preregistro,
      num_marbete,
      motivo
    } = req.body;

    // Validaciones obligatorias
    checkRequiredFields(['id_vehiculo', 'id_visitante_conductor', 'tipo_conductor', 'n_visitantes', 'tag_type', 'num_marbete', 'motivo'], req.body);

    // Si tag_type es "tarjeta", n_tarjeta es obligatorio
    if (tag_type === 'tarjeta' && !n_tarjeta) {
      const error = new Error('El campo n_tarjeta es obligatorio cuando tag_type es "tarjeta"');
      error.status = 400;
      error.code = 'MISSING_TARJETA';
      throw error;
    }
    console.log("id_vehiculo", id_vehiculo);

    const resultado = await crearRegistroYConductor({
      vehiculo_id: id_vehiculo,
      idVisitanteConductor: id_visitante_conductor,
      tipoVisitanteConductor: tipo_conductor,
      nVisitantes: n_visitantes,
      idGuardiaCaseta: req.user.userId,
      tagType: tag_type,
      nTarjeta: n_tarjeta || null,
      idPreregistro: id_preregistro || null,
      numMarbete: num_marbete,
      motivo: motivo
    });

    res.status(201).json({
      ok: true,
      message: 'Registro creado exitosamente',
      ...resultado
    });
  } catch (error) {
    handleError(res, error);
  }
}

async function patchEntradaEdificio(req, res) {
  try {
    // Validar que sea guardia de tipo 'entrada'
    validateGuardType(req.user, ['entrada']);

    const registroId = parseInt(req.params.id);
    const { visitantes, edificio, motivo } = req.body;

    const idPersonaVisitar = parseInt(req.body.id_persona_a_visitar);

    await validarCampos(edificio, idPersonaVisitar, motivo, visitantes);

    const resultado = await agregarVisitantesEdificio(registroId, visitantes, req.user.userId, edificio, idPersonaVisitar, motivo);

    // Enviar correo electrónico a la persona a visitar si existe
    if (idPersonaVisitar) {
      try {
        // Obtener información de la persona a visitar
        const personaAVisitar = await getUserById(idPersonaVisitar);

        if (personaAVisitar && personaAVisitar.email) {
          // Preparar la lista de nombres de visitantes
          const nombresVisitantes = [];

          if (visitantes && visitantes.length > 0) {
            // Recorrer todos los visitantes y obtener sus nombres
            for (const visitante of visitantes) {
              nombresVisitantes.push(await nombreVisitante(visitante.id_visitante));
            }
          }

          // Si no se encontraron nombres, añadir un mensaje genérico
          if (nombresVisitantes.length === 0) {
            nombresVisitantes.push('Visitante no especificado');
          }

          // Enviar correo electrónico de alerta con todos los visitantes
          await enviarAlertaVisita(
            personaAVisitar.email,
            personaAVisitar.name,
            nombresVisitantes,
            edificio,
            motivo,
            resultado.code_registro || `Registro #${registroId}`
          );

          console.log(`Correo de alerta enviado a ${personaAVisitar.email} con ${nombresVisitantes.length} visitantes`);
        }
      } catch (emailError) {
        // No interrumpimos el flujo principal si hay un error en el envío del correo
        console.error('Error al enviar correo de alerta:', emailError);
      }
    }

    res.status(200).json({
      ok: true,
      ...resultado
    });
  } catch (error) {
    handleError(res, error);
  }
}

async function postEntradaPeatonal(req, res) {
  try {
    validateGuardType(req.user, ['entrada']);

    const { visitantes, edificio, motivo } = req.body;
    const idPersonaVisitar = parseInt(req.body.id_persona_a_visitar);

    await validarCampos(edificio, idPersonaVisitar, motivo, visitantes);

    const resultado = await crearRegistroPeatonal({
      visitantes,
      edificio,
      motivo,
      idPersonaVisitar: idPersonaVisitar || null,
      idGuardiaEntrada: req.user.userId
    });

    // Enviar correo electrónico a la persona a visitar si existe
    if (idPersonaVisitar) {
      try {
        // Obtener información de la persona a visitar
        const personaAVisitar = await getUserById(idPersonaVisitar);

        if (personaAVisitar && personaAVisitar.email) {
          // Preparar la lista de nombres de visitantes
          const nombresVisitantes = [];

          if (visitantes && visitantes.length > 0) {
            // Recorrer todos los visitantes y obtener sus nombres
            for (const visitante of visitantes) {
              nombresVisitantes.push(await nombreVisitante(visitante.id_visitante));
            }
          }

          // Si no se encontraron nombres, añadir un mensaje genérico
          if (nombresVisitantes.length === 0) {
            nombresVisitantes.push('Visitante no especificado');
          }

          // Enviar correo electrónico de alerta con todos los visitantes
          await enviarAlertaVisita(
            personaAVisitar.email,
            personaAVisitar.name,
            nombresVisitantes,
            edificio,
            motivo,
            resultado.code_registro
          );

          console.log(`Correo de alerta enviado a ${personaAVisitar.email} con ${nombresVisitantes.length} visitantes`);
        }
      } catch (emailError) {
        // No interrumpimos el flujo principal si hay un error en el envío del correo
        console.error('Error al enviar correo de alerta:', emailError);
      }
    }

    res.status(201).json({
      ok: true,
      message: 'Registro peatonal creado exitosamente',
      ...resultado
    });
  } catch (error) {
    handleError(res, error);
  }
}

async function getRegistroPorCodigo(req, res) {
  try {
    const { code_registro } = req.params;

    if (!code_registro) {
      const error = new Error('Se requiere un código de registro');
      error.status = 400;
      error.code = 'CODIGO_REQUERIDO';
      throw error;
    }

    const data = await buscarRegistroPorCodigo(code_registro);
    res.status(200).json({ ok: true, ...data });

  } catch (error) {
    handleError(res, error);
  }
}

async function patchSalidaEdificio(req, res) {
  try {
    validateGuardType(req.user, ['entrada']);

    const registroId = parseInt(req.params.id);
    const { visitantes, notas, salida_vehiculo = false, completo = false } = req.body;

    if (!Array.isArray(visitantes) || visitantes.length === 0) {
      const error = new Error('Debes enviar al menos un visitante que salió');
      error.status = 400;
      error.code = 'VISITANTES_REQUERIDOS';
      throw error;
    }

    const resultado = await salidaEdificio(
      registroId,
      visitantes,
      notas,
      req.user.userId,
      salida_vehiculo,
      completo
    );

    res.status(200).json({
      ok: true,
      message: resultado.message,
      estatus: resultado.estatus
    });
  } catch (error) {
    handleError(res, error);
  }
}

async function patchSalidaCaseta(req, res) {
  try {
    validateGuardType(req.user, ['caseta']);

    const registroId = parseInt(req.params.id);
    let notas = req.body.notas || '';
    // Asegurar que salieron sea un número
    const salieron = parseInt(req.body.salieron) || 0;

    // CONVERTIR NOTAS A STRING
    notas = notas.toString();

    if (isNaN(registroId)) {
      const error = new Error('ID de registro inválido');
      error.status = 400;
      throw error;
    }

    console.log("salieronC", salieron);
    const resultado = await salidaCaseta(registroId, req.user.userId, notas, salieron);

    res.status(200).json({
      ok: true,
      mensaje: 'Salida por caseta registrada correctamente',
      ...resultado
    });
  } catch (error) {
    handleError(res, error);
  }
}

async function getRegistrosListado(req, res) {
  try {
    const draw = parseInt(req.body.draw || req.query.draw || 0);
    const start = parseInt(req.body.start || req.query.start || 0);
    const length = parseInt(req.body.length || req.query.length || 10);

    // Buscador general (solo en code_registro)
    const search = req.body.search?.value || req.query.search?.value || '';

    // Filtros específicos
    const filtros = {
      estatus: req.body.estatus || req.query.estatus,
      tipo_r: req.body.tipo_r || req.query.tipo_r,
      edificio: req.body.edificio || req.query.edificio
    };

    const resultado = await obtenerListadoRegistrosDataTable({
      start,
      length,
      search,
      filtros
    });

    res.status(200).json({
      draw,
      recordsTotal: resultado.recordsTotal,
      recordsFiltered: resultado.recordsFiltered,
      data: resultado.data
    });
  } catch (error) {
    console.error('Error en getRegistrosListado:', error);
    res.status(500).json({ ok: false, error: 'Error al obtener registros' });
  }
}

async function getRegistroDetalle(req, res) {
  try {
    const { id } = req.params;
    const resultado = await obtenerDetalleRegistro(id);

    res.status(200).json({
      ok: true,
      data: resultado // ya incluye visitantes y vehiculos como arrays
    });
  } catch (error) {
    console.error('Error en getRegistroDetalle:', error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error interno'
    });
  }
}

async function patchAsociarVehiculo(req, res) {
  try {
    const { code_registro, id_vehiculo, id_visitante, tag_type, n_tarjeta = null } = req.body;

    if (!code_registro || !id_vehiculo || !id_visitante || !tag_type) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan datos necesarios para vincular vehículo'
      });
    }

    const resultado = await asociarVehiculoARegistro(code_registro, id_vehiculo, req.user.userId, id_visitante, tag_type, n_tarjeta);

    res.status(200).json({ 
      ok: true, 
      message: 'Vehículo asociado exitosamente',
      ...resultado 
    });

  } catch (error) {
    console.error('Error en patchAsociarVehiculo:', error);
    handleError(res, error);
  }
}

async function patchSalidaCasetaParcial(req, res) {
  try {
    const registroId = req.params.id;
    const { visitantes, vehiculo_id, notas } = req.body;

    const resultado = await registrarSalidaCasetaParcial(
      registroId,
      visitantes,
      vehiculo_id,
      notas,
      req.user.id
    );

    res.status(200).json({
      ok: true,
      ...resultado
    });
  } catch (error) {
    console.error('Error en patchSalidaCasetaParcial:', error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error interno'
    });
  }
}

// Función para obtener detalles de un registro públicamente por código
async function getRegistroPublico(req, res) {
  try {
    const { id } = req.params;
    const resultado = await obtenerDetalleRegistro(id);

    res.status(200).json({
      ok: true,
      data: resultado // misma estructura pública
    });
  } catch (error) {
    console.error('Error en getRegistroPublico:', error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error interno'
    });
  }
}

module.exports = {
  postRegistroEntradaCaseta,
  patchEntradaEdificio,
  postEntradaPeatonal,
  getRegistroPorCodigo,
  patchSalidaEdificio,
  patchSalidaCaseta,
  getRegistrosListado,
  getRegistroDetalle,
  patchAsociarVehiculo,
  getRegistroPublico,
  patchSalidaCasetaParcial
};
