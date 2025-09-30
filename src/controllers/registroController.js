const { crearRegistroYConductor, agregarVisitantesEdificio,
  crearRegistroPeatonal, buscarRegistroPorCodigo, salidaEdificio, obtenerVisitantesRegistro,
  salidaCaseta, obtenerListadoRegistrosDataTable, obtenerDetalleRegistro,
  asociarVehiculoARegistro, nombreVisitante, registrarSalidaCasetaParcial,
  cargarVisitantes, crearRegistroDesdeCodigoPersona
} = require('../models/registroModel');
const { checkRequiredFields, handleError, validateGuardType, validarCampos,
} = require('../utils/controllerHelpers');
const { getUserById, validarCodigoEmpleado, validarMatriculaAlumno } = require('../models/userManagementModel');
const { enviarAlertaVisita, enviarNotificacionSalida } = require('../services/emailService');

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
      num_marbete,
      motivo,
      tipo_no_registrado
    } = req.body;

    // Validaciones obligatorias
    checkRequiredFields(['id_vehiculo', 'id_visitante_conductor', 'tipo_conductor', 'n_visitantes', 'tag_type', 'motivo'], req.body);

    // Si tag_type es "tarjeta", n_tarjeta es obligatorio
    if (tag_type === 'tarjeta' && !n_tarjeta) {
      const error = new Error('El campo n_tarjeta es obligatorio cuando tag_type es "tarjeta"');
      error.status = 400;
      error.code = 'MISSING_TARJETA';
      throw error;
    }

    const resultado = await crearRegistroYConductor({
      vehiculo_id: id_vehiculo,
      idVisitanteConductor: id_visitante_conductor,
      tipoVisitanteConductor: tipo_conductor,
      tipoVisitanteNoRegistrado: tipo_no_registrado || null,
      nVisitantes: n_visitantes,
      idGuardiaCaseta: req.user.userId,
      tagType: tag_type,
      nTarjeta: n_tarjeta || null,
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

// Obtener los visitantes de un registro específico
async function getVisitantesByRegistroId(req, res) {
  try {
    const registroId = parseInt(req.params.id);
    if (!registroId) {
      return res.status(400).json({ ok: false, error: 'ID de registro inválido' });
    }

    const visitantes = await obtenerVisitantesRegistro(registroId);

    return res.status(200).json({
      ok: true,
      visitantes
    });
  } catch (error) {
    console.error('Error al obtener visitantes del registro:', error);
    return res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error al obtener visitantes del registro'
    });
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

          if (personaAVisitar.role !== 'otros') {
            // Enviar correo electrónico de alerta con todos los visitantes
            await enviarAlertaVisita(
              personaAVisitar.email,
              personaAVisitar.name,
              nombresVisitantes,
              edificio,
              motivo,
              resultado.code_registro || `Registro #${registroId}`
            );
          } else {
            console.log('No se envio correo a la persona a visitar');
          }
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
    validateGuardType(req.user, ['caseta']);

    const { visitantes, destino } = req.body;

    // Validar que haya visitantes
    if (!visitantes || !Array.isArray(visitantes) || visitantes.length === 0) {
      const error = new Error('Se requiere al menos un visitante');
      error.status = 400;
      throw error;
    }

    // Validar que cada visitante tenga un id_visitante
    for (const visitante of visitantes) {
      if (!visitante.id_visitante) {
        const error = new Error('Todos los visitantes deben tener un id_visitante');
        error.status = 400;
        throw error;
      }
    }

    // Validar el destino
    if (!destino || (destino !== 'edificio' && destino !== 'cafeteria' && destino !== 'alumno')) {
      const error = new Error('El destino debe ser "edificio", "cafeteria" o "alumno"');
      error.status = 400;
      throw error;
    }

    const resultado = await crearRegistroPeatonal({
      visitantes,
      idGuardiaCaseta: req.user.userId,
      destino
    });

    // No se envía correo electrónico ya que no hay persona a visitar

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
    const { visitantes, notas, salida_vehiculo = false } = req.body;

    if (!Array.isArray(visitantes) || visitantes.length === 0) {
      const error = new Error('Debes enviar al menos un visitante que salió');
      error.status = 400;
      error.code = 'VISITANTES_REQUERIDOS';
      throw error;
    }

    // Obtener los detalles del registro antes de procesar la salida
    const detalleRegistro = await obtenerDetalleRegistro(registroId);

    const resultado = await salidaEdificio(
      registroId,
      visitantes,
      notas,
      req.user.userId,
      salida_vehiculo,
    );

    // Enviar notificación de salida por correo si hay una persona a visitar
    if (detalleRegistro && detalleRegistro.id_persona_a_visitar) {
      try {
        // Obtener información de la persona visitada
        const personaVisitada = await getUserById(detalleRegistro.id_persona_a_visitar);

        if (personaVisitada && personaVisitada.email) {
          // Preparar la lista de nombres de visitantes que salieron
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

          // Enviar correo electrónico de notificación de salida
          // await enviarNotificacionSalida(
          //   personaVisitada.email,
          //   personaVisitada.name,
          //   nombresVisitantes,
          //   detalleRegistro.edificio || 'No especificado',
          //   detalleRegistro.code_registro || `Registro #${registroId}`,
          //   notas,
          //   'l edificio'
          // );
        }
      } catch (emailError) {
        // No interrumpimos el flujo principal si hay un error en el envío del correo
        console.error('Error al enviar correo de notificación de salida:', emailError);
      }
    }

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

    // Obtener los detalles del registro antes de procesar la salida
    const detalleRegistro = await obtenerDetalleRegistro(registroId);

    const resultado = await salidaCaseta(registroId, req.user.userId, notas, salieron);

    // Enviar notificación de salida por correo si hay una persona a visitar
    if (detalleRegistro && detalleRegistro.id_persona_a_visitar) {
      try {
        // Obtener información de la persona visitada
        const personaVisitada = await getUserById(detalleRegistro.id_persona_a_visitar);

        if (personaVisitada && personaVisitada.email) {
          // Obtener los visitantes del registro
          const visitantesInfo = await obtenerVisitantesRegistro(registroId);

          // Filtrar solo los visitantes que han salido completamente
          const visitantesSalieron = visitantesInfo.filter(v =>
            v.hora_salida_caseta !== null && v.estatus === 'completo'
          );

          // Preparar la lista de nombres de visitantes que salieron
          const nombresVisitantes = [];

          if (visitantesSalieron && visitantesSalieron.length > 0) {
            // Recorrer todos los visitantes y obtener sus nombres
            for (const visitante of visitantesSalieron) {
              nombresVisitantes.push(await nombreVisitante(visitante.id_visitante));
            }
          }

          // Si no se encontraron nombres, añadir un mensaje genérico
          if (nombresVisitantes.length === 0) {
            nombresVisitantes.push('Visitante no especificado');
          }

          // Enviar correo electrónico de notificación de salida
          // await enviarNotificacionSalida(
          //   personaVisitada.email,
          //   personaVisitada.name,
          //   nombresVisitantes,
          //   detalleRegistro.edificio || 'No especificado',
          //   detalleRegistro.code_registro || `Registro #${registroId}`,
          //   notas
          // );
        }
      } catch (emailError) {
        // No interrumpimos el flujo principal si hay un error en el envío del correo
        console.error('Error al enviar correo de notificación de salida:', emailError);
      }
    }

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

    let resultado;
    const codigo = code_registro.toUpperCase();

    // Determinar el tipo de código
    if (codigo.startsWith('UMX')) {
      // Es un código de registro normal
      resultado = await asociarVehiculoARegistro(codigo, id_vehiculo, req.user.userId, id_visitante, tag_type, n_tarjeta);
    } else if (/^\d+$/.test(codigo)) {
      // Es un código numérico, podría ser código de empleado o matrícula de alumno

      // Primero verificamos si es un código de empleado
      const resultadoEmpleado = await validarCodigoEmpleado(codigo);

      if (resultadoEmpleado.valido) {
        // Es un código de empleado válido
        resultado = await crearRegistroDesdeCodigoPersona({
          datosPersona: resultadoEmpleado,
          tipoPersona: 'empleado',
          vehiculoId: id_vehiculo,
          visitanteId: id_visitante,
          guardiaId: req.user.userId,
          tagType: tag_type,
          nTarjeta: n_tarjeta
        });
      } else {
        // Verificamos si es una matrícula de alumno
        const resultadoAlumno = await validarMatriculaAlumno(codigo);

        if (resultadoAlumno.valido) {
          // Es una matrícula de alumno válida
          resultado = await crearRegistroDesdeCodigoPersona({
            datosPersona: resultadoAlumno,
            tipoPersona: 'alumno',
            vehiculoId: id_vehiculo,
            visitanteId: id_visitante,
            guardiaId: req.user.userId,
            tagType: tag_type,
            nTarjeta: n_tarjeta
          });
        } else {
          // No es un código válido
          return res.status(400).json({
            ok: false,
            error: 'El código ingresado no es válido. No se encontró registro, empleado o alumno con ese código.'
          });
        }
      }
    } else {
      // No es un formato de código reconocido
      return res.status(400).json({
        ok: false,
        error: 'Formato de código no reconocido. Debe ser un código de registro (UMX...) o un código numérico.'
      });
    }

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
    // Validar que sea un guardia de caseta
    validateGuardType(req.user, ['caseta']);

    const registroId = req.params.id;
    const { visitantes, vehiculo_id, notas } = req.body;

    // Obtener los detalles del registro antes de procesar la salida
    const detalleRegistro = await obtenerDetalleRegistro(registroId);

    const resultado = await registrarSalidaCasetaParcial(
      registroId,
      visitantes,
      vehiculo_id,
      notas,
      req.user.id
    );
    console.log(resultado);

    // Enviar notificación de salida parcial por correo si hay una persona a visitar
    if (resultado.ok) {
      try {
        // Obtener información de la persona visitada
        const personaVisitada = await getUserById(detalleRegistro.id_persona_a_visitar);
        console.log(personaVisitada);

        if (personaVisitada && personaVisitada.email) {
          console.log(personaVisitada.email);
          // Preparar la lista de nombres de visitantes que salieron
          const nombresVisitantes = [];

          // Obtener los nombres de los visitantes que salieron parcialmente
          for (const visitanteId of visitantes) {
            nombresVisitantes.push(await nombreVisitante(visitanteId.id_visitante));
          }

          // Si no se encontraron nombres, añadir un mensaje genérico
          if (nombresVisitantes.length === 0) {
            nombresVisitantes.push('Visitante no especificado');
          }
          console.log(nombresVisitantes);

          // Enviar correo electrónico de notificación de salida
          // await enviarNotificacionSalida(
          //   personaVisitada.email,
          //   personaVisitada.name,
          //   nombresVisitantes,
          //   detalleRegistro.edificio || 'No especificado',
          //   detalleRegistro.code_registro || `Registro #${registroId}`,
          //   notas || 'Salida de caseta',
          //   ' la caseta'
          // );
        }
      } catch (emailError) {
        // No interrumpimos el flujo principal si hay un error en el envío del correo
        console.error('Error al enviar correo de notificación de salida parcial:', emailError);
      }
    }

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
    const { codigo } = req.params;
    const resultado = await buscarRegistroPorCodigo(codigo);

    res.status(200).json({
      ok: true,
      data: resultado
    });
  } catch (error) {
    console.error('Error en getRegistroPublico:', error);
    res.status(error.status || 500).json({
      ok: false,
      error: error.message || 'Error interno'
    });
  }
}

async function patchCargarVisitantes(req, res) {
  try {
    // Permitir temporalmente a guardias de entrada y caseta
    validateGuardType(req.user, ['caseta', 'entrada', 'supervisor']);
    // Nota: Esta es una modificación temporal para permitir que los guardias de entrada
    // también puedan cargar visitantes

    const registroId = parseInt(req.params.id);
    const { visitantes } = req.body;

    // Validar que haya visitantes
    if (!visitantes || !Array.isArray(visitantes) || visitantes.length === 0) {
      const error = new Error('Se requiere al menos un visitante');
      error.status = 400;
      throw error;
    }

    // Validar que cada visitante tenga un id_visitante
    for (const visitante of visitantes) {
      if (!visitante.id_visitante) {
        const error = new Error('Todos los visitantes deben tener un id_visitante');
        error.status = 400;
        throw error;
      }
    }

    const resultado = await cargarVisitantes(registroId, visitantes, req.user.userId);

    res.status(200).json({
      ok: true,
      ...resultado
    });
  } catch (error) {
    handleError(res, error);
  }
}



module.exports = {
  postRegistroEntradaCaseta,
  patchEntradaEdificio,
  patchSalidaEdificio,
  getRegistrosListado,
  getRegistroDetalle,
  getVisitantesByRegistroId,
  postEntradaPeatonal,
  patchAsociarVehiculo,
  patchSalidaCasetaParcial,
  getRegistroPublico,
  patchCargarVisitantes,
  getRegistroPorCodigo,
  patchSalidaCaseta
};
