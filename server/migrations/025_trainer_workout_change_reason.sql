ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS trainer_change_reason TEXT;
