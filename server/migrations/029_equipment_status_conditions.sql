UPDATE equipment_inventory
SET status = CASE status
  WHEN 'Repaired' THEN 'In service'
  WHEN 'Replaced' THEN 'In service'
  WHEN 'Retired' THEN 'Needs replacement'
  ELSE status
END
WHERE status IN ('Repaired', 'Replaced', 'Retired');

UPDATE equipment_inventory
SET equipment_condition = CASE status
  WHEN 'Needs inspection' THEN 'Not assessed'
  WHEN 'Under repair' THEN 'Damaged'
  WHEN 'In service' THEN CASE WHEN equipment_condition = 'Rusty' THEN 'Rusty' ELSE 'Good' END
  WHEN 'Needs replacement' THEN CASE
    WHEN equipment_condition IN ('Poor', 'Damaged', 'Worn') THEN equipment_condition
    ELSE 'Worn'
  END
  ELSE equipment_condition
END
WHERE status IN ('Needs inspection', 'Under repair', 'In service', 'Needs replacement');
