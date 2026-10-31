const db = require("../db");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { validateEmail, validatePassword, normalizeEmail } = require("../utils/security");
const { getConfiguredAdminEmail } = require("../utils/adminAccess");
const { hashVerificationToken } = require("../utils/emailVerification");
const { isMailConfigured, sendAdminPasswordResetEmail } = require("../utils/mailer");

const PASSWORD_RESET_TTL_MINUTES = 30;
const PASSWORD_RESET_MESSAGE = "If the email matches the configured admin account, a password reset link has been sent.";

const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!validateEmail(email) || typeof password !== "string" || password.length === 0)
      return res.status(400).json({ success: false, message: "Please provide a valid email and password." });

    const adminEmail = getConfiguredAdminEmail();
    if (!adminEmail) {
      console.error("Admin login is disabled because ADMIN_EMAIL is not configured with a valid email address.");
      return res.status(503).json({ success: false, message: "Admin access is not configured. Contact the system administrator." });
    }
    if (normalizeEmail(email) !== adminEmail) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const result = await db.query(
      "SELECT admin_id, full_name, email, password, role, photo_url, account_status, token_version FROM admins WHERE LOWER(email) = $1",
      [adminEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const admin = result.rows[0];

    // Column is "password" (not password_hash)
    if (String(admin.account_status || "Active").toLowerCase() !== "active")
      return res.status(403).json({ success: false, message: "This admin account is inactive." });

    const validPassword = await bcrypt.compare(password, admin.password);

    if (!validPassword) {
      return res.status(401).json({ success: false, message: "Invalid email or password." });
    }

    const token = jwt.sign(
      { admin_id: admin.admin_id, email: admin.email, role: admin.role, token_version: Number(admin.token_version || 0) },
      process.env.JWT_SECRET,
      { expiresIn: "72h" }
    );

    res.json({
      success: true,
      message: "Login successful.",
      token,
      admin: {
        id: admin.admin_id,
        name: admin.full_name,
        email: admin.email,
        role: admin.role,
        photo_url: admin.photo_url,
      },
    });
  } catch (error) {
    console.error("loginAdmin error:", error.message);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const requestAdminPasswordReset = async (req, res) => {
  const configuredEmail = getConfiguredAdminEmail();
  if (!configuredEmail) {
    return res.status(503).json({
      success: false,
      message: "Admin access is not configured. Contact the system administrator.",
    });
  }

  const requestedEmail = normalizeEmail(req.body?.email);
  if (!validateEmail(requestedEmail) || requestedEmail !== configuredEmail) {
    return res.json({ success: true, message: PASSWORD_RESET_MESSAGE });
  }

  if (!isMailConfigured()) {
    return res.status(503).json({
      success: false,
      message: "Admin password reset email is unavailable because SMTP is not configured on the server.",
    });
  }

  const adminResult = await db.query(
    `SELECT admin_id, full_name, email
     FROM admins
     WHERE LOWER(email) = $1 AND LOWER(COALESCE(account_status, 'Active')) = 'active'`,
    [configuredEmail]
  );
  const admin = adminResult.rows[0];
  if (!admin) {
    return res.json({ success: true, message: PASSWORD_RESET_MESSAGE });
  }

  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashVerificationToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
  await db.query(
    `UPDATE admins
     SET password_reset_token_hash = $1, password_reset_expires_at = $2
     WHERE admin_id = $3`,
    [tokenHash, expiresAt, admin.admin_id]
  );

  try {
    await sendAdminPasswordResetEmail({
      to: admin.email,
      firstName: admin.full_name,
      token,
      expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
    });
    return res.json({ success: true, message: PASSWORD_RESET_MESSAGE });
  } catch (error) {
    await db.query(
      `UPDATE admins
       SET password_reset_token_hash = NULL, password_reset_expires_at = NULL
       WHERE admin_id = $1 AND password_reset_token_hash = $2`,
      [admin.admin_id, tokenHash]
    );
    console.error("requestAdminPasswordReset email error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to send the admin password reset email. Please try again later.",
    });
  }
};

const resetAdminPassword = async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== "string" || token.length < 32 || !validatePassword(password)) {
    return res.status(400).json({
      success: false,
      message: "The reset link is invalid or expired, or the password does not meet the requirements.",
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `UPDATE admins
       SET password = $1,
           password_reset_token_hash = NULL,
           password_reset_expires_at = NULL,
           token_version = COALESCE(token_version, 0) + 1,
           updated_at = NOW()
       WHERE password_reset_token_hash = $2
         AND password_reset_expires_at > NOW()
         AND LOWER(COALESCE(account_status, 'Active')) = 'active'
       RETURNING admin_id`,
      [passwordHash, hashVerificationToken(token)]
    );

    if (!result.rowCount) {
      return res.status(400).json({
        success: false,
        message: "This reset link is invalid, expired, or has already been used. Request a new link.",
      });
    }
    return res.json({ success: true, message: "Admin password updated. Sign in with your new password." });
  } catch (error) {
    console.error("resetAdminPassword error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Unable to reset the admin password. Please try again.",
    });
  }
};

module.exports = { loginAdmin, requestAdminPasswordReset, resetAdminPassword };