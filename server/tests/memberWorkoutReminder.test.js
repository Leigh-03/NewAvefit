const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../db");
const mailer = require("../utils/mailer");

const originalIsMailConfigured = mailer.isMailConfigured;
const originalSendReminder = mailer.sendMemberNoWorkoutPlanReminderEmail;
const notificationModulePath = require.resolve("../utils/notifications");

mailer.isMailConfigured = () => true;
const sentEmails = [];
mailer.sendMemberNoWorkoutPlanReminderEmail = async (email) => {
  sentEmails.push(email);
  return { delivered: true };
};
delete require.cache[notificationModulePath];
const { sendMemberNoWorkoutPlanReminders } = require(notificationModulePath);

test.after(() => {
  mailer.isMailConfigured = originalIsMailConfigured;
  mailer.sendMemberNoWorkoutPlanReminderEmail = originalSendReminder;
  delete require.cache[notificationModulePath];
});

const mockQueries = (t, reservationRowCount = 1) => {
  const originalQuery = db.query;
  const queries = [];
  db.query = async (text, values) => {
    queries.push({ text, values });
    if (text.includes("WITH schedule")) {
      return {
        rows: [{
          user_id: 14,
          email: "member@example.test",
          first_name: "Casey",
          workout_date: "2026-11-22",
        }],
      };
    }
    if (text.includes("INSERT INTO user_workout_reminder_emails")) {
      return {
        rowCount: reservationRowCount,
        rows: reservationRowCount ? [{ user_id: 14 }] : [],
      };
    }
    if (text.includes("UPDATE user_workout_reminder_emails")) return { rows: [] };
    throw new Error(`Unexpected member reminder query: ${text}`);
  };
  t.after(() => {
    db.query = originalQuery;
  });
  return queries;
};

test("emails a member with no plan for tomorrow and marks the reminder sent", async (t) => {
  sentEmails.length = 0;
  const queries = mockQueries(t);

  await sendMemberNoWorkoutPlanReminders();

  assert.equal(sentEmails.length, 1);
  assert.equal(sentEmails[0].to, "member@example.test");
  assert.equal(sentEmails[0].firstName, "Casey");
  assert.match(sentEmails[0].workoutDate, /November 22, 2026/);
  assert.ok(queries.some(({ text }) => text.includes("NOT EXISTS")));
  assert.ok(queries.some(({ text }) => text.includes("UPDATE user_workout_reminder_emails")));
});

test("does not resend a reminder already reserved for that member and date", async (t) => {
  sentEmails.length = 0;
  mockQueries(t, 0);

  await sendMemberNoWorkoutPlanReminders();

  assert.equal(sentEmails.length, 0);
});
