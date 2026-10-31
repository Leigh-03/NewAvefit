const pool = require("../db");
const webpush = require("web-push");
const {
  isMailConfigured,
  sendWeeklyBmiReminderEmail,
  sendNoWorkoutReminderEmail,
  sendNewUserRegistrationEmail,
} = require("./mailer");
const { getConfiguredAdminEmail } = require("./adminAccess");

let pushConfigurationChecked = false;
let pushConfigurationAvailable = false;
let bmiReminderSmtpWarningLogged = false;
let workoutReminderSmtpWarningLogged = false;

const configurePush = () => {
  if (pushConfigurationChecked) return pushConfigurationAvailable;
  pushConfigurationChecked = true;

  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  try {
    webpush.setVapidDetails(
      process.env.WEB_PUSH_CONTACT || "mailto:support@avefit.com",
      publicKey,
      privateKey
    );
    pushConfigurationAvailable = true;
  } catch (err) {
    console.error("Invalid Web Push VAPID configuration:", err.message);
  }
  return pushConfigurationAvailable;
};

const getVapidPublicKey = () => {
  if (!configurePush()) return null;
  return process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
};

const sendPushNotification = async (audience, recipientId, payload) => {
  if (!configurePush()) return;

  const result = await pool.query(
    `SELECT subscription_id, endpoint, subscription
     FROM push_subscriptions
     WHERE audience_type = $1 AND recipient_id = $2`,
    [audience, recipientId]
  );

  await Promise.all(result.rows.map(async (row) => {
    try {
      await webpush.sendNotification(row.subscription, JSON.stringify(payload));
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        await pool.query(
          "DELETE FROM push_subscriptions WHERE subscription_id = $1",
          [row.subscription_id]
        );
        return;
      }
      console.error("Web Push delivery failed:", err.message);
    }
  }));
};

const createNotification = async ({
  audience,
  recipientId,
  notificationType = "general",
  message,
  userName = null,
  targetUrl = "/",
}) => {
  if (!["admin", "trainer", "user"].includes(audience)) {
    throw new Error("Invalid notification audience.");
  }
  if (!Number.isInteger(Number(recipientId)) || !message) {
    throw new Error("A valid notification recipient and message are required.");
  }

  const result = await pool.query(
    `INSERT INTO app_notifications
       (audience_type, recipient_id, message, notification_type, related_user_name, target_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING notification_id, audience_type, recipient_id, message,
               notification_type, related_user_name, target_url, is_read, created_at`,
    [audience, Number(recipientId), message, notificationType, userName, targetUrl]
  );

  try {
    await sendPushNotification(audience, Number(recipientId), {
      title: "AveFit",
      body: message,
      url: targetUrl,
    });
  } catch (err) {
    console.error("Web Push dispatch failed:", err.message);
  }
  return result.rows[0];
};

const notifyAdmins = async ({ message, notificationType, userName, targetUrl = "/admin/members" }) => {
  const result = await pool.query(
    "SELECT admin_id FROM admins WHERE LOWER(COALESCE(account_status, 'active')) = 'active'"
  );
  await Promise.all(result.rows.map((admin) => createNotification({
    audience: "admin",
    recipientId: admin.admin_id,
    message,
    notificationType,
    userName,
    targetUrl,
  })));
};

const notifyNewUser = async (user) => {
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "A new member";
  const notificationPromise = notifyAdmins({
    message: `${name} created an AveFit profile and is awaiting review.`,
    notificationType: "general",
    userName: name,
  }).catch((err) => {
    console.error("New-user in-app admin notification failed:", err.message);
  });

  const adminEmail = getConfiguredAdminEmail();
  let emailPromise;
  if (!adminEmail) {
    console.error("New-user admin email was not sent because ADMIN_EMAIL is not configured.");
  } else if (!isMailConfigured()) {
    console.error("New-user admin email was not sent because SMTP is not configured.");
  } else {
    emailPromise = sendNewUserRegistrationEmail({
      to: adminEmail,
      memberName: name,
      memberEmail: user.email,
      phone: user.phone,
    })
      .then((result) => {
        if (!result.delivered) {
          console.error("New-user admin email was not delivered.");
        }
      })
      .catch((err) => {
        console.error("New-user admin email failed:", err.message);
      });
  }

  await Promise.all([notificationPromise, emailPromise]);
};

const sendWeeklyBmiReminders = async () => {
  const users = await pool.query(`
    SELECT u.user_id, u.email, u.first_name,
           u.bmi_reminder_sent_at, u.bmi_reminder_email_sent_at
    FROM users u
    WHERE LOWER(COALESCE(u.account_status, 'pending')) = 'active'
      AND u.email_verified = TRUE
      AND u.height IS NOT NULL
      AND u.height > 0
      AND (
        u.bmi_reminder_sent_at IS NULL
        OR u.bmi_reminder_sent_at <= NOW() - INTERVAL '7 days'
        OR (
          NULLIF(BTRIM(u.email), '') IS NOT NULL
          AND (
            u.bmi_reminder_email_sent_at IS NULL
            OR u.bmi_reminder_email_sent_at <= NOW() - INTERVAL '7 days'
          )
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM progress_logs pl
        WHERE pl.user_id = u.user_id
          AND pl.log_date >= (NOW() AT TIME ZONE 'Asia/Manila')::date - 6
      )
    ORDER BY u.user_id
  `);

  for (const user of users.rows) {
    const inAppReminderDue = !user.bmi_reminder_sent_at
      || new Date(user.bmi_reminder_sent_at).getTime() <= Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (inAppReminderDue) {
      try {
        await createNotification({
          audience: "user",
          recipientId: user.user_id,
          message: "It’s time for your weekly BMI update. Log your current weight to refresh your BMI and progress.",
          notificationType: "bmi_reminder",
          targetUrl: "/user/progress",
        });
        await pool.query(
          "UPDATE users SET bmi_reminder_sent_at = NOW() WHERE user_id = $1",
          [user.user_id]
        );
      } catch (err) {
        console.error(`Weekly BMI in-app reminder failed for user ${user.user_id}:`, err.message);
      }
    }

    const emailReminderDue = user.email && (
      !user.bmi_reminder_email_sent_at
      || new Date(user.bmi_reminder_email_sent_at).getTime() <= Date.now() - 7 * 24 * 60 * 60 * 1000
    );
    if (!emailReminderDue) continue;
    if (!isMailConfigured()) {
      if (!bmiReminderSmtpWarningLogged) {
        console.warn("Weekly BMI reminder emails are disabled because SMTP_HOST, SMTP_USER, and SMTP_PASS are not configured.");
        bmiReminderSmtpWarningLogged = true;
      }
      continue;
    }

    try {
      await sendWeeklyBmiReminderEmail({
        to: user.email,
        firstName: user.first_name,
      });
      await pool.query(
        "UPDATE users SET bmi_reminder_email_sent_at = NOW() WHERE user_id = $1",
        [user.user_id]
      );
    } catch (err) {
      console.error(`Weekly BMI reminder email failed for user ${user.user_id}:`, err.message);
    }
  }
};

const sendUnassignedWorkoutReminders = async () => {
  if (!isMailConfigured()) {
    if (!workoutReminderSmtpWarningLogged) {
      console.warn("No-workout reminder emails are disabled because SMTP_HOST, SMTP_USER, and SMTP_PASS are not configured.");
      workoutReminderSmtpWarningLogged = true;
    }
    return;
  }

  await pool.query(
    `DELETE FROM trainer_workout_reminder_emails
     WHERE sent_at IS NULL AND created_at < NOW() - INTERVAL '1 hour'`
  );

  const users = await pool.query(`
    WITH schedule AS (
      SELECT (NOW() AT TIME ZONE 'Asia/Manila')::date + 1 AS workout_date
    )
    SELECT
      u.user_id,
      u.trainer_id,
      u.first_name,
      u.last_name,
      t.email AS trainer_email,
      t.full_name AS trainer_name,
      schedule.workout_date
    FROM users u
    JOIN trainers t ON t.trainer_id = u.trainer_id
    CROSS JOIN schedule
    WHERE LOWER(COALESCE(u.account_status, 'pending')) = 'active'
      AND u.setup_completed = TRUE
      AND u.trainer_id IS NOT NULL
      AND NULLIF(BTRIM(t.email), '') IS NOT NULL
      AND COALESCE(cardinality(u.preferred_days), 0) > 0
      AND LOWER(TO_CHAR(schedule.workout_date, 'FMDay')) = ANY (
        SELECT LOWER(BTRIM(day_name))
        FROM UNNEST(u.preferred_days) AS days(day_name)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM workout_plans wp
        JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
        WHERE wp.user_id = u.user_id
          AND ws.session_date = TO_CHAR(schedule.workout_date, 'YYYY-MM-DD')
      )
    ORDER BY u.user_id
  `);

  for (const user of users.rows) {
    const reservation = await pool.query(
      `INSERT INTO trainer_workout_reminder_emails (user_id, trainer_id, workout_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, trainer_id, workout_date) DO NOTHING
       RETURNING user_id`,
      [user.user_id, user.trainer_id, user.workout_date]
    );
    if (!reservation.rowCount) continue;

    try {
      const result = await sendNoWorkoutReminderEmail({
        to: user.trainer_email,
        trainerName: user.trainer_name,
        memberName: `${user.first_name || ""} ${user.last_name || ""}`.trim() || "A member",
        workoutDate: new Date(user.workout_date).toLocaleDateString("en-PH", {
          timeZone: "Asia/Manila",
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      });
      if (!result.delivered) {
        throw new Error("SMTP did not confirm delivery of the workout reminder.");
      }

      await pool.query(
        `UPDATE trainer_workout_reminder_emails
         SET sent_at = NOW()
         WHERE user_id = $1 AND trainer_id = $2 AND workout_date = $3`,
        [user.user_id, user.trainer_id, user.workout_date]
      );
    } catch (err) {
      await pool.query(
        `DELETE FROM trainer_workout_reminder_emails
         WHERE user_id = $1 AND trainer_id = $2 AND workout_date = $3 AND sent_at IS NULL`,
        [user.user_id, user.trainer_id, user.workout_date]
      );
      console.error(`No-workout reminder email failed for coach ${user.trainer_id} about user ${user.user_id}:`, err.message);
      continue;
    }

    try {
      await createNotification({
        audience: "trainer",
        recipientId: user.trainer_id,
        message: `A workout is still missing for ${user.first_name || "your member"}'s preferred workout day tomorrow.`,
        notificationType: "workout",
        userName: user.first_name || "Member",
        targetUrl: "/trainer/workout-plans",
      });
    } catch (err) {
      console.error(`No-workout coach notification failed for user ${user.user_id}:`, err.message);
    }
  }
};

module.exports = {
  createNotification,
  getVapidPublicKey,
  notifyAdmins,
  notifyNewUser,
  sendWeeklyBmiReminders,
  sendUnassignedWorkoutReminders,
};
