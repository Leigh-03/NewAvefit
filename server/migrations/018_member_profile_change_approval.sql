BEGIN;

CREATE TABLE IF NOT EXISTS user_profile_change_requests (
  request_id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  request_type VARCHAR(20) NOT NULL CHECK (request_type IN ('profile', 'password')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  password_hash TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  reviewed_by INTEGER REFERENCES admins(admin_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  CHECK (
    (request_type = 'profile' AND password_hash IS NULL)
    OR (
      request_type = 'password'
      AND (
        (status = 'Pending' AND password_hash IS NOT NULL)
        OR (status IN ('Approved', 'Rejected') AND password_hash IS NULL)
      )
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS user_profile_change_requests_one_pending_per_type
  ON user_profile_change_requests (user_id, request_type)
  WHERE status = 'Pending';

CREATE INDEX IF NOT EXISTS user_profile_change_requests_pending_created_idx
  ON user_profile_change_requests (status, created_at)
  WHERE status = 'Pending';

COMMIT;
