-- Eliminar la columna driver_tag de la tabla drivers
-- ya que un conductor puede tener múltiples códigos según los registros

-- Primero eliminamos el índice si existe
DROP INDEX IF EXISTS idx_driver_tag;

-- Luego eliminamos la columna
ALTER TABLE drivers DROP COLUMN IF EXISTS driver_tag;

-- Aseguramos que la tabla registro_visitantes tenga la columna driver_tag
-- Verificamos si la columna existe primero
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'registro_visitantes' 
        AND column_name = 'driver_tag'
    ) THEN
        ALTER TABLE registro_visitantes ADD COLUMN driver_tag VARCHAR(50);
        
        -- Creamos un índice para búsquedas rápidas por driver_tag
        CREATE INDEX idx_registro_visitantes_driver_tag ON registro_visitantes(driver_tag);
    END IF;
END
$$;
