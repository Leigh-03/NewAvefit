CREATE TABLE IF NOT EXISTS equipment_inventory (
  equipment_id BIGSERIAL PRIMARY KEY,
  equipment_name VARCHAR(120) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  equipment_condition VARCHAR(40) NOT NULL DEFAULT 'Not assessed',
  condition_notes VARCHAR(500) NOT NULL DEFAULT '',
  status VARCHAR(40) NOT NULL DEFAULT 'Needs inspection',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS equipment_inventory_name_unique
  ON equipment_inventory (LOWER(BTRIM(equipment_name)));
