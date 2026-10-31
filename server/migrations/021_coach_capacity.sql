-- Adds a configurable coach member limit without changing existing assignments.
BEGIN;

ALTER TABLE trainers
  ADD COLUMN IF NOT EXISTS max_members INTEGER NOT NULL DEFAULT 15;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'trainers'::regclass
      AND conname = 'trainers_max_members_positive_check'
  ) THEN
    ALTER TABLE trainers
      ADD CONSTRAINT trainers_max_members_positive_check
      CHECK (max_members > 0) NOT VALID;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS users_trainer_id_capacity_idx
  ON users (trainer_id)
  WHERE trainer_id IS NOT NULL;

COMMIT;
