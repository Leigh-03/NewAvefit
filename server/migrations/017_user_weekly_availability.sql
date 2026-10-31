BEGIN;

CREATE TABLE IF NOT EXISTS user_workout_availability (
  availability_id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  day_of_week VARCHAR(10) NOT NULL
    CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')),
  start_time TIME NOT NULL
    CHECK (start_time >= TIME '06:00' AND start_time < TIME '22:00'),
  end_time TIME NOT NULL
    CHECK (end_time > start_time AND end_time <= TIME '22:00'),
  time_preference VARCHAR(20) NOT NULL
    CHECK (time_preference IN ('Morning', 'Afternoon', 'Evening', 'Flexible')),
  UNIQUE (user_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS user_workout_availability_user_day_idx
  ON user_workout_availability (user_id, day_of_week);

INSERT INTO user_workout_availability
  (user_id, day_of_week, start_time, end_time, time_preference)
SELECT users.user_id,
       INITCAP(LOWER(available.day_name)),
       CASE COALESCE(users.preferred_workout_time, 'Flexible')
         WHEN 'Morning' THEN TIME '06:00'
         WHEN 'Afternoon' THEN TIME '12:00'
         WHEN 'Evening' THEN TIME '17:00'
         ELSE TIME '06:00'
       END,
       CASE COALESCE(users.preferred_workout_time, 'Flexible')
         WHEN 'Morning' THEN TIME '12:00'
         WHEN 'Afternoon' THEN TIME '17:00'
         WHEN 'Evening' THEN TIME '22:00'
         ELSE TIME '22:00'
       END,
       COALESCE(users.preferred_workout_time, 'Flexible')
FROM users
CROSS JOIN LATERAL UNNEST(COALESCE(users.preferred_days, ARRAY[]::text[])) AS available(day_name)
WHERE LOWER(BTRIM(available.day_name)) IN
  ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')
  AND COALESCE(users.preferred_workout_time, 'Flexible') IN
    ('Morning', 'Afternoon', 'Evening', 'Flexible')
ON CONFLICT (user_id, day_of_week) DO NOTHING;

ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS scheduled_start_time TIME;

ALTER TABLE workout_plans
  ADD COLUMN IF NOT EXISTS scheduled_duration_minutes INTEGER;

COMMIT;
