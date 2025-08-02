-- Tabla para notificaciones de preregistros
CREATE TABLE IF NOT EXISTS notificaciones_preregistros (
  id SERIAL PRIMARY KEY,
  preregistro_id INTEGER NOT NULL,
  tipo VARCHAR(50) NOT NULL, -- expiracion_proxima, expirado, cambio_estado, etc.
  mensaje TEXT NOT NULL,
  destinatario_id INTEGER NOT NULL, -- ID del usuario que recibe la notificación
  leida BOOLEAN DEFAULT FALSE,
  leida_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (preregistro_id) REFERENCES preregistros(id) ON DELETE CASCADE,
  FOREIGN KEY (destinatario_id) REFERENCES users(id)
);

-- Índices para mejorar el rendimiento de las consultas
CREATE INDEX IF NOT EXISTS idx_notificaciones_destinatario ON notificaciones_preregistros(destinatario_id);
CREATE INDEX IF NOT EXISTS idx_notificaciones_leida ON notificaciones_preregistros(leida);
CREATE INDEX IF NOT EXISTS idx_notificaciones_created_at ON notificaciones_preregistros(created_at);
