BEGIN;

CREATE TABLE IF NOT EXISTS user_workout_reminder_emails (
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  workout_date DATE NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, workout_date)
);

COMMIT;
