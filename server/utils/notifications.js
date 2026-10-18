const pool = require("../db");
const webpush = require("web-push");
const { isMailConfigured, sendWeeklyBmiReminderEmail } = require("./mailer");

let pushConfigurationChecked = false;
let pushConfigurationError = null;
let bmiReminderSmtpWarningLogged = false;

const configurePush = () => {
  if (pushConfigurationChecked) return !pushConfigurationError;
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
    return true;
  } catch (err) {
    pushConfigurationError = err;
    console.error("Invalid Web Push VAPID configuration:", err.message);
    return false;
  }
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

const notifyNewUser = (user) => {
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "A new member";
  return notifyAdmins({
    message: `${name} created an AveFit profile and is awaiting review.`,
    notificationType: "general",
    userName: name,
  });
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

module.exports = {
  createNotification,
  getVapidPublicKey,
  notifyAdmins,
  notifyNewUser,
  sendWeeklyBmiReminders,
};
