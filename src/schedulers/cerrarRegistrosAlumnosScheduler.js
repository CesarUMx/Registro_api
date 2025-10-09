/**
 * Programador de tareas para cerrar automáticamente los registros de alumnos a las 10 PM
 */
const cron = require('node-cron');
const pool = require('../config/db');
const { withTransaction } = require('../utils/controllerHelpers');

/**
 * Cierra automáticamente todos los registros de alumnos que siguen abiertos
 * @returns {Promise<Object>} Resultado de la operación
 */
async function cerrarRegistrosAlumnos() {
  try {
    const result = await withTransaction(async (client) => {
      // 1. Obtener todos los registros de alumnos que siguen abiertos
      const selectQuery = `
        SELECT r.id, r.code_registro
        FROM registro r
        WHERE r.estatus = 'iniciado'
        AND r.hora_salida_caseta IS NULL
        AND r.tipo_r = 'no_registrado'
      `;
      
      const { rows: registrosAbiertos } = await client.query(selectQuery);
      
      if (registrosAbiertos.length === 0) {
        return {
          success: true,
          count: 0,
          message: 'No hay registros de alumnos abiertos para cerrar'
        };
      }
      
      // 2. Cerrar los registros de alumnos
      const registroIds = registrosAbiertos.map(r => r.id);
      
      // Actualizar la tabla registro_visitantes
      const updateVisitantesQuery = `
        UPDATE registro_visitantes
        SET hora_salida_caseta = NOW(),
            estatus = 'completo'
        WHERE registro_id = ANY($1)
        AND hora_salida_caseta IS NULL
        RETURNING registro_id
      `;
      
      const visitantesResult = await client.query(updateVisitantesQuery, [registroIds]);
      
      // Actualizar la tabla registro
      const updateRegistroQuery = `
        UPDATE registro
        SET hora_salida_caseta = NOW(),
            n_salieron = n_visitantes,
            estatus = 'completo',
            notas = COALESCE(notas, '') || ' (Cerrado automáticamente a las 10 PM)'
        WHERE id = ANY($1)
        AND hora_salida_caseta IS NULL
        RETURNING id, code_registro
      `;
      
      const registroResult = await client.query(updateRegistroQuery, [registroIds]);
      
      return {
        success: true,
        count: registroResult.rows.length,
        message: `Se han cerrado automáticamente ${registroResult.rows.length} registros de alumnos`,
        registros: registroResult.rows
      };
    });
    
    return result;
  } catch (error) {
    console.error('Error al cerrar registros de alumnos:', error);
    return {
      success: false,
      error: error.message,
      message: 'Error al cerrar registros de alumnos'
    };
  }
}

/**
 * Inicia el programador de tareas para cerrar registros de alumnos a las 10 PM
 */
async function iniciarProgramadorCerrarRegistrosAlumnos() {
  // Programar la tarea para que se ejecute todos los días a las 10 PM
  // El formato de cron es: minuto hora día-mes mes día-semana
  // 0 19 * * * significa "a las 7:00 PM todos los días"
  cron.schedule('0 22 * * *', async () => {
    try {
      const resultado = await cerrarRegistrosAlumnos();
      console.log(`Resultado del cierre automático de registros de alumnos: ${resultado.message}`);
      
      if (resultado.registros && resultado.registros.length > 0) {
        console.log('Registros cerrados:');
        resultado.registros.forEach(r => {
          console.log(`- ID: ${r.id}, Código: ${r.code_registro}`);
        });
      }
    } catch (error) {
      console.error('Error en el programador de cierre de registros de alumnos:', error);
    }
  });
  
  console.log('Programador para cerrar registros de alumnos iniciado. Se ejecutará todos los días a las 10 PM.');
}

module.exports = {
  iniciarProgramadorCerrarRegistrosAlumnos,
  cerrarRegistrosAlumnos // Exportamos la función para poder usarla directamente si es necesario
};
