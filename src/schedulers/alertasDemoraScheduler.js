/**
 * Programador de tareas para verificar visitantes demorados en salir por caseta
 * y preregistros próximos a expirar
 */
const cron = require('node-cron');
const { 
  verificarYNotificarVisitantesDemorados, 
  verificarYNotificarPreregistrosProximosExpirar,
  TIEMPO_DEMORA_MINUTOS,
  TIEMPO_ALERTA_EXPIRACION_MINUTOS 
} = require('../services/alertasDemoraService');

// Intervalo de verificación en minutos (cada 5 minutos)
const INTERVALO_VERIFICACION = 5;

/**
 * Inicia el programador de tareas para verificar visitantes demorados y preregistros próximos a expirar
 */
async function iniciarProgramadorAlertasDemora() {
  // Ahora programamos la tarea periódica
  // El formato de cron es: minuto hora día-mes mes día-semana
  // */5 * * * * significa "cada 5 minutos"
  cron.schedule(`*/${INTERVALO_VERIFICACION} * * * *`, async () => {
    try {
      // Verificar visitantes demorados
      const resultadoVisitantes = await verificarYNotificarVisitantesDemorados();
      console.log(`Resultado de la verificación de visitantes demorados: ${resultadoVisitantes.message}`);
      
      // Verificar preregistros próximos a expirar
      const resultadoPreregistros = await verificarYNotificarPreregistrosProximosExpirar();
      console.log(`Resultado de la verificación de preregistros próximos a expirar: ${resultadoPreregistros.message}`);
    } catch (error) {
      console.error('Error en la verificación programada:', error);
    }
  });
}

module.exports = {
  iniciarProgramadorAlertasDemora
};
