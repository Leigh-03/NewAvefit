BEGIN;

ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS request_type VARCHAR(30) NOT NULL DEFAULT 'member_plan',
  ADD COLUMN IF NOT EXISTS requested_session_date DATE;

COMMIT;
