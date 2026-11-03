ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS deletion_request_status VARCHAR(20);

ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS deletion_request_reason TEXT;

ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;

ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS deletion_review_reason TEXT;
