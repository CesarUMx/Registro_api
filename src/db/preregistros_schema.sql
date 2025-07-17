-- Tabla para preregistros
CREATE TABLE IF NOT EXISTS preregistros (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL,
  scheduled_entry_time TIMESTAMP NOT NULL, -- Hora programada de entrada
  scheduled_exit_time TIMESTAMP NOT NULL, -- Hora programada de salida
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendiente', -- pendiente, activo, finalizado, cancelado
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id)
);

-- Tabla para vehículos asociados a preregistros
CREATE TABLE IF NOT EXISTS preregistro_vehiculos (
  id SERIAL PRIMARY KEY,
  preregistro_id INTEGER NOT NULL,
  vehiculo_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (preregistro_id) REFERENCES preregistros(id) ON DELETE CASCADE,
  FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id)
);

-- Tabla para visitantes asociados a preregistros
CREATE TABLE IF NOT EXISTS preregistro_visitantes (
  id SERIAL PRIMARY KEY,
  preregistro_id INTEGER NOT NULL,
  visitante_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (preregistro_id) REFERENCES preregistros(id) ON DELETE CASCADE,
  FOREIGN KEY (visitante_id) REFERENCES visitantes(id)
);

-- Tabla para tokens de invitación
CREATE TABLE IF NOT EXISTS invite_tokens (
  id SERIAL PRIMARY KEY,
  token VARCHAR(255) UNIQUE NOT NULL,
  admin_id INTEGER NOT NULL,
  preregistro_id INTEGER,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users(id),
  FOREIGN KEY (preregistro_id) REFERENCES preregistros(id) ON DELETE SET NULL
);

-- Tabla de bitácora para eventos de preregistros
CREATE TABLE IF NOT EXISTS bitacora_preregistros (
  id SERIAL PRIMARY KEY,
  preregistro_id INTEGER NOT NULL,
  tipo_evento VARCHAR(50) NOT NULL, -- entrada_visitante, salida_visitante, entrada_vehiculo, salida_vehiculo, extension_tiempo, etc.
  visitante_id INTEGER, -- Puede ser NULL si el evento es solo de vehículo
  vehiculo_id INTEGER, -- Puede ser NULL si el evento es solo de visitante
  guardia_id INTEGER NOT NULL, -- ID del guardia que registra el evento
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notas TEXT,
  FOREIGN KEY (preregistro_id) REFERENCES preregistros(id) ON DELETE CASCADE,
  FOREIGN KEY (visitante_id) REFERENCES visitantes(id) ON DELETE SET NULL,
  FOREIGN KEY (vehiculo_id) REFERENCES vehiculos(id) ON DELETE SET NULL,
  FOREIGN KEY (guardia_id) REFERENCES users(id)
);

-- Tabla para notificaciones de preregistros
CREATE TABLE IF NOT EXISTS notificaciones_preregistros (
  id SERIAL PRIMARY KEY,
  preregistro_id INTEGER NOT NULL,
  tipo_notificacion VARCHAR(50) NOT NULL, -- proxima_expiracion, expiracion, entrada, salida, etc.
  destinatario_id INTEGER NOT NULL, -- ID del usuario que recibirá la notificación
  leido BOOLEAN DEFAULT FALSE,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (preregistro_id) REFERENCES preregistros(id) ON DELETE CASCADE,
  FOREIGN KEY (destinatario_id) REFERENCES users(id)
);

-- Índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_preregistros_status ON preregistros(status);
CREATE INDEX IF NOT EXISTS idx_preregistros_scheduled_times ON preregistros(scheduled_entry_time, scheduled_exit_time);
CREATE INDEX IF NOT EXISTS idx_bitacora_preregistro_id ON bitacora_preregistros(preregistro_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_timestamp ON bitacora_preregistros(timestamp);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON invite_tokens(token);
