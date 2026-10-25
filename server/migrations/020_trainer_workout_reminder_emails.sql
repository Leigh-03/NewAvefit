BEGIN;

CREATE TABLE IF NOT EXISTS trainer_workout_reminder_emails (
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  trainer_id INTEGER NOT NULL REFERENCES trainers(trainer_id) ON DELETE CASCADE,
  workout_date DATE NOT NULL,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, trainer_id, workout_date)
);

COMMIT;
