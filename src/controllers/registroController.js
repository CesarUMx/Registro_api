const { crearRegistroYConductor, agregarVisitantesEdificio,
  crearRegistroPeatonal, buscarRegistroPorCodigo, salidaEdificio,
  salidaCaseta, obtenerListadoRegistrosDataTable, obtenerDetalleRegistro,
  asociarVehiculoARegistro, nombreVisitante
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
      id_preregistro
    } = req.body;

    // Validaciones obligatorias
    checkRequiredFields(['id_visitante_conductor', 'tipo_conductor', 'n_visitantes', 'tag_type'], req.body);

    // Si tag_type es "tarjeta", n_tarjeta es obligatorio
    if (tag_type === 'tarjeta' && !n_tarjeta) {
      const error = new Error('El campo n_tarjeta es obligatorio cuando tag_type es "tarjeta"');
      error.status = 400;
      error.code = 'MISSING_TARJETA';
      throw error;
    }

    const resultado = await crearRegistroYConductor({
      idVehiculo: id_vehiculo || null,
      idVisitanteConductor: id_visitante_conductor,
      tipoVisitanteConductor: tipo_conductor,
      nVisitantes: n_visitantes,
      idGuardiaCaseta: req.user.userId,
      tagType: tag_type,
      nTarjeta: n_tarjeta || null,
      idPreregistro: id_preregistro || null
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

    validarCampos(edificio, idPersonaVisitar, motivo, visitantes);

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

    validarCampos(edificio, idPersonaVisitar, motivo, visitantes);

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
            resultado.code_registro || `Registro #${registroId}`
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
    const { cantidad, notas, salida_vehiculo } = req.body;

    if (!cantidad || isNaN(cantidad)) {
      const error = new Error('Se requiere el número de personas que entregaron etiqueta/tarjeta');
      error.status = 400;
      error.code = 'CANTIDAD_REQUERIDA';
      throw error;
    }

    const resultado = await salidaEdificio(registroId, cantidad, notas, req.user.userId, salida_vehiculo);

    res.status(200).json({
      ok: true,
      message: 'Salida del edificio registrada correctamente',
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
      mensaje: 'Salida por caseta registrada correctamente'
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
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ ok: false, error: 'ID inválido' });
    }

    const resultado = await obtenerDetalleRegistro(id);
    if (!resultado) {
      return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    }

    res.status(200).json({
      ok: true,
      data: resultado
    });
  } catch (error) {
    console.error('Error en getRegistroDetalle:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
}

async function patchAsociarVehiculo(req, res) {
  try {
    const { code_registro, id_vehiculo, id_visitante } = req.body;

    if (!code_registro || !id_vehiculo || !id_visitante) {
      return res.status(400).json({
        ok: false,
        error: 'Faltan datos necesarios para vincular vehículo'
      });
    }

    const resultado = await asociarVehiculoARegistro(code_registro, id_vehiculo, id_visitante);

    res.status(200).json({ ok: true, ...resultado });

  } catch (error) {
    console.error('Error en patchAsociarVehiculo:', error);
    handleError(res, error);
  }
}


// Función para obtener detalles de un registro públicamente por código
async function getRegistroPublico(req, res) {
  try {
    const codigo = req.params.codigo;
    if (!codigo) {
      return res.status(400).json({ ok: false, error: 'Código inválido' });
    }

    // Buscar el registro por código
    const registro = await buscarRegistroPorCodigo(codigo);
    if (!registro) {
      return res.status(404).json({ ok: false, error: 'Registro no encontrado' });
    }

    // Si el registro existe, obtener los detalles completos
    const resultado = await obtenerDetalleRegistro(registro.id);
    if (!resultado) {
      return res.status(404).json({ ok: false, error: 'Detalles del registro no encontrados' });
    }

    // Devolver solo la información necesaria para la vista pública
    res.status(200).json({
      ok: true,
      data: resultado
    });
  } catch (error) {
    console.error('Error en getRegistroPublico:', error);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
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
  getRegistroPublico
};
