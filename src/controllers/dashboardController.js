const pool = require('../config/db');
const { withTransaction } = require('../utils/controllerHelpers');

// Obtener todas las estadísticas del dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    
    // Obtener estadísticas generales
    const statsQuery = `
      SELECT 
        COUNT(*) FILTER (WHERE r.estatus IN ('en_caseta', 'en_edificio')) as visitantes_activos,
        COUNT(*) FILTER (WHERE DATE(r.fecha_create) = CURRENT_DATE) as visitas_hoy,
        COUNT(*) FILTER (WHERE r.estatus = 'completo' AND DATE(r.fecha_create) = CURRENT_DATE) as visitas_completadas_hoy,
        COUNT(DISTINCT rv.id_visitante) FILTER (WHERE DATE(r.fecha_create) >= CURRENT_DATE - INTERVAL '7 days') as visitantes_semana
      FROM registro r
      LEFT JOIN registro_visitantes rv ON r.id = rv.registro_id
    `;
    
    const statsResult = await pool.query(statsQuery);
    const stats = statsResult.rows[0];
    
    // Obtener actividad reciente
    const actividadRecienteQuery = `
      SELECT 
        r.id,
        r.code_registro,
        CASE 
          WHEN r.hora_entrada_caseta IS NOT NULL AND r.hora_entrada_edificio IS NULL AND r.hora_salida_caseta IS NULL THEN 'Entrada a caseta'
          WHEN r.hora_entrada_edificio IS NOT NULL AND r.hora_salida_edificio IS NULL THEN 'Entrada a edificio'
          WHEN r.hora_salida_edificio IS NOT NULL AND r.hora_salida_caseta IS NULL THEN 'Salida de edificio'
          WHEN r.hora_salida_caseta IS NOT NULL THEN 'Salida de caseta'
          ELSE 'Registro creado'
        END as tipo_evento,
        COALESCE(v.nombre, 'Sin nombre') as nombre_visitante,
        COALESCE(veh.placa, 'Sin vehículo') as placa,
        r.tipo_r,
        r.estatus,
        GREATEST(
          COALESCE(r.hora_entrada_caseta, '1970-01-01'),
          COALESCE(r.hora_entrada_edificio, '1970-01-01'),
          COALESCE(r.hora_salida_edificio, '1970-01-01'),
          COALESCE(r.hora_salida_caseta, '1970-01-01'),
          r.fecha_create
        ) as ultima_actividad
      FROM registro r
      LEFT JOIN registro_visitantes rv ON r.id = rv.registro_id
      LEFT JOIN visitantes v ON rv.id_visitante = v.id
      LEFT JOIN registro_vehiculos rveh ON r.id = rveh.registro_id
      LEFT JOIN vehiculos veh ON rveh.vehiculo_id = veh.id
      ORDER BY ultima_actividad DESC
      LIMIT 10
    `;
    
    // Ejecutar la consulta de actividad reciente
    const actividadReciente = await pool.query(actividadRecienteQuery);
    
    // Formatear la actividad reciente para el frontend
    const formattedActivities = actividadReciente.rows.map(activity => {
      // Calcular tiempo transcurrido
      const timeAgo = getTimeAgo(activity.ultima_actividad);
      
      // Construir descripción según el tipo de registro
      let description = '';
      if (activity.tipo_r === 'completo') {
        description = `${activity.nombre_visitante}${activity.placa !== 'Sin vehículo' ? ` - Placa: ${activity.placa}` : ''}`;
      } else if (activity.tipo_r === 'proveedor') {
        description = `Proveedor${activity.placa !== 'Sin vehículo' ? ` - Placa: ${activity.placa}` : ''}`;
      } else if (activity.tipo_r === 'peatonal') {
        description = `${activity.nombre_visitante} (Peatonal)`;
      } else if (activity.tipo_r === 'no_registrado') {
        description = `${activity.tipo_no_reguistardo || 'No registrado'}`;
      } else {
        description = activity.nombre_visitante || 'Sin información';
      }
      
      return {
        id: activity.id,
        code: activity.code_registro,
        title: activity.tipo_evento,
        description: description,
        time: timeAgo,
        status: activity.estatus
      };
    });
    
    // Devolver todas las estadísticas
    res.json({
      ok: true,
      stats: {
        visitantesActivos: parseInt(stats.visitantes_activos) || 0,
        visitasHoy: parseInt(stats.visitas_hoy) || 0,
        visitasCompletadasHoy: parseInt(stats.visitas_completadas_hoy) || 0,
        visitantesSemana: parseInt(stats.visitantes_semana) || 0
      },
      actividadReciente: formattedActivities
    });
  } catch (error) {
    console.error('Error al obtener estadísticas del dashboard:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas del dashboard' });
  }
};

// Función para calcular tiempo transcurrido en formato legible
function getTimeAgo(timestamp) {
  const now = new Date();
  const past = new Date(timestamp);
  const diffMs = now - past;
  const diffSecs = Math.round(diffMs / 1000);
  const diffMins = Math.round(diffSecs / 60);
  const diffHours = Math.round(diffMins / 60);
  const diffDays = Math.round(diffHours / 24);

  if (diffSecs < 60) {
    return 'Hace unos segundos';
  } else if (diffMins < 60) {
    return `Hace ${diffMins} ${diffMins === 1 ? 'minuto' : 'minutos'}`;
  } else if (diffHours < 24) {
    return `Hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
  } else {
    return `Hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
  }
}
