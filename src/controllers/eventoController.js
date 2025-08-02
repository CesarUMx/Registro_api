const { handleError } = require('../utils/controllerHelpers');
const preregistroModel = require('../models/preregistroModel');
const bitacoraModel = require('../models/bitacoraModel');
const { generateVisitorTag } = require('../utils/codeGenerator');

/**
 * Determina el siguiente evento que debe registrarse para un visitante o vehículo
 * según su estatus actual y el tipo de guardia que realiza la consulta
 */
const getSiguienteEvento = async (req, res) => {
  try {
    const { tipo, id } = req.params;
    const { role } = req.user; // Tipo de guardia desde el token JWT

    // Validar tipo
    if (!['visitantes', 'vehiculos', 'registros'].includes(tipo)) {
      return res.status(400).json({
        ok: false,
        message: 'Tipo no válido. Debe ser visitantes, vehiculos o registros'
      });
    }

    // Obtener el estatus actual del visitante o vehículo
    let estatusActual;
    let entidad;
    let preregistroId;

    if (tipo === 'visitantes') {
      // Buscar el visitante en preregistro_visitantes
      const visitante = await preregistroModel.getVisitanteById(id);
      if (!visitante) {
        return res.status(404).json({
          ok: false,
          message: 'Visitante no encontrado'
        });
      }
      entidad = visitante;
      preregistroId = visitante.preregistro_id;
      
      // Obtener el último evento de la bitácora para este visitante
      const ultimoEvento = await bitacoraModel.getUltimoEventoVisitante(id);
      estatusActual = ultimoEvento ? ultimoEvento.tipo_evento : null;
    } else if (tipo === 'vehiculos') {
      // Buscar el vehículo en preregistro_vehiculos
      const vehiculo = await preregistroModel.getVehiculoById(id);
      if (!vehiculo) {
        return res.status(404).json({
          ok: false,
          message: 'Vehículo no encontrado'
        });
      }
      entidad = vehiculo;
      preregistroId = vehiculo.preregistro_id;
      
      // Obtener el último evento de la bitácora para este vehículo
      const ultimoEvento = await bitacoraModel.getUltimoEventoVehiculo(id);
      estatusActual = ultimoEvento ? ultimoEvento.tipo_evento : null;
    } else {
      // Buscar el registro
      const registro = await preregistroModel.getPreregistroById(id);
      if (!registro) {
        return res.status(404).json({
          ok: false,
          message: 'Registro no encontrado'
        });
      }
      entidad = registro;
      preregistroId = registro.id;
      estatusActual = registro.estatus;
    }

    // Determinar el siguiente evento según el estatus actual y el tipo de guardia
    let siguienteEvento;

    // Guardia de edificio (entrada_edificio)
    if (role === 'guardia_edificio') {
      if (estatusActual === 'entrada_caseta') {
        siguienteEvento = {
          tipo: 'entrada_edificio',
          nombre: 'Entrada al Edificio',
          descripcion: 'Registrar entrada al edificio'
        };
      } else if (estatusActual === 'entrada_edificio') {
        siguienteEvento = {
          tipo: 'salida_edificio',
          nombre: 'Salida del Edificio',
          descripcion: 'Registrar salida del edificio'
        };
      } else {
        return res.status(400).json({
          ok: false,
          message: `No se puede determinar el siguiente evento para el estatus "${estatusActual}" con guardia de edificio`
        });
      }
    } 
    // Guardia de caseta
    else if (role === 'guardia_caseta') {
      if (!estatusActual || estatusActual === 'creacion') {
        siguienteEvento = {
          tipo: 'entrada_caseta',
          nombre: 'Entrada a Caseta',
          descripcion: 'Registrar entrada por caseta'
        };
      } else if (estatusActual === 'salida_edificio' || estatusActual === 'entrada_caseta') {
        siguienteEvento = {
          tipo: 'salida_caseta',
          nombre: 'Salida de Caseta',
          descripcion: 'Registrar salida por caseta'
        };
      } else if (estatusActual === 'salida_caseta') {
        siguienteEvento = {
          tipo: 'entrada_caseta',
          nombre: 'Entrada a Caseta',
          descripcion: 'Registrar nueva entrada por caseta'
        };
      } else {
        return res.status(400).json({
          ok: false,
          message: `No se puede determinar el siguiente evento para el estatus "${estatusActual}" con guardia de caseta`
        });
      }
    }
    // Supervisor (puede hacer cualquier acción)
    else if (role === 'supervisor' || role === 'admin') {
      // Determinar todas las opciones disponibles según el estatus actual
      const opciones = [];
      
      if (!estatusActual || estatusActual === 'creacion' || estatusActual === 'salida_caseta') {
        opciones.push({
          tipo: 'entrada_caseta',
          nombre: 'Entrada a Caseta',
          descripcion: 'Registrar entrada por caseta'
        });
      }
      
      if (estatusActual === 'entrada_caseta' || estatusActual === 'salida_edificio') {
        opciones.push({
          tipo: 'entrada_edificio',
          nombre: 'Entrada al Edificio',
          descripcion: 'Registrar entrada al edificio'
        });
        
        opciones.push({
          tipo: 'salida_caseta',
          nombre: 'Salida de Caseta',
          descripcion: 'Registrar salida por caseta'
        });
      }
      
      if (estatusActual === 'entrada_edificio') {
        opciones.push({
          tipo: 'salida_edificio',
          nombre: 'Salida del Edificio',
          descripcion: 'Registrar salida del edificio'
        });
      }
      
      // Si hay opciones, devolver la primera como sugerencia
      if (opciones.length > 0) {
        siguienteEvento = opciones[0];
        // Incluir todas las opciones para que el frontend pueda mostrarlas
        siguienteEvento.opciones = opciones;
      } else {
        return res.status(400).json({
          ok: false,
          message: `No se puede determinar el siguiente evento para el estatus "${estatusActual}"`
        });
      }
    } else {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para realizar esta acción'
      });
    }

    // Devolver el siguiente evento
    return res.status(200).json({
      ok: true,
      evento: siguienteEvento,
      entidad
    });
  } catch (error) {
    return handleError(res, error);
  }
};

/**
 * Registra un evento en la bitácora para un visitante o vehículo
 */
const registrarEvento = async (req, res) => {
  try {
    const { tipo, id, evento } = req.body;
    const { userId, role } = req.user;

    // Validar tipo
    if (!['visitantes', 'vehiculos', 'registros'].includes(tipo)) {
      return res.status(400).json({
        ok: false,
        message: 'Tipo no válido. Debe ser visitantes, vehiculos o registros'
      });
    }

    // Validar evento
    if (!['entrada_caseta', 'salida_caseta', 'entrada_edificio', 'salida_edificio'].includes(evento)) {
      return res.status(400).json({
        ok: false,
        message: 'Evento no válido'
      });
    }

    // Obtener el preregistro asociado
    let preregistroId;
    let visitanteId = null;
    let vehiculoId = null;

    if (tipo === 'visitantes') {
      const visitante = await preregistroModel.getVisitanteById(id);
      if (!visitante) {
        return res.status(404).json({
          ok: false,
          message: 'Visitante no encontrado'
        });
      }
      preregistroId = visitante.preregistro_id;
      visitanteId = id;
    } else if (tipo === 'vehiculos') {
      const vehiculo = await preregistroModel.getVehiculoById(id);
      if (!vehiculo) {
        return res.status(404).json({
          ok: false,
          message: 'Vehículo no encontrado'
        });
      }
      preregistroId = vehiculo.preregistro_id;
      vehiculoId = id;
    } else {
      // Es un registro completo
      const preregistro = await preregistroModel.getPreregistroById(id);
      if (!preregistro) {
        return res.status(404).json({
          ok: false,
          message: 'Registro no encontrado'
        });
      }
      preregistroId = id;
    }

    // Verificar permisos según el tipo de evento y el rol del usuario
    if (
      (evento === 'entrada_edificio' || evento === 'salida_edificio') && 
      role !== 'guardia_edificio' && 
      role !== 'supervisor' && 
      role !== 'admin'
    ) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para registrar eventos de edificio'
      });
    }

    if (
      (evento === 'entrada_caseta' || evento === 'salida_caseta') && 
      role !== 'guardia_caseta' && 
      role !== 'supervisor' && 
      role !== 'admin'
    ) {
      return res.status(403).json({
        ok: false,
        message: 'No tiene permisos para registrar eventos de caseta'
      });
    }

    // Si es un registro completo, actualizar todos los visitantes y vehículos asociados
    if (tipo === 'registros') {
      // Obtener todos los visitantes y vehículos del preregistro
      const preregistro = await preregistroModel.getPreregistroById(preregistroId);
      
      // Actualizar el estatus del preregistro
      await preregistroModel.updatePreregistroStatus(preregistroId, evento);
      
      // Registrar evento para cada visitante
      if (preregistro.visitantes && preregistro.visitantes.length > 0) {
        for (const visitante of preregistro.visitantes) {
          await bitacoraModel.crearRegistroBitacora({
            preregistro_id: preregistroId,
            visitante_id: visitante.visitante_id,
            vehiculo_id: null,
            tipo_evento: evento,
            usuario_id: userId,
            detalles: `Evento registrado por ${role}`
          });
        }
      }
      
      // Registrar evento para cada vehículo
      if (preregistro.vehiculos && preregistro.vehiculos.length > 0) {
        for (const vehiculo of preregistro.vehiculos) {
          await bitacoraModel.crearRegistroBitacora({
            preregistro_id: preregistroId,
            visitante_id: null,
            vehiculo_id: vehiculo.vehiculo_id,
            tipo_evento: evento,
            usuario_id: userId,
            detalles: `Evento registrado por ${role}`
          });
        }
      }
    } else {
      // Registrar evento solo para el visitante o vehículo específico
      await bitacoraModel.crearRegistroBitacora({
        preregistro_id: preregistroId,
        visitante_id: visitanteId,
        vehiculo_id: vehiculoId,
        tipo_evento: evento,
        usuario_id: userId,
        detalles: `Evento registrado por ${role}`
      });
      
      // Actualizar el estatus del preregistro si es necesario
      await preregistroModel.updatePreregistroStatus(preregistroId, evento);
    }

    // Obtener los datos actualizados
    const preregistroActualizado = await preregistroModel.getPreregistroById(preregistroId);

    return res.status(200).json({
      ok: true,
      message: `Evento ${evento} registrado exitosamente`,
      data: preregistroActualizado
    });
  } catch (error) {
    return handleError(res, error);
  }
};

module.exports = {
  getSiguienteEvento,
  registrarEvento
};
