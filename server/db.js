const { Pool } = require("pg");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const getDatabaseConfig = () => {
  const connectionString = process.env.DATABASE_URL?.trim();
  let host = process.env.DB_HOST?.trim();

  if (connectionString) {
    let parsed;
    try {
      parsed = new URL(connectionString);
    } catch {
      throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
    }
    if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
      throw new Error("DATABASE_URL must use the postgres:// or postgresql:// protocol.");
    }
    host = parsed.hostname;
  }

  if (!connectionString) {
    const missing = ["DB_HOST", "DB_NAME", "DB_USER"]
      .filter((key) => !process.env[key]?.trim());
    if (missing.length) {
      throw new Error(
        `Missing PostgreSQL configuration: set DATABASE_URL or ${missing.join(", ")}.`
      );
    }
  }

  const portValue = process.env.DB_PORT?.trim();
  const port = portValue ? Number(portValue) : undefined;
  if (portValue && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    throw new Error("DB_PORT must be a valid port number between 1 and 65535.");
  }

  const sslSetting = process.env.DB_SSL?.trim().toLowerCase();
  let sslEnabled;
  if (sslSetting) {
    if (["true", "1", "require"].includes(sslSetting)) {
      sslEnabled = true;
    } else if (["false", "0", "disable"].includes(sslSetting)) {
      sslEnabled = false;
    } else {
      throw new Error("DB_SSL must be true, false, require, or disable.");
    }
  } else {
    const normalizedHost = (host || "").toLowerCase();
    const isLocalHost =
      normalizedHost === "localhost" ||
      normalizedHost === "::1" ||
      normalizedHost.startsWith("127.");
    sslEnabled = Boolean(host) && !isLocalHost;
  }

  return {
    ...(connectionString
      ? { connectionString }
      : {
          host,
          port,
          database: process.env.DB_NAME,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
        }),
    ssl: sslEnabled ? {} : false,
    connectionTimeoutMillis: 10000,
  };
};

const pool = new Pool(getDatabaseConfig());

const expireMemberships = async (userId = null) => {
  const result = await pool.query(`
    UPDATE users
    SET account_status = 'Inactive',
        token_version = token_version + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE LOWER(COALESCE(account_status, 'pending')) = 'active'
      AND membership_end_date IS NOT NULL
      AND membership_end_date < (NOW() AT TIME ZONE 'Asia/Manila')::date
      AND ($1::integer IS NULL OR user_id = $1)
    RETURNING user_id, first_name, last_name
  `, [userId]);

  if (result.rowCount > 0) {
    const { createNotification } = require("./utils/notifications");
    await Promise.all(result.rows.map((user) => createNotification({
      audience: "user",
      recipientId: user.user_id,
      notificationType: "membership",
      message: "Your membership has ended. Please contact the gym administrator for assistance.",
      userName: `${user.first_name || ""} ${user.last_name || ""}`.trim() || null,
      targetUrl: "/user/profile",
    }).catch((err) => {
      console.error("Membership expiry notification failed:", err.message);
    })));
  }

  return result.rowCount;
};

pool.on("error", (err) => {
  console.error("❌ Unexpected PostgreSQL pool error:", err);
});

/**
 * Ensure the approval columns exist before the API starts accepting requests.
 * This keeps the app working even when the migration SQL was not manually run.
 */
const initializeDatabase = async () => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TABLE IF NOT EXISTS trainer_availability (
        availability_id BIGSERIAL PRIMARY KEY,
        trainer_id INTEGER NOT NULL REFERENCES trainers(trainer_id) ON DELETE CASCADE,
        day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        CHECK (start_time >= TIME '06:00' AND end_time <= TIME '22:00'),
        CHECK (start_time < end_time),
        UNIQUE (trainer_id, day_of_week, start_time, end_time)
      )
    `);
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conrelid = 'trainer_availability'::regclass
            AND conname = 'trainer_availability_business_hours_check'
        ) THEN
          ALTER TABLE trainer_availability
          ADD CONSTRAINT trainer_availability_business_hours_check
          CHECK (start_time >= TIME '06:00' AND end_time <= TIME '22:00')
          NOT VALID;
        END IF;
      END
      $$
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS trainer_availability_trainer_day_idx
      ON trainer_availability (trainer_id, day_of_week, start_time)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_notifications (
        notification_id BIGSERIAL PRIMARY KEY,
        audience_type VARCHAR(20) NOT NULL CHECK (audience_type IN ('admin', 'trainer', 'user')),
        recipient_id INTEGER NOT NULL,
        message TEXT NOT NULL,
        notification_type VARCHAR(40) NOT NULL DEFAULT 'general',
        related_user_name TEXT,
        target_url TEXT,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS app_notifications_recipient_created_idx
      ON app_notifications (audience_type, recipient_id, created_at DESC)
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        subscription_id BIGSERIAL PRIMARY KEY,
        audience_type VARCHAR(20) NOT NULL CHECK (audience_type IN ('admin', 'trainer', 'user')),
        recipient_id INTEGER NOT NULL,
        endpoint TEXT NOT NULL,
        subscription JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      ALTER TABLE push_subscriptions
      DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_key
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS push_subscriptions_recipient_idx
      ON push_subscriptions (audience_type, recipient_id)
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_recipient_endpoint_idx
      ON push_subscriptions (audience_type, recipient_id, endpoint)
    `);

    await client.query(`
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
      )
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS user_profile_change_requests_one_pending_per_type
      ON user_profile_change_requests (user_id, request_type)
      WHERE status = 'Pending'
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS user_profile_change_requests_pending_created_idx
      ON user_profile_change_requests (status, created_at)
      WHERE status = 'Pending'
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_workout_reminder_emails (
        user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        workout_date DATE NOT NULL,
        sent_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, workout_date)
      )
    `);

    await client.query(`
      ALTER TABLE workout_sessions
      ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) DEFAULT 'Pending'
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS preferred_workout_time VARCHAR(20)
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS bmi_reminder_sent_at TIMESTAMPTZ
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS bmi_reminder_email_sent_at TIMESTAMPTZ
    `);

    await client.query(`
      ALTER TABLE members
      ADD COLUMN IF NOT EXISTS trainer_id INTEGER
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM information_schema.table_constraints
          WHERE constraint_schema = current_schema()
            AND table_name = 'members'
            AND constraint_name = 'members_trainer_id_fkey'
        ) THEN
          ALTER TABLE members
          ADD CONSTRAINT members_trainer_id_fkey
          FOREIGN KEY (trainer_id)
          REFERENCES trainers(trainer_id)
          ON DELETE SET NULL;
        END IF;
      END
      $$
    `);

    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS membership_months INTEGER,
        ADD COLUMN IF NOT EXISTS membership_start_date DATE,
        ADD COLUMN IF NOT EXISTS membership_end_date DATE
    `);

    await client.query(`
      UPDATE users
      SET membership_start_date = created_at::date,
          membership_end_date = (
            created_at::date + make_interval(months => membership_months) - INTERVAL '1 day'
          )::date
      WHERE membership_months IS NOT NULL
        AND membership_start_date IS NULL
    `);

    // Existing completed accounts should remain usable. Existing unfinished
    // accounts stay pending so the admin can review them.
    await client.query(`
      UPDATE users
      SET account_status = CASE
        WHEN COALESCE(setup_completed, FALSE) = TRUE THEN 'Active'
        ELSE COALESCE(account_status, 'Pending')
      END
      WHERE account_status IS NULL
         OR (account_status = 'Pending' AND COALESCE(setup_completed, FALSE) = TRUE)
    `);

    await client.query(`
      ALTER TABLE users
      ALTER COLUMN account_status SET DEFAULT 'Pending'
    `);

    // Email verification. Only the hash of the verification token is stored,
    // so a database leak cannot be replayed as a verification link.
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS google_sub TEXT
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unique
      ON users (google_sub)
      WHERE google_sub IS NOT NULL
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS verification_token_hash TEXT
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS verification_token_expires_at TIMESTAMP
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS verification_sent_at TIMESTAMP
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMP
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_reset_sent_at TIMESTAMP
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_change_code_hash TEXT
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_change_code_expires_at TIMESTAMP
    `);

    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_change_code_sent_at TIMESTAMP
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS users_verification_token_idx
      ON users (verification_token_hash)
      WHERE verification_token_hash IS NOT NULL
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS users_password_reset_token_idx
      ON users (password_reset_token_hash)
      WHERE password_reset_token_hash IS NOT NULL
    `);

    // Accounts the admin has already approved are grandfathered in as verified,
    // otherwise the new requirement would lock out existing members.
    // Accounts still awaiting approval must confirm their email before they can be approved.
    await client.query(`
      UPDATE users
      SET email_verified = TRUE,
          email_verified_at = COALESCE(email_verified_at, created_at)
      WHERE LOWER(COALESCE(account_status, 'pending')) = 'active'
        AND email_verified = FALSE
    `);

    // Security/session invalidation columns.
    // Incrementing token_version immediately invalidates previously issued JWTs.
    await client.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0
    `);

    await client.query(`
      ALTER TABLE trainers
      ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0
    `);

    await client.query(`
      ALTER TABLE admins
      ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0
    `);

    await client.query(`
      ALTER TABLE admins
      ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT
    `);

    await client.query(`
      ALTER TABLE admins
      ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ
    `);

    await client.query(`
      ALTER TABLE admins
      ADD COLUMN IF NOT EXISTS account_status VARCHAR(20) NOT NULL DEFAULT 'Active'
    `);

    await client.query(`
      UPDATE admins
      SET account_status = 'Active'
      WHERE account_status IS NULL
    `);

    // Prevent duplicate accounts that differ only by email casing.
    // await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (LOWER(email))`);
    // await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS trainers_email_lower_unique ON trainers (LOWER(email)) WHERE email IS NOT NULL`);
    // await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS admins_email_lower_unique ON admins (LOWER(email))`);

    // Trainers already in the database remain available.
    // New trainers are created as Pending by trainerController.js
    // and require admin approval.
    await client.query(`
      ALTER TABLE trainers
      ALTER COLUMN status SET DEFAULT 'Pending'
    `);

    await client.query("COMMIT");

    console.log(
      "✅ Database approval, email verification, Google auth, push notification, and trainer specialization schema ready"
    );
    await expireMemberships();
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(
      "❌ Database schema initialization failed:",
      err.message
    );
    throw err;
  } finally {
    client.release();
  }
};

module.exports = pool;
module.exports.initializeDatabase = initializeDatabase;
module.exports.expireMemberships = expireMemberships;