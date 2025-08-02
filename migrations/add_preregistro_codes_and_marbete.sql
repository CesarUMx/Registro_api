-- Script para agregar códigos de preregistro, códigos de visitante y números de marbete
-- Fecha: 2025-01-22

-- 1. Agregar columna 'codigo' a la tabla preregistros
-- Este será un código único para cada preregistro (ej: PRE-2025-001)
ALTER TABLE preregistros 
ADD COLUMN codigo VARCHAR(20) UNIQUE;

-- Crear índice para optimizar búsquedas por código
CREATE INDEX idx_preregistros_codigo ON preregistros(codigo);

-- 2. Agregar columna 'codigo_visitante' a la tabla preregistro_visitantes
-- Este será un código único para cada visitante dentro del preregistro (ej: VIS-001, VIS-002)
ALTER TABLE preregistro_visitantes 
ADD COLUMN codigo_visitante VARCHAR(20);

-- Crear índice compuesto para optimizar búsquedas
CREATE INDEX idx_preregistro_visitantes_codigo ON preregistro_visitantes(preregistro_id, codigo_visitante);

-- 3. Agregar columna 'numero_marbete' a la tabla preregistro_vehiculos
-- Este será el número del marbete físico asignado al vehículo
ALTER TABLE preregistro_vehiculos 
ADD COLUMN numero_marbete VARCHAR(20);

-- Crear índice para búsquedas por marbete
CREATE INDEX idx_preregistro_vehiculos_marbete ON preregistro_vehiculos(numero_marbete);

-- 4. Agregar comentarios para documentar los nuevos campos
COMMENT ON COLUMN preregistros.codigo IS 'Código único del preregistro generado automáticamente (ej: PRE-2025-001)';
COMMENT ON COLUMN preregistro_visitantes.codigo_visitante IS 'Código único del visitante dentro del preregistro (ej: VIS-001)';
COMMENT ON COLUMN preregistro_vehiculos.numero_marbete IS 'Número del marbete físico asignado al vehículo durante el preregistro';

-- 5. Opcional: Generar códigos para registros existentes (si los hay)
-- NOTA: Ejecutar solo si hay datos existentes que necesiten códigos

-- Generar códigos para preregistros existentes
UPDATE preregistros 
SET codigo = 'PRE-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(id::text, 3, '0')
WHERE codigo IS NULL;

-- Generar códigos para visitantes existentes
UPDATE preregistro_visitantes 
SET codigo_visitante = 'VIS-' || LPAD(ROW_NUMBER() OVER (PARTITION BY preregistro_id ORDER BY id)::text, 3, '0')
WHERE codigo_visitante IS NULL;

-- 6. Hacer que el campo codigo sea NOT NULL para futuros registros
-- (Ejecutar después de generar códigos para registros existentes)
ALTER TABLE preregistros 
ALTER COLUMN codigo SET NOT NULL;
