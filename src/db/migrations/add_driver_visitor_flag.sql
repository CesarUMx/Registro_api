-- Añadir campo para identificar cuando un conductor también es visitante
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'registro_visitantes' 
        AND column_name = 'is_driver_visitor'
    ) THEN
        -- Añadir columna is_driver_visitor (booleano) con valor predeterminado FALSE
        ALTER TABLE registro_visitantes ADD COLUMN is_driver_visitor BOOLEAN DEFAULT FALSE;
        
        -- Añadir columna driver_visitor_id para relacionar con el ID del visitante cuando el conductor también es visitante
        ALTER TABLE registro_visitantes ADD COLUMN driver_visitor_id INTEGER;
        
        -- Añadir restricción de clave externa para driver_visitor_id
        ALTER TABLE registro_visitantes 
        ADD CONSTRAINT fk_registro_visitantes_driver_visitor 
        FOREIGN KEY (driver_visitor_id) 
        REFERENCES visitors(id);
    END IF;
END
$$;
