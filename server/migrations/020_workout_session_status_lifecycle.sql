-- Workout session status lifecycle.
--
-- The application already keeps a status on every scheduled workout. This
-- migration makes sure the column, its allowed values and the lookup index
-- exist on every deployment, so the automatic evaluation in
-- server/utils/workoutStatus.js always has somewhere to store its result.
--
--   Scheduled  -> booked for a future day
--   Active     -> the scheduled day is ongoing and the workout is unfinished
--   Complete   -> the member finished the scheduled workout
--   Incomplete -> the member started the workout but the day ended first
--   Absent     -> the scheduled day ended without any recorded activity

BEGIN;

ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Scheduled';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'workout_sessions'::regclass
      AND conname = 'workout_sessions_status_check'
  ) THEN
    ALTER TABLE workout_sessions
      ADD CONSTRAINT workout_sessions_status_check
      CHECK (status IN ('Scheduled', 'Active', 'Complete', 'Incomplete', 'Absent'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS workout_sessions_status_date_idx
  ON workout_sessions (status, session_date);

COMMIT;
