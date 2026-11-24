BEGIN;

CREATE TABLE IF NOT EXISTS gym_attendance (
  attendance_id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gym_attendance_user_date_unique UNIQUE (user_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS gym_attendance_user_date_idx
  ON gym_attendance (user_id, attendance_date DESC);

COMMIT;
