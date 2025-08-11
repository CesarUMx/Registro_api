/**
 * Programador de tareas para finalizar preregistros que han pasado su hora de salida programada
 */
const cron = require('node-cron');
const pool = require('../config/db');

// Intervalo de verificación en minutos (cada 10 minutos)
const INTERVALO_VERIFICACION = 10;

// Tiempo de colchón en minutos (10 minutos después de la hora de salida programada)
const TIEMPO_COLCHON_MINUTOS = 10;

/**
 * Verifica y actualiza el estado de los preregistros que han pasado su hora de salida programada
 * @returns {Promise<Object>} Resultado de la verificación
 */
async function verificarYFinalizarPreregistros() {
  const client = await pool.connect();
  try {
    // Primero, consultamos los preregistros que han pasado su hora de salida programada
    // con un colchón de 10 minutos y que no estén ya en estado 'finalizado' o 'cancelado'
    const selectQuery = `
      SELECT id, codigo, status, scheduled_exit_time
      FROM preregistros
      WHERE scheduled_exit_time < NOW() - INTERVAL '${TIEMPO_COLCHON_MINUTOS} minutes'
      AND status NOT IN ('finalizado', 'cancelado')
    `;
    
    // Ejecutamos la consulta de selección
    const selectResult = await client.query(selectQuery);
    const preregistrosVencidos = selectResult.rows;
    
    // Si no hay preregistros vencidos, retornamos temprano
    if (preregistrosVencidos.length === 0) {
      return {
        success: true,
        count: 0,
        message: 'No se encontraron preregistros para finalizar automáticamente.'
      };
    }
    
    // Ahora actualizamos el estado de los preregistros vencidos
    const updateQuery = `
      UPDATE preregistros
      SET status = 'finalizado'
      WHERE id = ANY($1)
      RETURNING id, codigo, status, scheduled_exit_time
    `;
    
    // Extraemos los IDs de los preregistros vencidos
    const preregistroIds = preregistrosVencidos.map(p => p.id);
    
    // Ejecutamos la consulta de actualización
    const updateResult = await client.query(updateQuery, [preregistroIds]);
    
    const preregistrosFinalizados = updateResult.rows;
    
    if (preregistrosFinalizados.length > 0) {
      console.log(`Se han finalizado automáticamente ${preregistrosFinalizados.length} preregistros que pasaron su hora de salida por más de ${TIEMPO_COLCHON_MINUTOS} minutos:`);
      preregistrosFinalizados.forEach(p => {
        console.log(`- Preregistro ID: ${p.id}, Código: ${p.codigo}, Hora de salida programada: ${p.scheduled_exit_time}`);
      });
      
      return {
        success: true,
        count: preregistrosFinalizados.length,
        message: `Se han finalizado automáticamente ${preregistrosFinalizados.length} preregistros que pasaron su hora de salida por más de ${TIEMPO_COLCHON_MINUTOS} minutos.`
      };
    } else {
      return {
        success: true,
        count: 0,
        message: 'No se encontraron preregistros para finalizar automáticamente.'
      };
    }
  } catch (error) {
    console.error('Error al verificar y finalizar preregistros:', error);
    return {
      success: false,
      error: error.message,
      message: 'Error al verificar y finalizar preregistros.'
    };
  } finally {
    client.release();
  }
}

/**
 * Inicia el programador de tareas para finalizar preregistros que han pasado su hora de salida
 */
async function iniciarProgramadorFinalizarPreregistros() {
  // Ejecutamos una verificación inicial al arrancar
  try {
    const resultadoInicial = await verificarYFinalizarPreregistros();
    console.log(`Verificación inicial: ${resultadoInicial.message}`);
  } catch (error) {
    console.error('Error en la verificación inicial de preregistros a finalizar:', error);
  }

  // Programamos la tarea periódica
  // El formato de cron es: minuto hora día-mes mes día-semana
  // */10 * * * * significa "cada 10 minutos"
  cron.schedule(`*/${INTERVALO_VERIFICACION} * * * *`, async () => {
    try {
      const resultado = await verificarYFinalizarPreregistros();
      console.log(`Resultado de la verificación: ${resultado.message}`);
    } catch (error) {
      console.error('Error en la verificación programada de preregistros a finalizar:', error);
    }
  });
  
  console.log(`Programador para finalizar preregistros iniciado. Se ejecutará cada ${INTERVALO_VERIFICACION} minutos.`);
}

module.exports = {
  iniciarProgramadorFinalizarPreregistros,
  verificarYFinalizarPreregistros // Exportamos también la función para poder usarla directamente si es necesario
};
