CREATE TABLE IF NOT EXISTS equipment_inventory (
  equipment_id BIGSERIAL PRIMARY KEY,
  equipment_name VARCHAR(120) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  equipment_condition VARCHAR(40) NOT NULL DEFAULT 'Not assessed',
  condition_notes VARCHAR(500) NOT NULL DEFAULT '',
  status VARCHAR(40) NOT NULL DEFAULT 'Needs inspection',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE equipment_inventory
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

DELETE FROM equipment_inventory WHERE is_deleted = TRUE;
ALTER TABLE equipment_inventory DROP COLUMN is_deleted;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'equipment_inventory'
      AND column_name = 'condition'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'equipment_inventory'
      AND column_name = 'equipment_condition'
  ) THEN
    ALTER TABLE equipment_inventory RENAME COLUMN condition TO equipment_condition;
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'equipment_inventory'
      AND column_name = 'equipment_condition'
  ) THEN
    ALTER TABLE equipment_inventory
      ADD COLUMN equipment_condition VARCHAR(40) NOT NULL DEFAULT 'Not assessed';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS equipment_inventory_name_unique
  ON equipment_inventory (LOWER(BTRIM(equipment_name)));
