CREATE TABLE IF NOT EXISTS user_membership_term_requests (
  request_id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  membership_months INTEGER NOT NULL CHECK (membership_months IN (1, 3, 6, 12)),
  status VARCHAR(20) NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  reviewed_by INTEGER REFERENCES admins(admin_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS user_membership_term_requests_one_pending_per_user
  ON user_membership_term_requests (user_id)
  WHERE status = 'Pending';

CREATE INDEX IF NOT EXISTS user_membership_term_requests_status_created_idx
  ON user_membership_term_requests (status, created_at DESC);
