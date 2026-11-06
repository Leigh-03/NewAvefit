ALTER TABLE users
  ADD COLUMN IF NOT EXISTS membership_expiry_notified_for DATE,
  ADD COLUMN IF NOT EXISTS membership_expired_notified_for DATE,
  ADD COLUMN IF NOT EXISTS membership_expiry_email_attempted_for DATE,
  ADD COLUMN IF NOT EXISTS membership_expired_email_attempted_for DATE;
