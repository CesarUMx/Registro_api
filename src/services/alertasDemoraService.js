/**
 * Servicio para verificar y enviar alertas de visitantes demorados en salir por caseta
 */
const { 
  obtenerVisitantesDemoradosSinSalirCaseta, 
  incrementarContadorAlertas, 
} = require('../models/registroModel');
const { enviarAlertaVisitantesDemorados } = require('./emailService');

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

    const visitantes = [];

    for (const registro of registrosParaAlertar) {
      visitantes.push(...registro.visitantes.map(v => v.id_visitante));
    }

    if (visitantes.length > 0) {
      await incrementarContadorAlertas(visitantes);
    } 
    
    // 3. Preparar datos para el correo (solo para los que deben recibir alertas)
    const visitantesAgrupados = registrosParaAlertar
      .filter(registro => registro.visitantes.some(v => v.contador_alertas === 0 || v.contador_alertas % 3 === 0))
      .map(registro => {
      const visitantesInfo = registro.visitantes
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

module.exports = {
  verificarYNotificarVisitantesDemorados,
  TIEMPO_DEMORA_MINUTOS
};
