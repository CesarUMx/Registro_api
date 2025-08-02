/**
 * Programador de tareas para verificar visitantes demorados en salir por caseta
 */
const cron = require('node-cron');
const { verificarYNotificarVisitantesDemorados, TIEMPO_DEMORA_MINUTOS } = require('../services/alertasDemoraService');

// Intervalo de verificación en minutos (cada 5 minutos)
const INTERVALO_VERIFICACION = 5;

/**
 * Inicia el programador de tareas para verificar visitantes demorados
 */
async function iniciarProgramadorAlertasDemora() {
  // Ahora programamos la tarea periódica
  // El formato de cron es: minuto hora día-mes mes día-semana
  // */5 * * * * significa "cada 5 minutos"
  cron.schedule(`*/${INTERVALO_VERIFICACION} * * * *`, async () => {
    try {
      const resultado = await verificarYNotificarVisitantesDemorados();
      console.log(`Resultado de la verificación: ${resultado.message}`);
    } catch (error) {
      console.error('Error en la verificación programada de visitantes demorados:', error);
    }
  });
}

module.exports = {
  iniciarProgramadorAlertasDemora
};
