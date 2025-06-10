-- Añadir la columna driver_id a la tabla registro_visitantes si no existe
-- Esta columna es necesaria para relacionar directamente el registro con el conductor

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'registro_visitantes' 
        AND column_name = 'driver_id'
    ) THEN
        ALTER TABLE registro_visitantes ADD COLUMN driver_id INTEGER;
        
        -- Añadir una restricción de clave externa para driver_id
        ALTER TABLE registro_visitantes 
        ADD CONSTRAINT fk_registro_visitantes_driver 
        FOREIGN KEY (driver_id) 
        REFERENCES drivers(id);
    END IF;
END
$$;
