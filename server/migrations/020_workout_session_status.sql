-- ============================================================
-- AVEFIT Workout Status Migration
-- Adds the materialised status of a scheduled workout
-- (Active, Complete, Incomplete, Absent) that the member
-- dashboard and the trainer's workout plans report.
-- Safe to re-run (idempotent). No existing record is removed.
-- ============================================================

BEGIN;

ALTER TABLE workout_sessions
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'Active';

-- Workouts that were already finished stay complete.
UPDATE workout_sessions
SET status = 'Complete'
WHERE completed IS TRUE
  AND status IS DISTINCT FROM 'Complete';

COMMIT;
