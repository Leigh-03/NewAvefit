const bcrypt = require("bcrypt");
const crypto = require("crypto");
const pool = require("../db");
const { normalizeEmail } = require("../utils/security");
const {
  hashVerificationCode,
} = require("../utils/emailVerification");
const {
  sendProfileChangeRequestEmail,
  sendProfileChangeDecisionEmail,
  sendAccountPasswordChangedEmail,
} = require("../utils/mailer");
const { getConfiguredAdminEmail } = require("../utils/adminAccess");
const { createNotification, notifyAdmins } = require("../utils/notifications");

const PROFILE_FIELDS = {
  first_name: "first_name",
  last_name: "last_name",
  email: "email",
  phone: "phone",
  gender: "gender",
  birth_date: "birth_date",
  age: "age",
  height: "height",
  weight: "weight",
  fitness_goal: "fitness_goal",
  activity_level: "activity_level",
  target_weight: "target_weight",
  workout_days_per_week: "workout_days_per_week",
  workout_duration: "workout_duration",
  preferred_days: "preferred_days",
  preferred_workout_time: "preferred_workout_time",
  intensity: "intensity",
  injuries: "injuries",
  health_conditions: "health_conditions",
  profile_image: "profile_image",
};

const DAY_NAMES = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);

const sanitizePayload = (payload = {}) => {
  const result = { ...payload };
  if (Object.prototype.hasOwnProperty.call(result, "profile_image")) {
    delete result.profile_image;
    result.profile_photo_changed = true;
  }
  return result;
};

const buildProfileChangePayload = (current, body) => {
  const payload = {};

  for (const [field, column] of Object.entries(PROFILE_FIELDS)) {
    if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
    let value = body[field];

    if (field === "first_name" || field === "last_name") {
      value = String(value).trim();
    } else if (field === "email") {
      value = normalizeEmail(value);
    } else if (field === "preferred_days") {
      if (!Array.isArray(value) || value.some((day) => !DAY_NAMES.has(String(day).toLowerCase()))) {
        const error = new Error("Choose valid preferred workout days.");
        error.status = 400;
        throw error;
      }
      value = [...new Set(value.map((day) => (
        String(day).charAt(0).toUpperCase() + String(day).slice(1).toLowerCase()
      )))];
    } else if (field === "workout_duration" && value !== null && value !== "") {
      const match = String(value).match(/\d+/);
      if (!match) {
        const error = new Error("Choose a valid workout duration.");
        error.status = 400;
        throw error;
      }
      value = Number(match[0]);
    } else if (["height", "weight", "age", "target_weight", "workout_days_per_week"].includes(field)) {
      if (value === "" || value === null) {
        value = null;
      } else {
        value = Number(value);
        if (!Number.isFinite(value) || value <= 0) {
          const error = new Error(`${field.replaceAll("_", " ")} must be a positive number.`);
          error.status = 400;
          throw error;
        }
      }
    } else if (value === "") {
      value = null;
    }

    const existing = current[column];
    const numericField = ["height", "weight", "age", "target_weight", "workout_days_per_week", "workout_duration"].includes(field);
    const unchanged = Array.isArray(value) || Array.isArray(existing)
      ? JSON.stringify(value ?? null) === JSON.stringify(existing ?? null)
      : numericField && value !== null && existing !== null && value !== "" && existing !== ""
        ? Number(value) === Number(existing)
        : String(value ?? "") === String(existing ?? "");
    if (!unchanged) payload[field] = value;
  }

  return payload;
};

const notifyRequest = async ({ request, user, changes }) => {
  const memberName = `${user.first_name || ""} ${user.last_name || ""}`.trim() || "AveFit member";
  const adminEmail = getConfiguredAdminEmail();
  let emailSent = false;

  if (adminEmail) {
    try {
      const result = await sendProfileChangeRequestEmail({
        to: adminEmail,
        memberName,
        memberEmail: user.email,
        requestType: request.request_type,
        changes,
      });
      emailSent = result.delivered;
    } catch (err) {
      console.error("Profile change request email failed:", err.message);
    }
  } else {
    console.error("Profile change request email was not sent because ADMIN_EMAIL is not configured.");
  }

  try {
    await notifyAdmins({
      message: `${memberName} submitted a ${request.request_type === "password" ? "password" : "profile"} change request for review.`,
      notificationType: "profile_change",
      userName: memberName,
      targetUrl: "/admin/members",
    });
  } catch (err) {
    console.error("Profile change admin notification failed:", err.message);
  }

  return {
    emailSent,
    request: {
      request_id: request.request_id,
      request_type: request.request_type,
      status: request.status,
      payload: sanitizePayload(changes),
      created_at: request.created_at,
    },
  };
};

const createProfileChangeRequest = async ({ userId, payload }) => {
  if (!payload || Object.keys(payload).length === 0) {
    const error = new Error("There are no profile changes to submit.");
    error.status = 400;
    throw error;
  }

  const userResult = await pool.query(
    `SELECT user_id, first_name, last_name, email
     FROM users
     WHERE user_id = $1 AND LOWER(COALESCE(account_status, 'pending')) = 'active'`,
    [userId]
  );
  if (!userResult.rowCount) {
    const error = new Error("An active member account is required to request profile changes.");
    error.status = 403;
    throw error;
  }

  const user = userResult.rows[0];
  if (payload.email && payload.email !== user.email) {
    const duplicateEmail = await pool.query(
      "SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND user_id <> $2",
      [payload.email, userId]
    );
    if (duplicateEmail.rowCount) {
      const error = new Error("That email address is already in use.");
      error.status = 409;
      throw error;
    }
  }

  let inserted;
  try {
    inserted = await pool.query(
      `INSERT INTO user_profile_change_requests (user_id, request_type, payload)
       VALUES ($1, 'profile', $2::jsonb)
       RETURNING request_id, request_type, status, created_at`,
      [userId, JSON.stringify(payload)]
    );
  } catch (err) {
    if (err.code === "23505") {
      const conflict = new Error("You already have a profile change request awaiting admin review.");
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  }

  return notifyRequest({
    request: inserted.rows[0],
    user,
    changes: payload,
  });
};

const submitPasswordChangeRequest = async ({ userId, code, password }) => {
  const client = await pool.connect();
  let request;
  let user;

  try {
    await client.query("BEGIN");
    const result = await client.query(
      `SELECT user_id, first_name, last_name, email,
              password_change_code_hash,
              password_change_code_expires_at > NOW() AS code_valid
       FROM users
       WHERE user_id = $1
       FOR UPDATE`,
      [userId]
    );
    if (!result.rowCount || !result.rows[0].password_change_code_hash) {
      const error = new Error("Request a password-change verification code first.");
      error.status = 400;
      throw error;
    }

    user = result.rows[0];
    if (!user.code_valid) {
      const error = new Error("This verification code has expired. Request a new one.");
      error.status = 400;
      throw error;
    }

    const submittedHash = Buffer.from(hashVerificationCode(code), "hex");
    const storedHash = Buffer.from(user.password_change_code_hash, "hex");
    if (submittedHash.length !== storedHash.length || !crypto.timingSafeEqual(submittedHash, storedHash)) {
      const error = new Error("The verification code is incorrect.");
      error.status = 400;
      throw error;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const inserted = await client.query(
      `INSERT INTO user_profile_change_requests (user_id, request_type, password_hash)
       VALUES ($1, 'password', $2)
       RETURNING request_id, request_type, status, created_at`,
      [userId, passwordHash]
    );
    request = inserted.rows[0];

    await client.query(
      `UPDATE users
       SET password_change_code_hash = NULL,
           password_change_code_expires_at = NULL,
           password_change_code_sent_at = NULL
       WHERE user_id = $1`,
      [userId]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      const conflict = new Error("You already have a password change request awaiting admin review.");
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  } finally {
    client.release();
  }

  return notifyRequest({
    request,
    user,
    changes: {},
  });
};

const getUserChangeRequests = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT request_id, request_type, status, payload, created_at, reviewed_at
       FROM user_profile_change_requests
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [req.user.user_id]
    );
    res.json({
      success: true,
      data: result.rows.map((request) => ({
        ...request,
        payload: sanitizePayload(request.payload || {}),
      })),
    });
  } catch (err) {
    console.error("getUserChangeRequests error:", err.message);
    res.status(500).json({ success: false, message: "Unable to load your change requests." });
  }
};

const getAdminChangeRequests = async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.request_id, r.user_id, r.request_type, r.status, r.payload,
              r.created_at, u.first_name, u.last_name, u.email, u.phone,
              u.gender, u.birth_date, u.age, u.height, u.weight,
              u.fitness_goal, u.activity_level, u.target_weight,
              u.workout_days_per_week, u.workout_duration, u.preferred_days,
              u.preferred_workout_time, u.intensity, u.injuries,
              u.health_conditions,
              (u.profile_image IS NOT NULL AND u.profile_image <> '') AS has_profile_image
       FROM user_profile_change_requests r
       JOIN users u ON u.user_id = r.user_id
       WHERE r.status = 'Pending'
       ORDER BY r.created_at ASC`
    );
    res.json({
      success: true,
      data: result.rows.map((request) => {
        const payload = sanitizePayload(request.payload || {});
        const currentValues = {};
        for (const key of Object.keys(payload)) {
          currentValues[key] = key === "profile_photo_changed"
            ? Boolean(request.has_profile_image)
            : request[key];
        }
        return {
          ...request,
          member_name: `${request.first_name || ""} ${request.last_name || ""}`.trim(),
          payload,
          current_values: currentValues,
        };
      }),
    });
  } catch (err) {
    console.error("getAdminChangeRequests error:", err.message);
    res.status(500).json({ success: false, message: "Unable to load member change requests." });
  }
};

const reviewChangeRequest = async (req, res) => {
  const decision = req.params.decision;
  if (!["approve", "reject"].includes(decision)) {
    return res.status(400).json({ success: false, message: "Choose approve or reject." });
  }

  const client = await pool.connect();
  let decisionData;
  try {
    await client.query("BEGIN");
    const requestResult = await client.query(
      `SELECT r.request_id, r.user_id, r.request_type, r.status, r.payload, r.password_hash,
              u.first_name, u.last_name, u.email, u.phone, u.gender, u.age, u.height,
              u.weight, u.fitness_goal, u.trainer_id
       FROM user_profile_change_requests r
       JOIN users u ON u.user_id = r.user_id
       WHERE r.request_id = $1
       FOR UPDATE OF r, u`,
      [req.params.requestId]
    );
    if (!requestResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "Change request not found." });
    }

    const request = requestResult.rows[0];
    if (request.status !== "Pending") {
      await client.query("ROLLBACK");
      return res.status(409).json({ success: false, message: "This change request has already been reviewed." });
    }

    const payload = request.payload || {};
    const oldEmail = request.email;
    const nextEmail = payload.email || oldEmail;
    const emailChanged = nextEmail.toLowerCase() !== oldEmail.toLowerCase();
    if (decision === "approve" && request.request_type === "profile") {
      if (emailChanged) {
        const duplicate = await client.query(
          "SELECT 1 FROM users WHERE LOWER(email) = LOWER($1) AND user_id <> $2",
          [nextEmail, request.user_id]
        );
        if (duplicate.rowCount) {
          await client.query("ROLLBACK");
          return res.status(409).json({ success: false, message: "The requested email is now in use. Ask the member to submit a new request." });
        }
      }

      const assignments = [];
      const values = [];
      for (const [field, column] of Object.entries(PROFILE_FIELDS)) {
        if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
        values.push(payload[field]);
        assignments.push(`${column} = $${values.length}`);
      }
      if (emailChanged) {
        assignments.push("email_verified = FALSE", "email_verified_at = NULL", "verification_token_hash = NULL", "verification_token_expires_at = NULL", "verification_sent_at = NULL");
      }
      assignments.push("updated_at = NOW()");
      values.push(request.user_id);
      await client.query(
        `UPDATE users SET ${assignments.join(", ")} WHERE user_id = $${values.length}`,
        values
      );

      const valueFor = (field, existing) => (
        Object.prototype.hasOwnProperty.call(payload, field) ? payload[field] : existing
      );
      const updatedProfile = {
        first_name: valueFor("first_name", request.first_name),
        last_name: valueFor("last_name", request.last_name),
        email: nextEmail,
        phone: valueFor("phone", request.phone),
        gender: valueFor("gender", request.gender),
        age: valueFor("age", request.age),
        height: valueFor("height", request.height),
        weight: valueFor("weight", request.weight),
        fitness_goal: valueFor("fitness_goal", request.fitness_goal),
        trainer_id: request.trainer_id,
      };
      const bmi = Number(updatedProfile.height) > 0 && Number(updatedProfile.weight) > 0
        ? Number((Number(updatedProfile.weight) / ((Number(updatedProfile.height) / 100) ** 2)).toFixed(2))
        : null;
      await client.query(
        `UPDATE members
         SET full_name = $1, email = $2, phone = $3, gender = $4, age = $5,
             height = $6, weight = $7, bmi = $8, fitness_goal = $9,
             trainer_id = COALESCE($10, trainer_id)
         WHERE LOWER(email) = LOWER($11)`,
        [
          `${updatedProfile.first_name || ""} ${updatedProfile.last_name || ""}`.trim(),
          updatedProfile.email,
          updatedProfile.phone,
          updatedProfile.gender,
          updatedProfile.age,
          updatedProfile.height,
          updatedProfile.weight,
          bmi,
          updatedProfile.fitness_goal,
          updatedProfile.trainer_id,
          oldEmail,
        ]
      );
    } else if (decision === "approve" && request.request_type === "password") {
      if (!request.password_hash) {
        throw new Error("The password change request has no staged password.");
      }
      await client.query(
        `UPDATE users
         SET password = $1,
             token_version = token_version + 1,
             updated_at = NOW()
         WHERE user_id = $2`,
        [request.password_hash, request.user_id]
      );
    }

    const updated = await client.query(
      `UPDATE user_profile_change_requests
       SET status = $1, password_hash = NULL, reviewed_by = $2, reviewed_at = NOW()
       WHERE request_id = $3 AND status = 'Pending'
       RETURNING request_id`,
      [decision === "approve" ? "Approved" : "Rejected", req.admin.admin_id, request.request_id]
    );
    if (!updated.rowCount) {
      throw new Error("This change request has already been reviewed.");
    }
    await client.query("COMMIT");
    decisionData = { request, approved: decision === "approve", emailChanged };
  } catch (err) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return res.status(409).json({ success: false, message: "A member with the requested email already exists." });
    }
    console.error("reviewChangeRequest transaction failed:", err.message);
    return res.status(500).json({ success: false, message: "Unable to review this change request." });
  } finally {
    client.release();
  }

  const { request, approved, emailChanged } = decisionData;
  const memberName = `${request.first_name || ""} ${request.last_name || ""}`.trim() || "AveFit member";
  const recipients = new Set([request.email]);
  if (approved && emailChanged) recipients.add(request.payload.email);
  let emailSent = true;
  for (const recipient of recipients) {
    try {
      const delivery = approved && request.request_type === "password"
        ? await sendAccountPasswordChangedEmail({
          to: recipient,
          accountName: memberName,
          accountType: "user",
        })
        : await sendProfileChangeDecisionEmail({
          to: recipient,
          memberName,
          requestType: request.request_type,
          approved,
          emailVerificationRequired: approved && emailChanged && recipient === request.payload.email,
        });
      emailSent = emailSent && delivery.delivered;
    } catch (err) {
      emailSent = false;
      console.error(`Change request decision email failed for ${recipient}:`, err.message);
    }
  }

  try {
    await createNotification({
      audience: "user",
      recipientId: request.user_id,
      message: approved
        ? `Your ${request.request_type === "password" ? "password" : "profile"} change request was approved.`
        : `Your ${request.request_type === "password" ? "password" : "profile"} change request was not approved.`,
      notificationType: "profile_change",
      userName: memberName,
      targetUrl: "/user/profile",
    });
  } catch (err) {
    console.error("Change request decision notification failed:", err.message);
  }

  return res.json({
    success: true,
    email_sent: emailSent,
    message: emailSent
      ? `Change request ${approved ? "approved" : "rejected"} and the member was emailed.`
      : `Change request ${approved ? "approved" : "rejected"}, but the decision email could not be delivered.`,
  });
};

module.exports = {
  buildProfileChangePayload,
  createProfileChangeRequest,
  submitPasswordChangeRequest,
  getUserChangeRequests,
  getAdminChangeRequests,
  reviewChangeRequest,
};
