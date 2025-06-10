-- Añadir nuevos campos a la tabla registro
ALTER TABLE registro 
ADD COLUMN IF NOT EXISTS registration_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS num_passengers INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS tag_type VARCHAR(20) DEFAULT 'etiqueta';

-- Crear tabla para relación de múltiples visitantes por registro
CREATE TABLE IF NOT EXISTS registro_visitantes (
  id SERIAL PRIMARY KEY,
  registro_id INTEGER REFERENCES registro(id) ON DELETE CASCADE,
  visitor_id INTEGER REFERENCES visitors(id),
  visitor_number INTEGER NOT NULL,
  is_driver BOOLEAN DEFAULT FALSE,
  visitor_tag VARCHAR(50),
  tag_type VARCHAR(20) DEFAULT 'etiqueta', -- 'etiqueta' o 'tarjeta'
  card_number VARCHAR(50), -- Número de tarjeta asignada (solo si tag_type = 'tarjeta')
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crear índices para mejorar el rendimiento
CREATE INDEX IF NOT EXISTS idx_registro_visitantes_registro_id ON registro_visitantes(registro_id);
CREATE INDEX IF NOT EXISTS idx_registro_visitantes_visitor_id ON registro_visitantes(visitor_id);
CREATE INDEX IF NOT EXISTS idx_registro_registration_code ON registro(registration_code);
CREATE INDEX IF NOT EXISTS idx_registro_visitantes_card_number ON registro_visitantes(card_number);
