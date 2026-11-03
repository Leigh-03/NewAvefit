BEGIN;

ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS training_program VARCHAR(40);

ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS previous_training_program VARCHAR(40);

ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS is_program_switch BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS workout_plans_user_program_switch_idx
  ON workout_plans (user_id, training_program)
  WHERE is_program_switch = TRUE;

COMMIT;
