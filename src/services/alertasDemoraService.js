/**
 * Servicio para verificar y enviar alertas de visitantes demorados en salir por caseta
 */
const { 
  obtenerVisitantesDemoradosSinSalirCaseta, 
  incrementarContadorAlertas, 
} = require('../models/registroModel');
const { enviarAlertaVisitantesDemorados, enviarAlertaPreregistroProximoExpirar } = require('./emailService');
const pool = require('../config/db');

// Correo del administrador de seguridad
const EMAIL_ADMIN_SEGURIDAD = 'cortiz@mondragonmexico.edu.mx';
const NOMBRE_ADMIN_SEGURIDAD = 'Administrador de Seguridad';

// Tiempo en minutos para considerar como demora
const TIEMPO_DEMORA_MINUTOS = 10;

/**
 * Verifica los visitantes demorados y envía alertas por correo
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function verificarYNotificarVisitantesDemorados() {
  try {
    
    // 1. Obtener los registros que deben recibir alertas 
    const registrosParaAlertar = await obtenerVisitantesDemoradosSinSalirCaseta(TIEMPO_DEMORA_MINUTOS);

    // Si no hay registros para alertar, terminar
    if (registrosParaAlertar.length === 0) {
      return { ok: true, message: 'No hay visitantes demorados que requieran alerta en este momento' };
    }
    
    // Filtrar para ignorar los registros con destino 'alumno'
    const registrosFiltrados = registrosParaAlertar.filter(registro => {
      // Si algún visitante tiene destino diferente a 'alumno', incluir el registro
      return registro.visitantes.some(v => v.destino !== 'alumno');
    });
    
    // Si después de filtrar no hay registros para alertar, terminar
    if (registrosFiltrados.length === 0) {
      return { ok: true, message: 'No hay visitantes demorados que requieran alerta después de filtrar alumnos' };
    }

    const visitantes = [];

    for (const registro of registrosFiltrados) {
      // Solo incluir visitantes que no sean alumnos
      const visitantesNoAlumnos = registro.visitantes.filter(v => v.destino !== 'alumno');
      visitantes.push(...visitantesNoAlumnos.map(v => v.id_visitante));
    }

    if (visitantes.length > 0) {
      await incrementarContadorAlertas(visitantes);
    } 
    
    // 3. Preparar datos para el correo (solo para los que deben recibir alertas)
    const visitantesAgrupados = registrosFiltrados
      .filter(registro => registro.visitantes.some(v => 
        v.destino !== 'alumno' && (v.contador_alertas === 0 || v.contador_alertas % 3 === 0)
      ))
      .map(registro => {
      const visitantesInfo = registro.visitantes
        .filter(v => v.destino !== 'alumno') // Filtrar alumnos
        .map(v => ({
          nombre: v.nombre,
          minutos: v.minutos_desde_salida
        }));

      return {
        edificio: registro.edificio,
        codigo: registro.code_registro,
        visitantes: visitantesInfo
      };
    });
    
    // 4. Enviar correo de alerta para cada registro
    for (const registro of visitantesAgrupados) {
      
      await enviarAlertaVisitantesDemorados(
        EMAIL_ADMIN_SEGURIDAD,
        NOMBRE_ADMIN_SEGURIDAD,
        registro.visitantes,
        registro.edificio,
        registro.codigo,
      );
      
      console.log(`Se envió alerta por correo para registro código: ${registro.codigo}`);
    }
    
    // console.log(`Se enviaron alertas por correo para ${registrosParaAlertar.length} registros en total`);
    
    return { 
      ok: true, 
      message: `Se enviaron alertas para ${visitantesAgrupados.length} registros con visitantes demorados` 
    };
  } catch (error) {
    console.error('Error al verificar visitantes demorados:', error);
    return {
      ok: false,
      error: error.message || 'Error al verificar visitantes demorados'
    };
  }
}

// Tiempo en minutos para alertar antes de la expiración del preregistro
const TIEMPO_ALERTA_EXPIRACION_MINUTOS = 15;

/**
 * Verifica los preregistros próximos a expirar y envía alertas a sus creadores
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function verificarYNotificarPreregistrosProximosExpirar() {
  try {
    // Consulta para obtener preregistros que están a punto de expirar (15 minutos antes)
    const query = `
      SELECT p.id, p.codigo, p.reason, p.scheduled_exit_time, p.status,
             u.email as admin_email, u.name as admin_name
      FROM preregistros p
      JOIN users u ON p.admin_id = u.id
      WHERE p.status IN ('pendiente', 'iniciado')
      AND p.scheduled_exit_time BETWEEN 
          NOW() + INTERVAL '${TIEMPO_ALERTA_EXPIRACION_MINUTOS - 1} minutes' 
          AND NOW() + INTERVAL '${TIEMPO_ALERTA_EXPIRACION_MINUTOS + 1} minutes'
    `;
    
    const result = await pool.query(query);
    const preregistrosProximosExpirar = result.rows;
    
    if (preregistrosProximosExpirar.length === 0) {
      return { 
        ok: true, 
        message: 'No hay preregistros próximos a expirar que requieran alerta en este momento' 
      };
    }
    
    // Enviar alertas para cada preregistro próximo a expirar
    for (const preregistro of preregistrosProximosExpirar) {
      // Validar que el correo tenga un formato válido
      const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
      
      if (!preregistro.admin_email || !emailRegex.test(preregistro.admin_email)) {
        console.error(`Error: Correo inválido para el preregistro ${preregistro.codigo}: '${preregistro.admin_email}'`);
        continue; // Saltar este preregistro y continuar con el siguiente
      }
      
      try {
        await enviarAlertaPreregistroProximoExpirar(
          preregistro.admin_email,
          preregistro.admin_name || 'Administrador',
          preregistro.codigo,
          preregistro.reason,
          preregistro.scheduled_exit_time
        );
        
        console.log(`Se envió alerta de expiración próxima para preregistro código: ${preregistro.codigo}`);
      } catch (emailError) {
        console.error(`Error al enviar alerta para preregistro ${preregistro.codigo}:`, emailError);
      }
    }
    
    return { 
      ok: true, 
      message: `Se enviaron alertas para ${preregistrosProximosExpirar.length} preregistros próximos a expirar` 
    };
  } catch (error) {
    console.error('Error al verificar preregistros próximos a expirar:', error);
    return {
      ok: false,
      error: error.message || 'Error al verificar preregistros próximos a expirar'
    };
  }
}

module.exports = {
  verificarYNotificarVisitantesDemorados,
  verificarYNotificarPreregistrosProximosExpirar,
  TIEMPO_DEMORA_MINUTOS,
  TIEMPO_ALERTA_EXPIRACION_MINUTOS
};
