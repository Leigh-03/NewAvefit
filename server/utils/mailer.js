const nodemailer = require("nodemailer");
const dns = require("dns");
const path = require("path");
const { VERIFICATION_CODE_TTL_MINUTES } = require("./emailVerification");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const BRAND_COLOR = "#f97316";

/**
 * Verification mail is optional infrastructure.
 * When SMTP credentials are absent, the code is written
 * to the server console for local development.
 */
function smtpConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return {
    host,
    port: Number(process.env.SMTP_PORT || 465),
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    family: 4,
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { family: 4 }, callback);
    },
    secure:
      String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    auth: {
      user,
      pass,
    },
  };
}

let transporter = null;
let transportResolved = false;

function getTransporter() {
  if (transportResolved) return transporter;

  const config = smtpConfig();

  if (config) {
    transporter = nodemailer.createTransport(config);
  }

  transportResolved = true;

  if (!transporter) {
    console.warn(
      "⚠️ SMTP is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS). Verification codes will be printed to this console instead of being emailed."
    );
  }

  return transporter;
}

function isMailConfigured() {
  return Boolean(smtpConfig());
}

function fromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER;
}

async function sendMail({ to, subject, text, html, replyTo }) {
  const transport = getTransporter();

  if (!transport) {
    console.log(
      "\n──────────── AveFit email (SMTP not configured) ────────────"
    );

    console.log("To:      " + to);
    console.log("Subject: " + subject);
    console.log(text);

    console.log(
      "─────────────────────────────────────────────────────────────\n"
    );

    return {
      delivered: false,
      preview: true,
    };
  }

  const info = await transport.sendMail({
    from: fromAddress(),
    to,
    subject,
    text,
    html,
    ...(replyTo ? { replyTo } : {}),
  });

  if (!info.accepted?.length) {
    throw new Error("SMTP server did not accept the email recipient.");
  }

  console.log(
    "📧 Email sent to " +
      to +
      " (" +
      info.messageId +
      ")"
  );

  return {
    delivered: true,
    messageId: info.messageId,
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function formatEmailTime(value) {
  const match = String(value ?? "").match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/);
  if (!match) return String(value ?? "");
  const hours = Number(match[1]);
  const minutes = match[2];
  return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? "PM" : "AM"}`;
}

function verificationEmail({ firstName, code }) {
  const name = escapeHtml(firstName || "there");
  const safeCode = escapeHtml(code);

  const text = [
    "Hi " + (firstName || "there") + ",",
    "",
    "Thanks for creating an AveFit account. Enter this code in AveFit to confirm your email address:",
    "",
    code,
    "",
    "This code expires in " +
      (process.env.VERIFICATION_CODE_TTL_MINUTES || 10) +
      " minutes and can only be used once.",
    "If you did not sign up for AveFit you can safely ignore this email.",
    "",
    "Avenue Power & Fitness Gym",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr>
        <td style="background:${BRAND_COLOR};padding:22px 28px;">
          <span style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">AveFit</span>
          <span style="display:block;font-size:12px;color:#ffedd5;margin-top:2px;">Avenue Power &amp; Fitness Gym</span>
        </td>
      </tr>

      <tr>
        <td style="padding:28px;">
          <h1 style="margin:0 0 12px;font-size:20px;font-weight:700;">
            Your AveFit verification code
          </h1>

          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475569;">
            Hi ${name},
          </p>

          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">
            Enter this code in AveFit to confirm your email address and submit your registration
            to the gym administrator for approval.
          </p>

          <p style="margin:0 0 24px;text-align:center;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px;font-size:28px;font-weight:800;letter-spacing:6px;color:${BRAND_COLOR};">
            ${safeCode}
          </p>

          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">
            This code expires in ${
              process.env.VERIFICATION_CODE_TTL_MINUTES || 10
            } minutes and can only be used once. If you did not sign up for AveFit, you can safely ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    text,
    html,
  };
}

async function sendVerificationEmail({ to, firstName, code }) {
  const content = verificationEmail({
    firstName,
    code,
  });

  return sendMail({
    to,
    subject: "Verify your AveFit email address",
    text: content.text,
    html: content.html,
  });
}

async function sendWorkoutPlanReadyEmail({ to, firstName }) {
  const name = escapeHtml(firstName || "there");
  const workoutUrl = `${(process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "")}/user/workout`;
  const text = [
    `Hi ${firstName || "there"},`,
    "",
    "Your Workout Plan is ready. Check your AveFit Page to see your Workout Plan.",
    "",
    `View your workout plan: ${workoutUrl}`,
    "",
    "Avenue Power & Fitness Gym",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr>
        <td style="background:${BRAND_COLOR};padding:22px 28px;">
          <span style="font-size:20px;font-weight:800;color:#ffffff;">AveFit</span>
          <span style="display:block;font-size:12px;color:#ffedd5;margin-top:2px;">Avenue Power &amp; Fitness Gym</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 16px;font-size:16px;">Hi ${name},</p>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">Your Workout Plan is ready. Check your AveFit Page to see your Workout Plan.</p>
          <p style="margin:0 0 20px;">
            <a href="${workoutUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">View my workout plan</a>
          </p>
          <p style="margin:0;font-size:12px;color:#94a3b8;">Avenue Power &amp; Fitness Gym</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return sendMail({
    to,
    subject: "Your Workout Plan is ready",
    text,
    html,
  });
}

async function sendCoachAssignmentEmail({
  to,
  trainerName,
  memberName,
  memberEmail,
  preferredDays,
  preferredWorkoutTime,
  weeklyAvailability = [],
}) {
  const safeTrainerName = escapeHtml(trainerName || "Coach");
  const safeMemberName = escapeHtml(memberName || "A new member");
  const safeMemberEmail = escapeHtml(memberEmail || "");
  const availability = weeklyAvailability.map((slot) => (
    `${slot.day_of_week}: ${formatEmailTime(slot.start_time)}–${formatEmailTime(slot.end_time)}`
  ));
  const safeAvailability = availability.length
    ? availability.map(escapeHtml).join("; ")
    : "";
  const safePreferredDays = escapeHtml(preferredDays?.length ? preferredDays.join(", ") : "Not specified");
  const safePreferredTime = escapeHtml(preferredWorkoutTime || "Flexible");
  const workoutPlansUrl = `${(process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "")}/trainer/workout-plans`;
  const text = [
    `Hi ${trainerName || "Coach"},`,
    "",
    `${memberName || "A new member"} has been assigned to you as their coach.`,
    `Member email: ${memberEmail || "Not provided"}`,
    ...(safeAvailability
      ? [`Weekly availability: ${availability.join("; ")}`]
      : [
        `Preferred workout days: ${preferredDays?.length ? preferredDays.join(", ") : "Not specified"}`,
        `Preferred workout time: ${preferredWorkoutTime || "Flexible"}`,
      ]),
    "",
    "Please review the member's preferences and assign their workout plan.",
    `Open workout plans: ${workoutPlansUrl}`,
    "",
    "Avenue Power & Fitness Gym",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr><td style="background:${BRAND_COLOR};padding:22px 28px;"><span style="font-size:20px;font-weight:800;color:#ffffff;">AveFit</span><span style="display:block;font-size:12px;color:#ffedd5;margin-top:2px;">Avenue Power &amp; Fitness Gym</span></td></tr>
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;font-size:16px;">Hi ${safeTrainerName},</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;"><strong>${safeMemberName}</strong> has been assigned to you as their coach. Please review their preferences and assign a workout plan.</p>
        <p style="margin:0 0 6px;font-size:14px;"><strong>Member:</strong> ${safeMemberName}${safeMemberEmail ? ` (${safeMemberEmail})` : ""}</p>
        ${safeAvailability
          ? `<p style="margin:0 0 20px;font-size:14px;"><strong>Weekly availability:</strong> ${safeAvailability}</p>`
          : `<p style="margin:0 0 6px;font-size:14px;"><strong>Preferred days:</strong> ${safePreferredDays}</p>
        <p style="margin:0 0 20px;font-size:14px;"><strong>Preferred time:</strong> ${safePreferredTime}</p>`}
        <a href="${workoutPlansUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Assign workout plan</a>
      </td></tr>
    </table>
  </body>
</html>`;

  return sendMail({ to, subject: "A new member has been assigned to you as their AveFit coach", text, html });
}

async function sendUserCoachAssignedEmail({ to, firstName, trainerName }) {
  const safeFirstName = escapeHtml(firstName || "there");
  const safeTrainerName = escapeHtml(trainerName || "your new coach");
  const coachesUrl = `${(process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "")}/user/coaches`;
  const text = [
    `Hi ${firstName || "there"},`,
    "",
    `${trainerName || "A new coach"} has been assigned to you.`,
    "You can view your coach's profile in AveFit.",
    `View your coach: ${coachesUrl}`,
    "",
    "Avenue Power & Fitness Gym",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr><td style="background:${BRAND_COLOR};padding:22px 28px;"><span style="font-size:20px;font-weight:800;color:#ffffff;">AveFit</span><span style="display:block;font-size:12px;color:#ffedd5;margin-top:2px;">Avenue Power &amp; Fitness Gym</span></td></tr>
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;font-size:16px;">Hi ${safeFirstName},</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;"><strong>${safeTrainerName}</strong> has been assigned as your coach. You can view your coach's profile in AveFit.</p>
        <a href="${coachesUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">View my coach</a>
      </td></tr>
    </table>
  </body>
</html>`;

  return sendMail({ to, subject: "Your AveFit coach has been assigned", text, html });
}

async function sendNoWorkoutReminderEmail({ to, trainerName, memberName, workoutDate }) {
  const safeTrainerName = escapeHtml(trainerName || "Coach");
  const safeMemberName = escapeHtml(memberName || "A member");
  const safeWorkoutDate = escapeHtml(workoutDate || "tomorrow");
  const workoutPlansUrl = `${(process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "")}/trainer/workout-plans`;
  const text = [
    `Hi ${trainerName || "Coach"},`,
    "",
    `${memberName || "A member"} does not have a workout scheduled for their preferred workout day (${workoutDate || "tomorrow"}).`,
    "Please review their schedule and assign a workout plan.",
    `Open workout plans: ${workoutPlansUrl}`,
    "",
    "Avenue Power & Fitness Gym",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr><td style="background:${BRAND_COLOR};padding:22px 28px;"><span style="font-size:20px;font-weight:800;color:#ffffff;">AveFit</span><span style="display:block;font-size:12px;color:#ffedd5;margin-top:2px;">Avenue Power &amp; Fitness Gym</span></td></tr>
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;font-size:16px;">Hi ${safeTrainerName},</p>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;"><strong>${safeMemberName}</strong> does not have a workout scheduled for their preferred workout day (${safeWorkoutDate}). Please review their schedule and assign a workout plan.</p>
        <a href="${workoutPlansUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Open workout plans</a>
      </td></tr>
    </table>
  </body>
</html>`;

  return sendMail({ to, subject: "A member needs a workout plan", text, html });
}

async function sendWeeklyBmiReminderEmail({ to, firstName }) {
  const name = escapeHtml(firstName || "there");
  const progressUrl = `${(process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "")}/user/progress`;
  const safeProgressUrl = escapeHtml(progressUrl);
  const text = [
    `Hi ${firstName || "there"},`,
    "",
    "It is time for your weekly BMI update. Log your current weight in AveFit to refresh your BMI and progress.",
    "",
    `Update your BMI and progress: ${progressUrl}`,
    "",
    "Avenue Power & Fitness Gym",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr>
        <td style="background:${BRAND_COLOR};padding:22px 28px;">
          <span style="font-size:20px;font-weight:800;color:#ffffff;">AveFit</span>
          <span style="display:block;font-size:12px;color:#ffedd5;margin-top:2px;">Avenue Power &amp; Fitness Gym</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 16px;font-size:16px;">Hi ${name},</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">It is time for your weekly BMI update. Log your current weight in AveFit to refresh your BMI and progress.</p>
          <p style="margin:0 0 20px;">
            <a href="${safeProgressUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Update BMI and progress</a>
          </p>
          <p style="margin:0;font-size:12px;color:#94a3b8;">Avenue Power &amp; Fitness Gym</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return sendMail({
    to,
    subject: "Your weekly AveFit BMI update",
    text,
    html,
  });
}

async function sendPasswordChangeVerificationEmail({ to, firstName, code }) {
  const name = escapeHtml(firstName || "there");
  const safeCode = escapeHtml(code);
  const text = [
    `Hi ${firstName || "there"},`,
    "",
    "Use this code to change your AveFit account password:",
    "",
    code,
    "",
    `This code expires in ${VERIFICATION_CODE_TTL_MINUTES} minutes and can only be used once.`,
    "If you did not request a password change, you can ignore this email.",
    "",
    "Avenue Power & Fitness Gym",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr>
        <td style="background:${BRAND_COLOR};padding:22px 28px;">
          <span style="font-size:20px;font-weight:800;color:#ffffff;">AveFit</span>
          <span style="display:block;font-size:12px;color:#ffedd5;margin-top:2px;">Avenue Power &amp; Fitness Gym</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 16px;font-size:16px;">Hi ${name},</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">Use this verification code to change your AveFit account password:</p>
          <p style="margin:0 0 24px;text-align:center;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px;font-size:28px;font-weight:800;letter-spacing:6px;color:${BRAND_COLOR};">${safeCode}</p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">This code expires in ${VERIFICATION_CODE_TTL_MINUTES} minutes and can only be used once. If you did not request a password change, you can ignore this email.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return sendMail({
    to,
    subject: "Verify your AveFit password change",
    text,
    html,
  });
}

async function sendAdminPasswordResetEmail({ to, firstName, token, expiresInMinutes }) {
  const name = escapeHtml(firstName || "there");
  const resetUrl = `${(process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "")}/admin/reset-password?token=${encodeURIComponent(token)}`;
  const safeResetUrl = escapeHtml(resetUrl);
  const text = [
    `Hi ${firstName || "there"},`,
    "",
    "A password reset was requested for your AveFit administrator account.",
    "Use this secure, one-time link to choose a new password:",
    resetUrl,
    "",
    `This link expires in ${expiresInMinutes} minutes. If you did not request this change, you can ignore this email.`,
    "",
    "Avenue Power & Fitness Gym",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr>
        <td style="background:${BRAND_COLOR};padding:22px 28px;">
          <span style="font-size:20px;font-weight:800;color:#ffffff;">AveFit</span>
          <span style="display:block;font-size:12px;color:#ffedd5;margin-top:2px;">Avenue Power &amp; Fitness Gym</span>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 16px;font-size:16px;">Hi ${name},</p>
          <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">A password reset was requested for your administrator account.</p>
          <p style="margin:0 0 24px;">
            <a href="${safeResetUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Reset admin password</a>
          </p>
          <p style="margin:0;font-size:12px;line-height:1.6;color:#94a3b8;">This one-time link expires in ${expiresInMinutes} minutes. If you did not request this change, ignore this email.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return sendMail({
    to,
    subject: "Reset your AveFit admin password",
    text,
    html,
  });
}

async function sendAccountPasswordChangedEmail({ to, accountName, accountType }) {
  const safeName = escapeHtml(accountName || "there");
  const safeAccountType = accountType === "coach" ? "coach" : "member";
  const text = [
    `Hi ${accountName || "there"},`,
    "",
    `The password for your AveFit ${safeAccountType} account was changed by the gym administrator.`,
    "For your security, the new password is not included in this email.",
    "",
    "If you did not expect this change, contact the gym administrator immediately.",
    "",
    "Avenue Power & Fitness Gym",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr>
        <td style="background:${BRAND_COLOR};padding:22px 28px;color:#ffffff;">
          <strong style="font-size:20px;">AveFit account security</strong>
        </td>
      </tr>
      <tr>
        <td style="padding:28px;">
          <p style="margin:0 0 16px;font-size:16px;">Hi ${safeName},</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">The password for your AveFit ${safeAccountType} account was changed by the gym administrator. For your security, the new password is not included in this email.</p>
          <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">If you did not expect this change, contact the gym administrator immediately.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return sendMail({
    to,
    subject: "Your AveFit account password was changed",
    text,
    html,
  });
}

async function sendExperienceLevelChangedEmail({ to, memberName, previousLevel, newLevel }) {
  const safeName = escapeHtml(memberName || "AveFit member");
  const safePreviousLevel = escapeHtml(previousLevel || "unspecified");
  const safeNewLevel = escapeHtml(newLevel);
  const frequencyGuidance = {
    Beginner: "2–3 days per week",
    Intermediate: "3–5 days per week",
    Advanced: "4–6 days per week",
  }[newLevel];
  const text = [
    `Hi ${memberName || "there"},`,
    "",
    `Your coach updated your AveFit experience level from ${previousLevel || "unspecified"} to ${newLevel}.`,
    `The recommended workout frequency for this level is ${frequencyGuidance}.`,
    "Review your weekly availability and workout frequency in your profile.",
    "",
    "AveFit Administration",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr><td style="background:${BRAND_COLOR};padding:22px 28px;color:#fff;"><strong style="font-size:20px;">AveFit training update</strong></td></tr>
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;font-size:16px;">Hi ${safeName},</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">Your coach updated your experience level from <strong>${safePreviousLevel}</strong> to <strong>${safeNewLevel}</strong>.</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">The recommended workout frequency for this level is ${frequencyGuidance}.</p>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#475569;">Review your weekly availability and workout frequency in your profile.</p>
      </td></tr>
    </table>
  </body>
</html>`;
  return sendMail({
    to,
    subject: "Your AveFit experience level was updated",
    text,
    html,
  });
}

async function sendMemberFeedbackEmail({ to, memberName, memberEmail, rating, message }) {
  const safeName = escapeHtml(memberName);
  const safeEmail = escapeHtml(memberEmail);
  const safeMessage = escapeHtml(message);
  const text = [
    "New member feedback received through AveFit.",
    "",
    `Member: ${memberName}`,
    `Member email: ${memberEmail}`,
    `Rating: ${rating}/5`,
    "",
    "Feedback:",
    message,
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr><td style="background:${BRAND_COLOR};padding:22px 28px;"><span style="font-size:20px;font-weight:800;color:#ffffff;">AveFit feedback</span></td></tr>
      <tr><td style="padding:28px;">
        <p style="margin:0 0 8px;font-size:14px;"><strong>Member:</strong> ${safeName}</p>
        <p style="margin:0 0 8px;font-size:14px;"><strong>Email:</strong> ${safeEmail}</p>
        <p style="margin:0 0 20px;font-size:14px;"><strong>Rating:</strong> ${rating}/5</p>
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;">Feedback</p>
        <p style="margin:0;white-space:pre-wrap;font-size:14px;line-height:1.6;color:#475569;">${safeMessage}</p>
      </td></tr>
    </table>
  </body>
</html>`;

  return sendMail({
    to,
    replyTo: memberEmail,
    subject: `AveFit member feedback (${rating}/5)`,
    text,
    html,
  });
}

async function sendNewUserRegistrationEmail({ to, memberName, memberEmail, phone }) {
  const safeName = escapeHtml(memberName || "AveFit member");
  const safeEmail = escapeHtml(memberEmail);
  const safePhone = escapeHtml(phone || "Not provided");
  const text = [
    "A new user registered for AveFit and is awaiting review.",
    "",
    `Name: ${memberName || "AveFit member"}`,
    `Email: ${memberEmail}`,
    `Phone: ${phone || "Not provided"}`,
    "",
    "Sign in to AveFit and open Members to review the registration.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr><td style="background:${BRAND_COLOR};padding:22px 28px;color:#fff;"><strong style="font-size:20px;">New AveFit registration</strong></td></tr>
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">A new user registered and is awaiting review.</p>
        <p style="margin:0 0 8px;font-size:14px;"><strong>Name:</strong> ${safeName}</p>
        <p style="margin:0 0 8px;font-size:14px;"><strong>Email:</strong> ${safeEmail}</p>
        <p style="margin:0 0 20px;font-size:14px;"><strong>Phone:</strong> ${safePhone}</p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">Sign in to AveFit and open Members to review the registration.</p>
      </td></tr>
    </table>
  </body>
</html>`;

  return sendMail({
    to,
    subject: "A new user registered for AveFit",
    text,
    html,
  });
}

function formatProfileChanges(changes = {}) {
  return Object.entries(changes)
    .map(([key]) => {
      const label = key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
      return { label };
    });
}

async function sendProfileChangeRequestEmail({ to, memberName, memberEmail, requestType, changes }) {
  const safeName = escapeHtml(memberName || "AveFit member");
  const safeEmail = escapeHtml(memberEmail);
  const isPassword = requestType === "password";
  const entries = formatProfileChanges(changes);
  const lines = isPassword
    ? ["Password change requested."]
    : entries.map(({ label }) => `${label} update requested`);
  const text = [
    "A member submitted a profile change request that needs your review.",
    "",
    `Member: ${memberName || "AveFit member"}`,
    `Email: ${memberEmail}`,
    "",
    ...lines,
    "",
    "Sign in to AveFit and open Members to approve or reject this request.",
  ].join("\n");
  const detailsHtml = isPassword
    ? "<p style=\"margin:0;font-size:14px;line-height:1.6;\">Password change requested. The new password is not included in this email.</p>"
    : `<ul style="padding-left:20px;line-height:1.7;">${entries.map(({ label }) => `<li>${escapeHtml(label)} update requested</li>`).join("")}</ul>`;
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr><td style="background:${BRAND_COLOR};padding:22px 28px;color:#fff;"><strong style="font-size:20px;">AveFit change request</strong></td></tr>
      <tr><td style="padding:28px;">
        <p style="margin:0 0 8px;font-size:14px;"><strong>Member:</strong> ${safeName}</p>
        <p style="margin:0 0 20px;font-size:14px;"><strong>Email:</strong> ${safeEmail}</p>
        ${detailsHtml}
        <p style="margin:20px 0 0;font-size:13px;line-height:1.6;color:#64748b;">Sign in to AveFit and open Members to approve or reject this request.</p>
      </td></tr>
    </table>
  </body>
</html>`;

  return sendMail({
    to,
    subject: `AveFit ${isPassword ? "password" : "profile"} change request`,
    text,
    html,
  });
}

async function sendProfileChangeDecisionEmail({ to, memberName, requestType, approved, emailVerificationRequired }) {
  const safeName = escapeHtml(memberName || "there");
  const isPassword = requestType === "password";
  const decision = approved ? "approved" : "rejected";
  const verificationUrl = `${(process.env.CLIENT_URL || "http://localhost:5173").replace(/\/+$/, "")}/user/verify-email`;
  const safeVerificationUrl = escapeHtml(verificationUrl);
  const text = [
    `Hi ${memberName || "there"},`,
    "",
    `Your AveFit ${isPassword ? "password" : "profile"} change request was ${decision}.`,
    ...(approved && isPassword
      ? ["Your new password is now active. Please sign in again using it."]
      : approved
        ? ["Your requested changes are now active."]
        : []),
    ...(approved && emailVerificationRequired ? ["", "Your new email address must be verified before you can continue using AveFit. Visit this page and request a verification code:", verificationUrl] : []),
    ...(!approved ? ["Your account settings have not been changed. Contact the gym if you need assistance."] : []),
    "",
    "Avenue Power & Fitness Gym",
  ].join("\n");
  const body = !approved
    ? "<p style=\"margin:0;font-size:14px;line-height:1.6;\">Your account settings have not been changed. Contact the gym if you need assistance.</p>"
    : isPassword
      ? "<p style=\"margin:0;font-size:14px;line-height:1.6;\">Your new password is now active. Please sign in again using it.</p>"
      : "<p style=\"margin:0;font-size:14px;line-height:1.6;\">Your requested profile changes are now active.</p>";
  const verificationHtml = approved && emailVerificationRequired
    ? `<p style="margin:20px 0 0;font-size:14px;line-height:1.6;">Your new email address must be verified before you can continue using AveFit. <a href="${safeVerificationUrl}" style="color:${BRAND_COLOR};font-weight:700;">Verify your email address</a> and request a verification code.</p>`
    : "";
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr><td style="background:${BRAND_COLOR};padding:22px 28px;color:#fff;"><strong style="font-size:20px;">AveFit account update</strong></td></tr>
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;font-size:16px;">Hi ${safeName},</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.6;">Your AveFit ${isPassword ? "password" : "profile"} change request was <strong>${decision}</strong>.</p>
        ${body}
        ${verificationHtml}
      </td></tr>
    </table>
  </body>
</html>`;

  return sendMail({
    to,
    subject: `Your AveFit ${isPassword ? "password" : "profile"} change request was ${decision}`,
    text,
    html,
  });
}

async function sendMemberAccountDecisionEmail({ to, memberName, approved, deactivated = false }) {
  const safeName = escapeHtml(memberName || "there");
  const decision = approved ? "approved" : deactivated ? "deactivated" : "rejected";
  const text = [
    `Hi ${memberName || "there"},`,
    "",
    approved
      ? "Your AveFit account has been approved. You can now sign in and use your account."
      : deactivated
        ? "Your AveFit account has been deactivated by the gym administrator. Please contact the gym if you need assistance."
        : "Your AveFit account application was rejected. Please contact the gym if you need assistance.",
    "",
    "Avenue Power & Fitness Gym",
  ].join("\n");
  const body = approved
    ? "Your AveFit account has been approved. You can now sign in and use your account."
    : deactivated
      ? "Your AveFit account has been deactivated by the gym administrator. Please contact the gym if you need assistance."
      : "Your AveFit account application was rejected. Please contact the gym if you need assistance.";
  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
      <tr><td style="background:${BRAND_COLOR};padding:22px 28px;color:#fff;"><strong style="font-size:20px;">AveFit account update</strong></td></tr>
      <tr><td style="padding:28px;">
        <p style="margin:0 0 16px;font-size:16px;">Hi ${safeName},</p>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.6;">Your AveFit account status is <strong>${decision}</strong>.</p>
        <p style="margin:0;font-size:14px;line-height:1.6;">${escapeHtml(body)}</p>
      </td></tr>
    </table>
  </body>
</html>`;
  return sendMail({
    to,
    subject: `Your AveFit account was ${decision}`,
    text,
    html,
  });
}

module.exports = {
  isMailConfigured,
  sendMail,
  sendVerificationEmail,
  sendWorkoutPlanReadyEmail,
  sendCoachAssignmentEmail,
  formatEmailTime,
  sendUserCoachAssignedEmail,
  sendNoWorkoutReminderEmail,
  sendWeeklyBmiReminderEmail,
  sendPasswordChangeVerificationEmail,
  sendAdminPasswordResetEmail,
  sendAccountPasswordChangedEmail,
  sendExperienceLevelChangedEmail,
  sendMemberFeedbackEmail,
  sendNewUserRegistrationEmail,
  sendProfileChangeRequestEmail,
  sendProfileChangeDecisionEmail,
  sendMemberAccountDecisionEmail,
};
