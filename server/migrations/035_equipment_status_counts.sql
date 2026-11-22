ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS in_service_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS under_maintenance_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_replacement_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_inspection_count INTEGER NOT NULL DEFAULT 0;

UPDATE equipment_inventory
SET in_service_count = CASE
      WHEN status IN ('In service', 'Repaired', 'Replaced') THEN quantity
      ELSE 0
    END,
    under_maintenance_count = CASE
      WHEN status IN ('Under Maintenance', 'Under maintenance', 'Under repair') THEN quantity
      ELSE 0
    END,
    needs_replacement_count = CASE
      WHEN status IN ('Needs replacement', 'Retired') THEN quantity
      ELSE 0
    END,
    needs_inspection_count = CASE WHEN status = 'Needs inspection' THEN quantity ELSE 0 END
WHERE in_service_count + under_maintenance_count + needs_replacement_count + needs_inspection_count = 0;

UPDATE equipment_inventory
SET status = CASE
  WHEN needs_replacement_count > 0 THEN 'Needs replacement'
  WHEN under_maintenance_count > 0 THEN 'Under Maintenance'
  WHEN needs_inspection_count > 0 THEN 'Needs inspection'
  ELSE 'In service'
END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'equipment_inventory'::regclass
      AND conname = 'equipment_inventory_status_counts_match_quantity'
  ) THEN
    ALTER TABLE equipment_inventory
      ADD CONSTRAINT equipment_inventory_status_counts_match_quantity
      CHECK (
        in_service_count >= 0
        AND under_maintenance_count >= 0
        AND needs_replacement_count >= 0
        AND needs_inspection_count >= 0
        AND in_service_count + under_maintenance_count
          + needs_replacement_count + needs_inspection_count = quantity
      );
  END IF;
END
$$;
