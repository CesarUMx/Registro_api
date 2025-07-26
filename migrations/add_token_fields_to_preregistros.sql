-- Migración para agregar campos de token único a la tabla preregistros
-- Fecha: 2025-01-23

-- Agregar columnas para token único y estado del token
ALTER TABLE preregistros 
ADD COLUMN token_unico VARCHAR(64) UNIQUE,
ADD COLUMN estado_token VARCHAR(20) CHECK (estado_token IN ('pendiente', 'usado', 'expirado'));

-- Crear índice para búsqueda rápida por token
CREATE INDEX idx_preregistros_token_unico ON preregistros(token_unico);

-- Comentarios para documentar los campos
COMMENT ON COLUMN preregistros.token_unico IS 'Token único para acceso público al formulario de preregistro';
COMMENT ON COLUMN preregistros.estado_token IS 'Estado del token: pendiente, usado, expirado';
