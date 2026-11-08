-- ============================================================
-- AVEFIT Workout Completion Timestamp Migration
-- Stores the completion time of a workout as an absolute timestamp so the
-- member dashboard always shows the correct Philippine time, no matter which
-- timezone the API server runs in.
-- Only applied when the database itself keeps timestamps in UTC, so no
-- existing completion time is shifted.
-- Safe to re-run (idempotent).
-- ============================================================

BEGIN;

DO $$
BEGIN
  IF current_setting('TimeZone') NOT IN ('UTC', 'Etc/UTC', 'Etc/UTC+0') THEN
    RAISE NOTICE 'Skipped completed_at conversion: database timezone is %', current_setting('TimeZone');
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'workout_sessions'
      AND column_name = 'completed_at'
      AND data_type = 'timestamp without time zone'
  ) THEN
    ALTER TABLE workout_sessions
      ALTER COLUMN completed_at TYPE TIMESTAMPTZ
      USING completed_at AT TIME ZONE 'UTC';
  END IF;
END $$;

COMMIT;
