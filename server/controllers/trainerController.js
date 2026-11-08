const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const loadExerciseCatalog = require("../utils/exerciseCatalog");
const { createNotification } = require("../utils/notifications");
const { getExperienceRange } = require("./userWorkoutAvailabilityController");
const {
  sendWorkoutPlanReadyEmail,
  sendMemberWorkoutPlanEmail,
  sendAccountPasswordChangedEmail,
  sendCoachAccountStatusEmail,
  sendCoachAccountUpdatedEmail,
  sendWorkoutPlanDeletionDecisionEmail,
} = require("../utils/mailer");
const { deliverCoachEmail } = require("../utils/coachEmailNotifications");
const { getCapacityStatus } = require("../utils/coachAssignment");
const { getWorkoutGoalRules, isWorkoutDoseAllowed } = require("../utils/workoutGoalRules");
const {
  TRAINING_PROGRAMS,
  exerciseMatchesProgram,
  getProgramForDate,
  requiresConservativeWorkout,
} = require("../utils/trainingPrograms");

const deliverWorkoutPlanEmail = async (details, context) => {
  try {
    const result = await sendMemberWorkoutPlanEmail(details);
    if (!result.delivered) {
      console.warn(`${context} email not delivered because SMTP is not configured.`);
    }
  } catch (emailError) {
    console.error(`${context} email failed:`, emailError.message);
  }
};

const {
  validateEmail,
  validatePassword,
  validateName,
  validateImageDataUrl,
  normalizeEmail,
} = require("../utils/security");

const GOAL_SPECIALTIES = [
  "Weight Loss",
  "Gain Weight",
  "Muscle Gain",
  "Maintain Weight",
  "General Fitness",
];
const DEFAULT_WORKOUT_SESSION_DURATION = 60;
const formatWorkoutPlanName = (firstName, lastName, trainingProgram) => {
  const memberName = `${String(firstName || "").trim()} ${String(lastName || "").trim()}`.trim() || "Member";
  return `${memberName}'s ${trainingProgram} day Workout Routine`;
};

const timeToMinutes = (value) => {
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
};

const minutesToTime = (value) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

const getCoachCompatibleStartTimes = async (client, trainerId, dayOfWeek, memberSlot, duration) => {
  const trainerSlots = await client.query(
    `SELECT TO_CHAR(start_time, 'HH24:MI') AS start_time,
            TO_CHAR(end_time, 'HH24:MI') AS end_time
     FROM trainer_availability
     WHERE trainer_id = $1 AND day_of_week = $2
     ORDER BY start_time`,
    [trainerId, dayOfWeek]
  );
  const startTimes = new Set();
  for (const trainerSlot of trainerSlots.rows) {
    const start = Math.max(timeToMinutes(memberSlot.start_time), timeToMinutes(trainerSlot.start_time));
    const end = Math.min(timeToMinutes(memberSlot.end_time), timeToMinutes(trainerSlot.end_time));
    const firstQuarterHour = Math.ceil(start / 15) * 15;
    for (let candidate = firstQuarterHour; candidate + duration <= end; candidate += 15) {
      startTimes.add(minutesToTime(candidate));
    }
  }
  return [...startTimes].sort();
};

const getCoachCompatibleStartTime = async (client, trainerId, dayOfWeek, memberSlot, duration) => {
  const trainerSlots = await client.query(
    `SELECT TO_CHAR(start_time, 'HH24:MI') AS start_time,
            TO_CHAR(end_time, 'HH24:MI') AS end_time
     FROM trainer_availability
     WHERE trainer_id = $1 AND day_of_week = $2
     ORDER BY start_time`,
    [trainerId, dayOfWeek]
  );
  for (const trainerSlot of trainerSlots.rows) {
    const start = Math.max(timeToMinutes(memberSlot.start_time), timeToMinutes(trainerSlot.start_time));
    const end = Math.min(timeToMinutes(memberSlot.end_time), timeToMinutes(trainerSlot.end_time));
    if (end - start >= duration) return minutesToTime(start);
  }
  return null;
};

// =========================================================
// Allowed trainer specializations
// =========================================================

const ALLOWED_SPECIALIZATIONS = [
  "High-Intensity Interval Training (HIIT)",
  "Circuit Training",
  "Olympic Weightlifting",
  "Powerlifting",
  "Calisthenics & Bodyweight",
  "Kettlebell Training",
  "Functional Fitness",
  "CrossFit Coaching",
  "Bodybuilding & Physique",
  "Weight Loss & Management",
  "Group Fitness",
];

// =========================================================
// Specialization helpers
// Database column: specializations TEXT[]
// =========================================================

const sanitizeSpecializations = (values) => {
  if (Array.isArray(values)) {
    return Array.from(
      new Set(
        values
          .map((value) => String(value).trim())
          .filter((value) =>
            ALLOWED_SPECIALIZATIONS.includes(value)
          )
      )
    );
  }

  if (typeof values === "string") {
    return Array.from(
      new Set(
        values
          .split(",")
          .map((value) => value.trim())
          .filter((value) =>
            ALLOWED_SPECIALIZATIONS.includes(value)
          )
      )
    );
  }

  return [];
};

const specializationToArray = (value) => {
  if (Array.isArray(value)) {
    return sanitizeSpecializations(value);
  }

  if (typeof value === "string") {
    return sanitizeSpecializations(value);
  }

  return [];
};

// =========================================================
// GET all trainers
// =========================================================

const getTrainers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        t.trainer_id,
        t.full_name,
        t.email,
        t.phone,
        t.specializations,
        t.profile_image,
        t.status,
        t.created_at,
        t.updated_at,
        t.goal_specialty,
        t.photo_url,
        t.bio,
        t.max_members,
        (t.password IS NOT NULL AND t.password <> '') AS has_portal_access,
        (SELECT COUNT(*)::integer FROM users u WHERE u.trainer_id = t.trainer_id) AS assigned_member_count,
        (
          SELECT COALESCE(
            json_agg(json_build_object(
              'day_of_week', ta.day_of_week,
              'start_time', TO_CHAR(ta.start_time, 'HH24:MI'),
              'end_time', TO_CHAR(ta.end_time, 'HH24:MI')
            ) ORDER BY ta.day_of_week, ta.start_time),
            '[]'::json
          )
          FROM trainer_availability ta
          WHERE ta.trainer_id = t.trainer_id
        ) AS availability
      FROM trainers t
      ORDER BY t.created_at DESC
    `);

    res.json({
      success: true,
      data: result.rows.map((trainer) => ({
        ...trainer,
        capacity_percent: trainer.max_members > 0
          ? Math.round((trainer.assigned_member_count / trainer.max_members) * 100)
          : 0,
        capacity_status: getCapacityStatus(
          trainer.assigned_member_count,
          trainer.max_members,
          trainer.status
        ),
        specializations: specializationToArray(
          trainer.specializations
        ),
      })),
    });
  } catch (err) {
    console.error("getTrainers error:", err.message);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// GET trainer by ID
// =========================================================

const getTrainerById = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        trainer_id,
        full_name,
        email,
        phone,
        specializations,
        profile_image,
        status,
        created_at,
        updated_at,
        goal_specialty,
        photo_url,
        bio,
        (password IS NOT NULL AND password <> '') AS has_portal_access
      FROM trainers
      WHERE trainer_id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found.",
      });
    }

    const trainer = result.rows[0];

    res.json({
      success: true,
      data: {
        ...trainer,
        specializations: specializationToArray(
          trainer.specializations
        ),
      },
    });
  } catch (err) {
    console.error("getTrainerById error:", err.message);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// POST create trainer
// =========================================================

const createTrainer = async (req, res) => {
  try {
    const {
      full_name,
      email,
      phone,
      specializations,
      password,
      photo_url,
      goal_specialty,
      bio,
    } = req.body;

    if (!validateName(full_name)) {
      return res.status(400).json({
        success: false,
        message: "Trainer name must be 2-50 characters.",
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid trainer email.",
      });
    }

    if (typeof phone !== "string" || !/^09\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone number must start with 09 and contain exactly 11 digits.",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Coach portal password is required.",
      });
    }

    if (!validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Use 8–12 characters with a letter, a number, and a symbol. Avoid common passwords.",
      });
    }

    const bioText = String(bio || "").trim();
    if (!bioText) {
      return res.status(400).json({
        success: false,
        message: "Coach bio / profile is required.",
      });
    }
    if (bioText.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Coach bio must be 500 characters or fewer.",
      });
    }

    if (!GOAL_SPECIALTIES.includes(goal_specialty)) {
      return res.status(400).json({
        success: false,
        message: "Choose a valid goal match for 'Recommended For'.",
      });
    }

    if (photo_url) {
      const imageCheck = validateImageDataUrl(photo_url);

      if (!imageCheck.ok) {
        return res.status(400).json({
          success: false,
          message: imageCheck.message,
        });
      }
    }

    const cleanSpecializations =
      sanitizeSpecializations(specializations);

    if (cleanSpecializations.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one specialization for this coach.",
      });
    }

    const hashed = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `
      INSERT INTO trainers
        (
          full_name,
          email,
          phone,
          specializations,
          password,
          photo_url,
          goal_specialty,
          bio,
          status
        )
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, 'Pending')
      RETURNING
        trainer_id,
        full_name,
        email,
        phone,
        specializations,
        photo_url,
        goal_specialty,
        bio,
        status,
        created_at
      `,
      [
        String(full_name).trim(),
        normalizeEmail(email),
        phone ? String(phone).trim() : null,
        cleanSpecializations,
        hashed,
        photo_url || null,
        goal_specialty || null,
        bioText || null,
      ]
    );

    const trainer = result.rows[0];

    res.status(201).json({
      success: true,
      data: {
        ...trainer,
        specializations: specializationToArray(
          trainer.specializations
        ),
      },
    });
  } catch (err) {
    console.error("createTrainer error:", err.message);

    if (err.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A trainer with that email already exists.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Unable to create trainer.",
    });
  }
};

// =========================================================
// PUT update trainer
// =========================================================

const updateTrainer = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;
  let passwordWasUpdated = false;
  try {
    const { id } = req.params;
    const {
      full_name,
      email,
      phone,
      specializations,
      status,
      password,
      photo_url,
      goal_specialty,
      bio,
    } = req.body;
    const normalizedName = String(full_name).trim();
    const normalizedTrainerEmail = normalizeEmail(email);
    const normalizedPhone = phone ? String(phone).trim() : null;

    if (!validateName(full_name)) {
      return res.status(400).json({
        success: false,
        message: "Trainer name must be 2-50 characters.",
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid trainer email.",
      });
    }

    if (typeof phone !== "string" || !/^09\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Phone number must start with 09 and contain exactly 11 digits.",
      });
    }

    if (
      !["Pending", "Active", "Rejected", "Inactive"].includes(
        status
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid trainer status.",
      });
    }

    if (password && !validatePassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "Use 8–12 characters with a letter, a number, and a symbol. Avoid common passwords.",
      });
    }

    const bioText = String(bio || "").trim();
    if (!bioText) {
      return res.status(400).json({
        success: false,
        message: "Coach bio / profile is required.",
      });
    }
    if (bioText.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Coach bio must be 500 characters or fewer.",
      });
    }

    if (!GOAL_SPECIALTIES.includes(goal_specialty)) {
      return res.status(400).json({
        success: false,
        message: "Choose a valid goal match for 'Recommended For'.",
      });
    }

    if (photo_url) {
      const imageCheck = validateImageDataUrl(photo_url);

      if (!imageCheck.ok) {
        return res.status(400).json({
          success: false,
          message: imageCheck.message,
        });
      }
    }

    const cleanSpecializations =
      sanitizeSpecializations(specializations);

    if (cleanSpecializations.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Select at least one specialization for this coach.",
      });
    }

    await client.query("BEGIN");
    transactionStarted = true;
    const lockedTrainer = await client.query(
      `SELECT trainer_id, full_name, email, phone, specializations, status,
              photo_url, goal_specialty, bio
       FROM trainers WHERE trainer_id = $1 FOR UPDATE`,
      [id]
    );
    if (!lockedTrainer.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ success: false, message: "Coach not found." });
    }
    const previousTrainer = lockedTrainer.rows[0];
    const changedAccountFields = [];
    if (previousTrainer.full_name !== normalizedName) changedAccountFields.push("Full name");
    if (String(previousTrainer.email || "").toLowerCase() !== normalizedTrainerEmail.toLowerCase()) {
      changedAccountFields.push("Email address");
    }
    if ((previousTrainer.phone || null) !== normalizedPhone) changedAccountFields.push("Phone number");
    if (
      JSON.stringify([...specializationToArray(previousTrainer.specializations)].sort()) !==
      JSON.stringify([...cleanSpecializations].sort())
    ) {
      changedAccountFields.push("Specializations");
    }
    if (photo_url && previousTrainer.photo_url !== photo_url) changedAccountFields.push("Profile photo");
    if (previousTrainer.goal_specialty !== goal_specialty) changedAccountFields.push("Recommended-for goal");
    if ((previousTrainer.bio || "") !== bioText) changedAccountFields.push("Profile bio");
    const statusChanged = previousTrainer.status !== status;
    const emailChanged = String(previousTrainer.email || "").toLowerCase() !== normalizedTrainerEmail.toLowerCase();
    if (status !== "Active" && status !== "Inactive") {
      const assigned = await client.query(
        "SELECT COUNT(*)::integer AS count FROM users WHERE trainer_id = $1",
        [id]
      );
      if (assigned.rows[0].count > 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: `This coach still has ${assigned.rows[0].count} assigned member(s). Reassign them before setting the account to Pending or Rejected.`,
        });
      }
    }

    if (password) {
      const hashed = await bcrypt.hash(password, 12);

      const updateResult = await client.query(
        `
        UPDATE trainers
        SET
          full_name = $1,
          email = $2,
          phone = $3,
          specializations = $4,
          status = $5,
          password = $6,
          token_version = COALESCE(token_version, 0) + 1,
          photo_url = COALESCE($7, photo_url),
          goal_specialty = COALESCE($8, goal_specialty),
          bio = COALESCE($9, bio),
          updated_at = NOW()
        WHERE trainer_id = $10
        `,
        [
          normalizedName,
          normalizedTrainerEmail,
          normalizedPhone,
          cleanSpecializations,
          status,
          hashed,
          photo_url || null,
          goal_specialty || null,
          bioText || null,
          id,
        ]
      );
      passwordWasUpdated = updateResult.rowCount > 0;
    } else {
      await client.query(
        `
        UPDATE trainers
        SET
          full_name = $1,
          email = $2,
          phone = $3,
          specializations = $4,
          status = $5,
          token_version = COALESCE(token_version, 0) + 1,
          photo_url = COALESCE($6, photo_url),
          goal_specialty = COALESCE($7, goal_specialty),
          bio = COALESCE($8, bio),
          updated_at = NOW()
        WHERE trainer_id = $9
        `,
        [
          normalizedName,
          normalizedTrainerEmail,
          normalizedPhone,
          cleanSpecializations,
          status,
          photo_url || null,
          goal_specialty || null,
          bioText || null,
          id,
        ]
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;
    if (statusChanged) {
      await deliverCoachEmail({
        trainer: { ...previousTrainer, email: normalizedTrainerEmail },
        event: "account status",
        send: (to) => sendCoachAccountStatusEmail({
          to,
          accountName: normalizedName,
          status,
        }),
      });
    }
    if (changedAccountFields.length) {
      await deliverCoachEmail({
        trainer: { ...previousTrainer, email: normalizedTrainerEmail },
        event: "account update",
        send: (to) => sendCoachAccountUpdatedEmail({
          to,
          accountName: normalizedName,
          changedFields: changedAccountFields,
        }),
      });
      if (emailChanged) {
        await deliverCoachEmail({
          trainer: previousTrainer,
          event: "email address change",
          send: (to) => sendCoachAccountUpdatedEmail({
            to,
            accountName: previousTrainer.full_name,
            changedFields: ["Email address"],
          }),
        });
      }
    }
    if (passwordWasUpdated) {
      try {
        const delivery = await sendAccountPasswordChangedEmail({
          to: normalizedTrainerEmail,
          accountName: normalizedName,
          accountType: "coach",
        });
        if (!delivery.delivered) {
          console.error(`Coach password change email was not delivered to ${normalizedTrainerEmail}.`);
        }
      } catch (mailError) {
        console.error("Coach password change email failed:", mailError.message);
      }
    }

    res.json({
      success: true,
      message: "Trainer updated.",
    });
  } catch (err) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("updateTrainer error:", err.message);

    if (err.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A trainer with that email already exists.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Unable to update coach.",
    });
  } finally {
    client.release();
  }
};

// =========================================================
// PUT approve trainer
// =========================================================

const approveTrainer = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const { id } = req.params;

    await client.query("BEGIN");
    transactionStarted = true;
    const coach = await client.query(
      "SELECT trainer_id, full_name, email, status FROM trainers WHERE trainer_id = $1 FOR UPDATE",
      [id]
    );

    if (!coach.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Trainer not found.",
      });
    }

    const result = await client.query(
      `UPDATE trainers
       SET status = 'Active',
           token_version = COALESCE(token_version, 0) + 1,
           updated_at = NOW()
       WHERE trainer_id = $1
       RETURNING trainer_id, status`,
      [id]
    );
    await client.query("COMMIT");
    transactionStarted = false;

    if (coach.rows[0].status !== "Active") {
      await deliverCoachEmail({
        trainer: coach.rows[0],
        event: "account activation",
        send: (to) => sendCoachAccountStatusEmail({
          to,
          accountName: coach.rows[0].full_name,
          status: "Active",
        }),
      });
    }

    res.json({
      success: true,
      message: "Trainer approved successfully.",
      trainer: result.rows[0],
    });
  } catch (err) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("approveTrainer error:", err.message);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    client.release();
  }
};

// =========================================================
// PUT reject trainer
// =========================================================

const rejectTrainer = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const { id } = req.params;

    await client.query("BEGIN");
    transactionStarted = true;
    const coach = await client.query(
      "SELECT trainer_id, full_name, email, status FROM trainers WHERE trainer_id = $1 FOR UPDATE",
      [id]
    );
    if (!coach.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Coach not found.",
      });
    }
    const assigned = await client.query(
      "SELECT COUNT(*)::integer AS count FROM users WHERE trainer_id = $1",
      [id]
    );
    if (assigned.rows[0].count > 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: `This coach still has ${assigned.rows[0].count} assigned member(s). Reassign them before rejecting the account.`,
      });
    }

    const result = await client.query(
      `UPDATE trainers
       SET status = 'Rejected',
           token_version = COALESCE(token_version, 0) + 1,
           updated_at = NOW()
       WHERE trainer_id = $1
       RETURNING trainer_id, status`,
      [id]
    );
    await client.query("COMMIT");
    transactionStarted = false;

    if (coach.rows[0].status !== "Rejected") {
      await deliverCoachEmail({
        trainer: coach.rows[0],
        event: "account status",
        send: (to) => sendCoachAccountStatusEmail({
          to,
          accountName: coach.rows[0].full_name,
          status: "Rejected",
        }),
      });
    }

    res.json({
      success: true,
      message: "Coach rejected.",
      trainer: result.rows[0],
    });
  } catch (err) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("rejectTrainer error:", err.message);

    res.status(500).json({
      success: false,
      message: "Unable to reject coach.",
    });
  } finally {
    client.release();
  }
};

// =========================================================
// PUT deactivate trainer
// =========================================================

const deactivateTrainer = async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const { id } = req.params;

    await client.query("BEGIN");
    transactionStarted = true;
    const coach = await client.query(
      "SELECT trainer_id, full_name, email, status FROM trainers WHERE trainer_id = $1 FOR UPDATE",
      [id]
    );
    if (!coach.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Coach not found.",
      });
    }
    const result = await client.query(
      `UPDATE trainers
       SET status = 'Inactive',
           token_version = COALESCE(token_version, 0) + 1,
           updated_at = NOW()
       WHERE trainer_id = $1
       RETURNING trainer_id, status`,
      [id]
    );
    await client.query("COMMIT");
    transactionStarted = false;

    if (coach.rows[0].status !== "Inactive") {
      await deliverCoachEmail({
        trainer: coach.rows[0],
        event: "account deactivation",
        send: (to) => sendCoachAccountStatusEmail({
          to,
          accountName: coach.rows[0].full_name,
          status: "Inactive",
        }),
      });
    }

    res.json({
      success: true,
      message: "Coach deactivated.",
      trainer: result.rows[0],
    });
  } catch (err) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("deactivateTrainer error:", err.message);

    res.status(500).json({
      success: false,
      message: "Unable to deactivate coach.",
    });
  } finally {
    client.release();
  }
};

// =========================================================
// DELETE trainer
// =========================================================

const deleteTrainer = async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    await client.query("BEGIN");

    const trainer = await client.query(
      "SELECT trainer_id FROM trainers WHERE trainer_id = $1 FOR UPDATE",
      [id]
    );

    if (trainer.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        success: false,
        message: "Trainer not found.",
      });
    }

    await client.query(
      "UPDATE users SET trainer_id = NULL WHERE trainer_id = $1",
      [id]
    );
    await client.query(
      "UPDATE members SET trainer_id = NULL WHERE trainer_id = $1",
      [id]
    );
    await client.query(
      "UPDATE workout_plans SET trainer_id = NULL WHERE trainer_id = $1",
      [id]
    );

    await client.query("DELETE FROM trainers WHERE trainer_id = $1", [id]);
    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Trainer removed successfully.",
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("deleteTrainer error:", err.message);

    res.status(500).json({
      success: false,
      message: "Unable to remove trainer.",
    });
  } finally {
    client.release();
  }
};

// =========================================================
// GET active trainers
// =========================================================

const getActiveTrainers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        trainer_id,
        full_name,
        email,
        specializations,
        goal_specialty,
        photo_url,
        bio,
        phone,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'day_of_week', ta.day_of_week,
                'start_time', TO_CHAR(ta.start_time, 'HH24:MI'),
                'end_time', TO_CHAR(ta.end_time, 'HH24:MI')
              )
              ORDER BY ta.day_of_week, ta.start_time
            ),
            '[]'::json
          )
          FROM trainer_availability ta
          WHERE ta.trainer_id = trainers.trainer_id
        ) AS availability
      FROM trainers
      WHERE status = 'Active'
      ORDER BY full_name ASC
    `);

    res.json({
      success: true,
      data: result.rows.map((trainer) => ({
        ...trainer,
        specializations: specializationToArray(
          trainer.specializations
        ),
      })),
    });
  } catch (err) {
    console.error("getActiveTrainers error:", err.message);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// GET trainer roster
// =========================================================

const getTrainerRoster = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.profile_image,
        u.gender,
        u.age,
        u.birth_date,
        u.height,
        u.weight,
        u.fitness_goal,
        u.target_weight,
        u.activity_level,
        u.intensity,
        u.injuries,
        u.health_conditions,
        u.preferred_days,
        u.preferred_workout_time,
        u.workout_days_per_week,
        u.workout_duration,
        u.membership_start_date,
        u.membership_end_date,
        t.full_name AS coach_name,
        CASE
          WHEN u.membership_start_date IS NULL OR u.membership_end_date IS NULL THEN 'Not set'
          WHEN u.membership_end_date < (NOW() AT TIME ZONE 'Asia/Manila')::date THEN 'Expired'
          ELSE 'Active'
        END AS membership_status,
        COALESCE(user_availability.slots, '[]'::json) AS weekly_availability,
        pl.weight AS latest_weight,
        pl.bmi AS latest_bmi,
        pl.log_date AS latest_log_date,
        COALESCE(workout_stats.assigned_workouts, 0)::int AS assigned_workouts,
        COALESCE(workout_stats.completed_workouts, 0)::int AS completed_workouts
      FROM users u
      LEFT JOIN trainers t
        ON t.trainer_id = u.trainer_id
      LEFT JOIN LATERAL (
        SELECT JSON_AGG(
          JSON_BUILD_OBJECT(
            'day_of_week', a.day_of_week,
            'time_preference', a.time_preference,
            'start_time', TO_CHAR(a.start_time, 'HH24:MI'),
            'end_time', TO_CHAR(a.end_time, 'HH24:MI')
          )
          ORDER BY ARRAY_POSITION(
            ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
            a.day_of_week
          )
        ) AS slots
        FROM user_workout_availability a
        WHERE a.user_id = u.user_id
      ) user_availability ON true
      LEFT JOIN LATERAL (
        SELECT
          weight,
          bmi,
          log_date
        FROM progress_logs
        WHERE user_id = u.user_id
        ORDER BY log_date DESC
        LIMIT 1
      ) pl ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(ws.session_id)::int AS assigned_workouts,
          COUNT(ws.session_id) FILTER (
            WHERE ws.completed = TRUE
          )::int AS completed_workouts
        FROM workout_plans wp
        JOIN workout_sessions ws
          ON ws.workout_plan_id = wp.workout_plan_id
        WHERE wp.user_id = u.user_id
      ) workout_stats ON true
      WHERE u.trainer_id = $1
      ORDER BY u.first_name ASC
      `,
      [id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("getTrainerRoster error:", err.message);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// Trainer Portal Login
// =========================================================

const loginTrainer = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (
      !validateEmail(email) ||
      typeof password !== "string" ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email and password.",
      });
    }

    const result = await pool.query(
      `
      SELECT
        trainer_id,
        full_name,
        email,
        phone,
        specializations,
        goal_specialty,
        photo_url,
        status,
        password,
        token_version
      FROM trainers
      WHERE LOWER(email) = $1
      `,
      [normalizeEmail(email)]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const trainer = result.rows[0];

    if (!trainer.password) {
      return res.status(401).json({
        success: false,
        message:
          "This account doesn't have portal access set up yet — ask the gym admin to set a password for you.",
      });
    }

    const valid = await bcrypt.compare(
      password,
      trainer.password
    );

    if (!valid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (trainer.status !== "Active") {
      if (trainer.status === "Rejected") {
        return res.status(403).json({
          success: false,
          status: "Rejected",
          message:
            "Your trainer account was not approved. Please contact the gym administrator.",
        });
      }

      return res.status(403).json({
        success: false,
        status: trainer.status || "Pending",
        message:
          "Your trainer account is not active. Please contact the gym administrator.",
      });
    }

    const token = jwt.sign(
      {
        trainer_id: trainer.trainer_id,
        email: trainer.email,
        token_version: Number(
          trainer.token_version || 0
        ),
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h",
      }
    );

    res.json({
      success: true,
      token,
      trainer: {
        trainer_id: trainer.trainer_id,
        full_name: trainer.full_name,
        email: trainer.email,
        phone: trainer.phone,
        specializations: specializationToArray(
          trainer.specializations
        ),
        goal_specialty: trainer.goal_specialty,
        photo_url: trainer.photo_url,
      },
    });
  } catch (err) {
    console.error("loginTrainer error:", err.message);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// GET logged-in trainer's roster
// =========================================================

const getMyRoster = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        u.profile_image,
        u.gender,
        u.age,
        u.birth_date,
        u.height,
        u.weight,
        u.fitness_goal,
        u.target_weight,
        u.activity_level,
        u.intensity,
        u.injuries,
        u.health_conditions,
        u.preferred_days,
        u.preferred_workout_time,
        u.workout_days_per_week,
        u.workout_duration,
        u.membership_start_date,
        u.membership_end_date,
        t.full_name AS coach_name,
        CASE
          WHEN u.membership_start_date IS NULL OR u.membership_end_date IS NULL THEN 'Not set'
          WHEN u.membership_end_date < (NOW() AT TIME ZONE 'Asia/Manila')::date THEN 'Expired'
          ELSE 'Active'
        END AS membership_status,
        COALESCE(user_availability.slots, '[]'::json) AS weekly_availability,
        pl.weight AS latest_weight,
        pl.bmi AS latest_bmi,
        pl.log_date AS latest_log_date,
        COALESCE(workout_stats.assigned_workouts, 0)::int AS assigned_workouts,
        COALESCE(workout_stats.completed_workouts, 0)::int AS completed_workouts,
        COALESCE(workout_days.workouts_by_day, '[]'::json) AS workouts_by_day
      FROM users u
      LEFT JOIN trainers t
        ON t.trainer_id = u.trainer_id
      LEFT JOIN LATERAL (
        SELECT
          weight,
          bmi,
          log_date
        FROM progress_logs
        WHERE user_id = u.user_id
        ORDER BY log_date DESC
        LIMIT 1
      ) pl ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(ws.session_id)::int AS assigned_workouts,
          COUNT(ws.session_id) FILTER (
            WHERE ws.completed = TRUE
          )::int AS completed_workouts
        FROM workout_plans wp
        JOIN workout_sessions ws
          ON ws.workout_plan_id = wp.workout_plan_id
        WHERE wp.user_id = u.user_id
      ) workout_stats ON true
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'day', day_stats.session_date,
            'assigned', day_stats.assigned,
            'completed', day_stats.completed
          )
          ORDER BY day_stats.session_date
        ) AS workouts_by_day
        FROM (
          SELECT
            ws.session_date,
            COUNT(*)::int AS assigned,
            COUNT(*) FILTER (
              WHERE ws.completed = TRUE
            )::int AS completed
          FROM workout_plans wp
          JOIN workout_sessions ws
            ON ws.workout_plan_id = wp.workout_plan_id
          WHERE wp.user_id = u.user_id
          GROUP BY ws.session_date
        ) day_stats
      ) workout_days ON true
      LEFT JOIN LATERAL (
        SELECT JSON_AGG(
          JSON_BUILD_OBJECT(
            'day_of_week', a.day_of_week,
            'time_preference', a.time_preference,
            'start_time', TO_CHAR(a.start_time, 'HH24:MI'),
            'end_time', TO_CHAR(a.end_time, 'HH24:MI')
          )
          ORDER BY ARRAY_POSITION(
            ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
            a.day_of_week
          )
        ) AS slots
        FROM user_workout_availability a
        WHERE a.user_id = u.user_id
      ) user_availability ON true
      WHERE u.trainer_id = $1
        AND LOWER(COALESCE(u.account_status, 'pending')) = 'active'
      ORDER BY u.first_name ASC
      `,
      [req.trainer.trainer_id]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("getMyRoster error:", err.message);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getMyMemberProgress = async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ success: false, message: "Choose a valid member." });
  }

  try {
    const assigned = await pool.query(
      "SELECT 1 FROM users WHERE user_id = $1 AND trainer_id = $2",
      [userId, req.trainer.trainer_id]
    );
    if (!assigned.rowCount) {
      return res.status(404).json({ success: false, message: "Member not found in your roster." });
    }

    const result = await pool.query(
      "SELECT * FROM progress_logs WHERE user_id = $1 ORDER BY log_date ASC",
      [userId]
    );
    return res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("getMyMemberProgress error:", err.message);
    return res.status(500).json({ success: false, message: "Unable to load member progress." });
  }
};

const getMyWorkoutPlans = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        wp.workout_plan_id,
        wp.plan_name,
        wp.goal,
        u.fitness_goal,
        u.target_weight,
        wp.training_program,
        wp.previous_training_program,
        wp.is_program_switch,
        wp.request_type,
        wp.status,
        wp.approval_status,
        wp.deletion_request_status,
        wp.deletion_request_reason,
        wp.deletion_requested_at,
        wp.deletion_review_reason,
        wp.created_at,
        u.user_id,
        u.injuries,
        u.health_conditions,
        COALESCE(plan_sessions.scheduled_date, wp.requested_session_date::text) AS scheduled_date,
        wp.scheduled_start_time,
        wp.scheduled_duration_minutes,
        plan_sessions.exercise_count,
        plan_sessions.completed_count,
        CASE
          WHEN wp.approval_status = 'Pending' THEN 'Pending Approval'
          WHEN wp.approval_status = 'Rejected' THEN 'Rejected'
          WHEN plan_sessions.exercise_count > 0
            AND plan_sessions.completed_count = plan_sessions.exercise_count
            THEN 'Complete'
          WHEN plan_sessions.scheduled_date IS NULL
            OR plan_sessions.scheduled_date > TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD')
            OR (
              plan_sessions.scheduled_date = TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD')
              AND (
                wp.scheduled_start_time IS NULL
                OR wp.scheduled_start_time > (NOW() AT TIME ZONE 'Asia/Manila')::time
              )
            )
            THEN 'Active'
          WHEN plan_sessions.completed_count = 0 THEN 'Absent'
          ELSE 'Incomplete'
        END AS activity_status,
        CASE
          WHEN u.user_id IS NULL THEN NULL
          ELSE CONCAT_WS(' ', u.first_name, u.last_name)
        END AS member_name,
        plan_sessions.sessions,
        plan_sessions.has_started
      FROM workout_plans wp
      LEFT JOIN users u ON u.user_id = wp.user_id
      LEFT JOIN LATERAL (
      SELECT
          MIN(ws.session_date) FILTER (
            WHERE ws.session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          ) AS scheduled_date,
          COUNT(ws.session_id)::int AS exercise_count,
          COUNT(ws.session_id) FILTER (WHERE ws.completed = TRUE)::int AS completed_count,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'exercise_id', ws.exercise_id,
                'exercise_name', e.exercise_name,
                'equipment', e.equipment,
                'sets', ws.sets,
                'reps', ws.reps,
                'session_date', ws.session_date,
                'completed', ws.completed,
                'muscle_group', e.muscle_group
              )
              ORDER BY ws.session_id
            ) FILTER (WHERE ws.session_id IS NOT NULL),
            '[]'::json
          ) AS sessions,
          COALESCE(BOOL_OR(ws.started_at IS NOT NULL OR ws.completed = TRUE), FALSE) AS has_started
        FROM workout_sessions ws
        LEFT JOIN exercises e ON e.exercise_id = ws.exercise_id
        WHERE ws.workout_plan_id = wp.workout_plan_id
      ) plan_sessions ON true
      WHERE wp.trainer_id = $1
        AND (u.user_id IS NULL OR u.trainer_id = $1)
      ORDER BY wp.created_at DESC, wp.workout_plan_id DESC
      `,
      [req.trainer.trainer_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("getMyWorkoutPlans error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

const createMyWorkoutPlan = async (req, res) => {
  const trainerId = req.trainer.trainer_id;
  const userId = Number(req.body.user_id);
  const sessionDate = req.body.session_date;
  const sessions = req.body.sessions;

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ success: false, message: "Choose a member for this workout plan." });
  }
  const parsedSessionDate = typeof sessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
    ? new Date(`${sessionDate}T00:00:00.000Z`)
    : null;
  if (!parsedSessionDate || !Number.isFinite(parsedSessionDate.getTime()) ||
      parsedSessionDate.toISOString().slice(0, 10) !== sessionDate) {
    return res.status(400).json({ success: false, message: "Choose a valid workout date." });
  }
  if (!Array.isArray(sessions) || sessions.length < 3 || sessions.length > 30) {
    return res.status(400).json({ success: false, message: "A workout routine must contain between 3 and 30 exercises." });
  }
  if (sessions.some((session) =>
    !session ||
    typeof session !== "object" ||
    Array.isArray(session) ||
    !Number.isInteger(Number(session.exercise_id)) ||
    Number(session.exercise_id) < 1 ||
    String(session.sets ?? "").trim() === "" ||
    !Number.isInteger(Number(session.sets)) ||
    Number(session.sets) < 1 ||
    Number(session.sets) > 6 ||
    String(session.reps ?? "").trim() === "" ||
    !Number.isInteger(Number(session.reps)) ||
    Number(session.reps) < 3 ||
    Number(session.reps) > 16
  )) {
    return res.status(400).json({
      success: false,
      message: "Every exercise must have an exercise, sets from 1 to 6, and reps from 3 to 16.",
    });
  }
  if (new Set(sessions.map((session) => Number(session.exercise_id))).size !== sessions.length) {
    return res.status(400).json({
      success: false,
      message: "An exercise can only appear once in a day's workout plan.",
    });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const today = await client.query(
      "SELECT TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS today"
    );
    if (sessionDate < today.rows[0].today) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: "Workout date can't be in the past." });
    }

    const member = await client.query(
      `
      SELECT user_id, first_name, last_name, email, activity_level, fitness_goal,
             target_weight, membership_end_date,
             workout_days_per_week, preferred_days, injuries, health_conditions
      FROM users
      WHERE user_id = $1
        AND trainer_id = $2
        AND LOWER(COALESCE(account_status, 'pending')) = 'active'
      FOR UPDATE
      `,
      [userId, trainerId]
    );
    if (!member.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({ success: false, message: "This member isn't on your roster." });
    }

    const memberPreferences = member.rows[0];
    if (memberPreferences.membership_end_date
      && String(memberPreferences.membership_end_date).slice(0, 10) < today.rows[0].today) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({ success: false, message: "This member's membership has ended. Renew it before scheduling a workout plan." });
    }
    const trainingProgram = getProgramForDate(sessionDate, memberPreferences.preferred_days || []);
    if (!trainingProgram || !TRAINING_PROGRAMS.includes(trainingProgram)
      || (req.body.training_program && req.body.training_program !== trainingProgram)) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "Choose exercises for the program automatically assigned to this member's preferred workout day.",
      });
    }
    const planName = formatWorkoutPlanName(memberPreferences.first_name, memberPreferences.last_name, trainingProgram);
    const goal = memberPreferences.target_weight != null
      ? `Target weight: ${memberPreferences.target_weight} kg`
      : memberPreferences.fitness_goal || "Fitness goal not set";
    const memberAvailability = await client.query(
      `SELECT day_of_week, time_preference,
              TO_CHAR(start_time, 'HH24:MI') AS start_time,
              TO_CHAR(end_time, 'HH24:MI') AS end_time
       FROM user_workout_availability
       WHERE user_id = $1`,
      [userId]
    );
    const level = memberPreferences.activity_level || "Beginner";
    const [minimumDays, maximumDays] = getExperienceRange(level);
    const workoutFrequency = Number(memberPreferences.workout_days_per_week);
    const sessionDuration = DEFAULT_WORKOUT_SESSION_DURATION;
    if (!Number.isInteger(workoutFrequency) || workoutFrequency < minimumDays || workoutFrequency > maximumDays) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: `${level} users should select ${minimumDays}–${maximumDays} workout days per week before a plan can be scheduled.`,
      });
    }
    if (workoutFrequency !== memberAvailability.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: `The member must select exactly ${workoutFrequency} available days to match their weekly workout frequency.`,
      });
    }
    const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const scheduledWeekday = weekdayNames[parsedSessionDate.getUTCDay()];
    const scheduledAvailability = memberAvailability.rows.find(
      (slot) => slot.day_of_week.toLowerCase() === scheduledWeekday
    );
    if (!scheduledAvailability) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: `This member is not available on ${scheduledWeekday[0].toUpperCase()}${scheduledWeekday.slice(1)}.`,
      });
    }
    const compatibleStartTimes = await getCoachCompatibleStartTimes(
      client,
      trainerId,
      parsedSessionDate.getUTCDay(),
      scheduledAvailability,
      sessionDuration
    );
    if (!compatibleStartTimes.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "The coach and member do not have a shared 60-minute availability window on this day.",
      });
    }
    const scheduledStartTime = compatibleStartTimes[0];
    const weeklyPlanCount = await client.query(
      `SELECT COUNT(DISTINCT wp.workout_plan_id)::int AS count
       FROM workout_plans wp
       WHERE wp.user_id = $1
         AND wp.approval_status IN ('Approved', 'Pending')
         AND (
           (
             COALESCE(wp.requested_session_date::text, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             AND wp.requested_session_date::date >= DATE_TRUNC('week', $2::date)::date
             AND wp.requested_session_date::date < (DATE_TRUNC('week', $2::date) + INTERVAL '7 days')::date
           )
           OR EXISTS (
             SELECT 1 FROM workout_sessions ws
             WHERE ws.workout_plan_id = wp.workout_plan_id
               AND COALESCE(ws.session_date::text, '') >= TO_CHAR(DATE_TRUNC('week', $2::date), 'YYYY-MM-DD')
               AND COALESCE(ws.session_date::text, '') < TO_CHAR(DATE_TRUNC('week', $2::date) + INTERVAL '7 days', 'YYYY-MM-DD')
           )
         )`,
      [userId, sessionDate]
    );
    if (Number(weeklyPlanCount.rows[0].count) >= workoutFrequency) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: `This member's ${workoutFrequency}-day weekly workout frequency is already scheduled. Choose a different week or update their frequency.`,
      });
    }

    const existingPlan = await client.query(
      `
      SELECT wp.workout_plan_id
      FROM workout_plans wp
      WHERE wp.user_id = $1
        AND wp.approval_status IN ('Approved', 'Pending')
        AND (
          (
            COALESCE(wp.requested_session_date::text, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            AND wp.requested_session_date::date = $2::date
          )
          OR EXISTS (
            SELECT 1 FROM workout_sessions ws
            WHERE ws.workout_plan_id = wp.workout_plan_id
              AND COALESCE(ws.session_date::text, '') = $2::date::text
          )
        )
      LIMIT 1
      `,
      [userId, sessionDate]
    );
    if (existingPlan.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "A workout plan already exists for this member on that date. Edit the existing plan instead.",
      });
    }

    const exerciseIds = [...new Set(sessions.map((session) => Number(session.exercise_id)))];
    const exercises = await client.query(
      `SELECT e.exercise_id, e.muscle_group, e.difficulty, c.category_name
       FROM exercises e
       LEFT JOIN exercise_categories c ON c.category_id = e.category_id
       WHERE e.exercise_id = ANY($1::int[])`,
      [exerciseIds]
    );
    if (exercises.rowCount !== exerciseIds.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: "One or more selected exercises are unavailable." });
    }
    const exerciseById = new Map(exercises.rows.map((exercise) => [Number(exercise.exercise_id), exercise]));
    for (const session of sessions) {
      const exercise = exerciseById.get(Number(session.exercise_id));
      if (!exerciseMatchesProgram(exercise, trainingProgram)) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({ success: false, message: `Choose only exercises that belong to the ${trainingProgram} program.` });
      }
      if (requiresConservativeWorkout(exercise, memberPreferences.injuries || [], memberPreferences.health_conditions || [])) {
        if (String(exercise.difficulty || "").toLowerCase() !== "beginner"
          || Number(session.sets) < 1 || Number(session.sets) > 2
          || Number(session.reps) < 6 || Number(session.reps) > 10) {
          await client.query("ROLLBACK");
          transactionStarted = false;
          return res.status(400).json({ success: false, message: "For injury-affected exercises or recorded health conditions, use beginner options with 1–2 sets and 6–10 reps. Without those restrictions, the normal beginner minimum is 3 sets." });
        }
      } else if (!isWorkoutDoseAllowed(memberPreferences.fitness_goal, session.sets, session.reps)) {
        const rules = getWorkoutGoalRules(memberPreferences.fitness_goal);
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: rules
            ? `For this member's fitness goal, unaffected exercises must use ${rules.sets[0]}–${rules.sets[1]} sets and ${rules.reps[0]}–${rules.reps[1]} reps.`
            : "Enter valid sets and reps for each exercise.",
        });
      }
    }

    const neighborDates = [
      new Date(Date.UTC(
        parsedSessionDate.getUTCFullYear(),
        parsedSessionDate.getUTCMonth(),
        parsedSessionDate.getUTCDate() - 1
      )).toISOString().slice(0, 10),
      new Date(Date.UTC(
        parsedSessionDate.getUTCFullYear(),
        parsedSessionDate.getUTCMonth(),
        parsedSessionDate.getUTCDate() + 1
      )).toISOString().slice(0, 10),
    ];
    const neighboringMuscles = await client.query(
      `SELECT DISTINCT LOWER(BTRIM(e.muscle_group)) AS muscle_group
       FROM workout_plans wp
       JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
       JOIN exercises e ON e.exercise_id = ws.exercise_id
       WHERE wp.user_id = $1
         AND ws.session_date = ANY($2::text[])
         AND NULLIF(BTRIM(e.muscle_group), '') IS NOT NULL`,
      [userId, neighborDates]
    );
    const muscleTokens = (value) => String(value || "")
      .split(/[,/&+]/)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
    const neighboringMuscleSet = new Set(
      neighboringMuscles.rows.flatMap((row) => muscleTokens(row.muscle_group))
    );
    const conflictsWithRecovery = exercises.rows.some((exercise) =>
      muscleTokens(exercise.muscle_group).some((muscle) => neighboringMuscleSet.has(muscle))
    );
    if (conflictsWithRecovery) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "This plan repeats a muscle group from an adjacent workout day. Allow a recovery day before scheduling the same muscle group again.",
      });
    }

    const plan = await client.query(
      `
      INSERT INTO workout_plans
        (user_id, trainer_id, plan_name, goal, scheduled_start_time, scheduled_duration_minutes, training_program)
      VALUES ($1, $2, $3, $4, $5::time, $6, $7)
      RETURNING workout_plan_id, plan_name, goal, status, created_at,
                scheduled_start_time, scheduled_duration_minutes, training_program
      `,
      [userId, trainerId, planName, goal || null, scheduledStartTime, sessionDuration, trainingProgram]
    );
    const planId = plan.rows[0].workout_plan_id;

    for (const session of sessions) {
      await client.query(
        `
        INSERT INTO workout_sessions
          (workout_plan_id, exercise_id, sets, reps, duration_minutes, session_date)
        VALUES ($1, $2, $3, $4, NULL, $5)
        `,
        [
          planId,
          Number(session.exercise_id),
          Number(session.sets),
          Number(session.reps),
          sessionDate,
        ]
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;
    await createNotification({
      audience: "user",
      recipientId: userId,
      message: `Your coach added the workout plan "${planName}".`,
      notificationType: "workout",
      targetUrl: "/user/workout",
    }).catch((err) => {
      console.error("Workout plan notification failed:", err.message);
    });
    sendWorkoutPlanReadyEmail({
      to: member.rows[0].email,
      firstName: member.rows[0].first_name,
    }).then((result) => {
      if (!result.delivered) {
        console.warn(
          result.preview
            ? "Workout plan email not delivered because SMTP is not configured."
            : "Workout plan email was not accepted by the mail transport."
        );
      }
    }).catch((err) => {
      console.error("Workout plan email failed:", err.message);
    });
    res.status(201).json({ success: true, data: { ...plan.rows[0], session_date: sessionDate, exercise_count: sessions.length } });
  } catch (err) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("createMyWorkoutPlan error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client?.release();
  }
};

const reviewMemberWorkoutPlan = async (req, res) => {
  const trainerId = req.trainer.trainer_id;
  const planId = Number(req.params.planId);
  const decision = req.body.decision;
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (!Number.isInteger(planId) || planId < 1 || !["approve", "reject"].includes(decision)) {
    return res.status(400).json({ success: false, message: "Choose a valid workout plan and review decision." });
  }
  if (decision === "reject" && (reason.length < 5 || reason.length > 1000)) {
    return res.status(400).json({ success: false, message: "Enter a rejection reason between 5 and 1000 characters." });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    const planResult = await client.query(
      `SELECT wp.workout_plan_id, wp.user_id, wp.plan_name, wp.approval_status,
              wp.deletion_request_status, wp.request_type,
              u.first_name, u.last_name, u.email, u.workout_days_per_week,
              COALESCE(MIN(ws.session_date)::text, wp.requested_session_date::text) AS session_date,
              COUNT(ws.session_id)::int AS session_count
       FROM workout_plans wp
       JOIN users u ON u.user_id = wp.user_id AND u.trainer_id = $2
       LEFT JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
       WHERE wp.workout_plan_id = $1 AND wp.trainer_id = $2
       GROUP BY wp.workout_plan_id, u.user_id`,
      [planId, trainerId]
    );
    if (!planResult.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ success: false, message: "Workout plan request not found on your roster." });
    }
    const plan = planResult.rows[0];
    if (plan.deletion_request_status === "Pending") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ success: false, message: "Review the member's deletion request before reviewing this workout plan." });
    }
    if (plan.approval_status !== "Pending") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ success: false, message: "This workout plan request has already been reviewed." });
    }
    if (decision === "approve" && Number(plan.session_count) < 3) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "Add at least 3 exercises to this requested workout before approving it.",
      });
    }

    let startTime = null;
    if (decision === "approve") {
      const sessionDate = String(plan.session_date || "").slice(0, 10);
      const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
        ? new Date(`${sessionDate}T00:00:00.000Z`)
        : null;
      const todayResult = await client.query(
        "SELECT TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS today"
      );
      if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || sessionDate < todayResult.rows[0].today) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({ success: false, message: "This request's workout date has passed or is invalid. Ask the member to submit a new plan." });
      }

      const competingDatePlan = await client.query(
        `SELECT 1
         FROM workout_plans wp
         JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
         WHERE wp.user_id = $1
           AND wp.workout_plan_id <> $2
           AND wp.approval_status = 'Approved'
           AND COALESCE(ws.session_date::text, '') = $3
         LIMIT 1`,
        [plan.user_id, planId, sessionDate]
      );
      if (competingDatePlan.rowCount) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({ success: false, message: "Another workout is already approved for this member on that date." });
      }

      const weeklyFrequency = Number(plan.workout_days_per_week);
      if (!Number.isInteger(weeklyFrequency) || weeklyFrequency < 1 || weeklyFrequency > 7) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({ success: false, message: "The member needs a valid weekly workout frequency before this plan can be approved." });
      }
      const otherWeeklyPlans = await client.query(
        `SELECT COUNT(DISTINCT wp.workout_plan_id)::int AS count
         FROM workout_plans wp
         JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
         WHERE wp.user_id = $1
           AND wp.workout_plan_id <> $2
           AND wp.approval_status = 'Approved'
           AND ws.session_date >= TO_CHAR(DATE_TRUNC('week', $3::date), 'YYYY-MM-DD')
           AND ws.session_date < TO_CHAR(DATE_TRUNC('week', $3::date) + INTERVAL '7 days', 'YYYY-MM-DD')`,
        [plan.user_id, planId, sessionDate]
      );
      if (Number(otherWeeklyPlans.rows[0].count) >= weeklyFrequency) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({ success: false, message: `The member's ${weeklyFrequency}-day weekly workout frequency is already filled.` });
      }

      const memberAvailability = await client.query(
        `SELECT day_of_week, TO_CHAR(start_time, 'HH24:MI') AS start_time,
                TO_CHAR(end_time, 'HH24:MI') AS end_time
         FROM user_workout_availability
         WHERE user_id = $1`,
        [plan.user_id]
      );
      const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const scheduledWeekday = weekdayNames[parsedDate.getUTCDay()];
      const memberSlot = memberAvailability.rows.find((slot) => slot.day_of_week === scheduledWeekday);
      if (!memberSlot) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({ success: false, message: `The member is no longer available on ${scheduledWeekday}.` });
      }
      const duration = DEFAULT_WORKOUT_SESSION_DURATION;
      const compatibleTimes = await getCoachCompatibleStartTimes(
        client,
        trainerId,
        parsedDate.getUTCDay(),
        memberSlot,
        duration
      );
      if (!compatibleTimes.length) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({ success: false, message: "There is no coach/member availability overlap long enough for this workout. Update availability before approving." });
      }
      startTime = compatibleTimes[0];
      const approved = await client.query(
        `UPDATE workout_plans
         SET approval_status = 'Approved',
             scheduled_start_time = $1::time,
             scheduled_duration_minutes = $2,
             trainer_change_reason = NULL
         WHERE workout_plan_id = $3 AND approval_status = 'Pending'`,
        [startTime, duration, planId]
      );
      if (!approved.rowCount) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({ success: false, message: "This workout plan request has already been reviewed." });
      }
    } else {
      const rejected = await client.query(
        `UPDATE workout_plans
         SET approval_status = 'Rejected',
             trainer_change_reason = $1
         WHERE workout_plan_id = $2 AND approval_status = 'Pending'`,
        [reason, planId]
      );
      if (!rejected.rowCount) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({ success: false, message: "This workout plan request has already been reviewed." });
      }

      await client.query(`DELETE FROM workout_sessions WHERE workout_plan_id = $1`, [planId]);
      const deletedPlan = await client.query(
        `DELETE FROM workout_plans
         WHERE workout_plan_id = $1
           AND approval_status = 'Rejected'
         RETURNING workout_plan_id`,
        [planId]
      );
      if (!deletedPlan.rowCount) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({ success: false, message: "The rejected request could not be cleared. Please refresh and try again." });
      }
    }

    await client.query("COMMIT");
    transactionStarted = false;
    const memberName = `${plan.first_name || ""} ${plan.last_name || ""}`.trim();
    await createNotification({
      audience: "user",
      recipientId: plan.user_id,
      message: decision === "approve"
        ? "Your workout plan request was approved by your coach."
        : `Your workout plan request was declined by your coach. Reason: ${reason} You can submit an updated plan.`,
      notificationType: "workout",
      userName: memberName,
      targetUrl: "/user/workout",
    }).catch((notificationError) => {
      console.error("Workout plan review notification failed:", notificationError.message);
    });
    await deliverWorkoutPlanEmail({
      to: plan.email,
      firstName: plan.first_name,
      planName: plan.plan_name,
      sessionDate: String(plan.session_date || "").slice(0, 10),
      status: decision === "approve" ? "approved" : "rejected",
      reason: decision === "reject" ? reason : "",
    }, `Workout plan ${decision}`);

    return res.json({
      success: true,
      message: decision === "approve" ? "Workout plan approved." : "Workout plan request rejected.",
    });
  } catch (err) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("reviewMemberWorkoutPlan error:", err.message);
    return res.status(500).json({ success: false, message: "Unable to review this workout plan request." });
  } finally {
    client?.release();
  }
};

const reviewMemberWorkoutPlanDeletion = async (req, res) => {
  const trainerId = req.trainer.trainer_id;
  const planId = Number(req.params.planId);
  const decision = req.body.decision;
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (!Number.isInteger(planId) || planId < 1 || !["approve", "reject"].includes(decision)) {
    return res.status(400).json({ success: false, message: "Choose a valid workout plan and deletion decision." });
  }
  if (decision === "reject" && (reason.length < 5 || reason.length > 1000)) {
    return res.status(400).json({ success: false, message: "Enter a response between 5 and 1,000 characters." });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    const result = await client.query(
      `SELECT wp.workout_plan_id, wp.plan_name, wp.deletion_request_status,
              wp.deletion_request_reason, u.user_id, u.first_name, u.email
       FROM workout_plans wp
       JOIN users u ON u.user_id = wp.user_id AND u.trainer_id = $2
       WHERE wp.workout_plan_id = $1 AND wp.trainer_id = $2
       FOR UPDATE OF wp`,
      [planId, trainerId]
    );
    if (!result.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ success: false, message: "Workout plan not found on your roster." });
    }
    const plan = result.rows[0];
    if (plan.deletion_request_status !== "Pending") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ success: false, message: "This deletion request has already been reviewed." });
    }

    if (decision === "approve") {
      const sessions = await client.query(
        `SELECT session_id, started_at, completed
         FROM workout_sessions
         WHERE workout_plan_id = $1
         FOR UPDATE`,
        [planId]
      );
      if (sessions.rows.some((session) => session.started_at || session.completed)) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({ success: false, message: "This workout has started or been completed and cannot be deleted." });
      }
      await client.query("DELETE FROM workout_sessions WHERE workout_plan_id = $1", [planId]);
      const deletedPlan = await client.query(
        "DELETE FROM workout_plans WHERE workout_plan_id = $1 AND deletion_request_status = 'Pending' RETURNING workout_plan_id",
        [planId]
      );
      if (!deletedPlan.rowCount) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({ success: false, message: "The deletion request changed while being reviewed. Refresh and try again." });
      }
    } else {
      const updated = await client.query(
        `UPDATE workout_plans
         SET deletion_request_status = 'Rejected', deletion_review_reason = $1
         WHERE workout_plan_id = $2 AND deletion_request_status = 'Pending'`,
        [reason, planId]
      );
      if (!updated.rowCount) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(409).json({ success: false, message: "This deletion request has already been reviewed." });
      }
    }
    await client.query("COMMIT");
    transactionStarted = false;

    await createNotification({
      audience: "user",
      recipientId: Number(plan.user_id),
      message: decision === "approve"
        ? `Your coach approved the deletion request for "${plan.plan_name}". The workout plan was deleted.`
        : `Your coach declined the deletion request for "${plan.plan_name}". Reason: ${reason}`,
      notificationType: "workout",
      targetUrl: "/user/workout",
    }).catch((notificationError) => {
      console.error("Workout plan deletion review notification failed:", notificationError.message);
    });
    try {
      const email = await sendWorkoutPlanDeletionDecisionEmail({
        to: plan.email,
        firstName: plan.first_name,
        planName: plan.plan_name,
        approved: decision === "approve",
        reason: decision === "reject" ? reason : "",
      });
      if (!email.delivered) console.warn("Workout plan deletion decision email was not delivered because SMTP is not configured.");
    } catch (emailError) {
      console.error("Workout plan deletion decision email failed:", emailError.message);
    }
    return res.json({
      success: true,
      message: decision === "approve" ? "Deletion request approved; the workout plan was deleted." : "Deletion request declined.",
    });
  } catch (err) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("reviewMemberWorkoutPlanDeletion error:", err.message);
    return res.status(500).json({ success: false, message: "Unable to review this workout plan deletion request." });
  } finally {
    client?.release();
  }
};

const updateMyWorkoutPlan = async (req, res) => {
  const trainerId = req.trainer.trainer_id;
  const planId = Number(req.params.planId);
  const sessionDate = req.body.session_date;
  const changeReason = typeof req.body.change_reason === "string" ? req.body.change_reason.trim() : "";
  const sessions = req.body.sessions;

  if (!Number.isInteger(planId) || planId < 1) {
    return res.status(400).json({ success: false, message: "Choose a valid workout plan." });
  }
  const parsedSessionDate = typeof sessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
    ? new Date(`${sessionDate}T00:00:00.000Z`)
    : null;
  if (!parsedSessionDate || !Number.isFinite(parsedSessionDate.getTime()) ||
      parsedSessionDate.toISOString().slice(0, 10) !== sessionDate) {
    return res.status(400).json({ success: false, message: "Choose a valid workout date." });
  }
  if (!Array.isArray(sessions) || sessions.length < 3 || sessions.length > 30) {
    return res.status(400).json({ success: false, message: "A workout routine must contain between 3 and 30 exercises." });
  }
  if (sessions.some((session) =>
    !session ||
    typeof session !== "object" ||
    Array.isArray(session) ||
    !Number.isInteger(Number(session.exercise_id)) ||
    Number(session.exercise_id) < 1 ||
    String(session.sets ?? "").trim() === "" ||
    !Number.isInteger(Number(session.sets)) ||
    Number(session.sets) < 1 ||
    Number(session.sets) > 6 ||
    String(session.reps ?? "").trim() === "" ||
    !Number.isInteger(Number(session.reps)) ||
    Number(session.reps) < 3 ||
    Number(session.reps) > 16
  )) {
    return res.status(400).json({
      success: false,
      message: "Every exercise must have an exercise, sets from 1 to 6, and reps from 3 to 16.",
    });
  }
  if (new Set(sessions.map((session) => Number(session.exercise_id))).size !== sessions.length) {
    return res.status(400).json({
      success: false,
      message: "An exercise can only appear once in a day's workout plan.",
    });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    const plan = await client.query(
      `
      SELECT wp.workout_plan_id, wp.user_id, wp.approval_status, wp.deletion_request_status,
             wp.training_program, wp.goal, wp.request_type,
             wp.requested_session_date::text AS requested_session_date
      FROM workout_plans wp
      JOIN users u ON u.user_id = wp.user_id
      WHERE wp.workout_plan_id = $1
        AND wp.trainer_id = $2
        AND u.trainer_id = $2
        AND LOWER(COALESCE(u.account_status, 'pending')) = 'active'
      FOR UPDATE OF wp, u
      `,
      [planId, trainerId]
    );
    if (!plan.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ success: false, message: "Workout plan not found in your roster." });
    }
    if (plan.rows[0].deletion_request_status === "Pending") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ success: false, message: "Review the member's deletion request before editing this workout plan." });
    }

    const planSessions = await client.query(
      `SELECT session_id, session_date::text AS session_date, started_at, completed
       FROM workout_sessions
       WHERE workout_plan_id = $1
       ORDER BY session_date, session_id
       FOR UPDATE`,
      [planId]
    );
    const isInitialCoachRequest = plan.rows[0].request_type === "coach_created" && planSessions.rowCount === 0;
    if (plan.rows[0].request_type === "coach_created") {
      const currentSessionDate = String(
        planSessions.rows[0]?.session_date || plan.rows[0].requested_session_date || ""
      ).slice(0, 10);
      if (currentSessionDate && sessionDate !== currentSessionDate) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: "The workout date requested by the member can't be changed.",
        });
      }
    }
    const currentDate = await client.query(
      "SELECT TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS today"
    );
    const todayDate = currentDate.rows[0].today;
    const hasPastWorkoutDate = planSessions.rows.some((session) => {
      const date = String(session.session_date).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < todayDate;
    });
    if (hasPastWorkoutDate && plan.rows[0].approval_status !== "Rejected") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "This workout plan's date has passed and it can no longer be edited.",
      });
    }
    if (sessionDate < todayDate) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: "Workout date can't be in the past." });
    }
    if (planSessions.rows.some((session) => session.started_at || session.completed)) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "This workout plan can no longer be edited because the member has already started it.",
      });
    }

    const member = await client.query(
      `SELECT user_id, first_name, last_name, email, activity_level, fitness_goal, workout_days_per_week, injuries, health_conditions
       FROM users
       WHERE user_id = $1 AND trainer_id = $2 AND LOWER(COALESCE(account_status, 'pending')) = 'active'`,
      [plan.rows[0].user_id, trainerId]
    );
    if (!member.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({ success: false, message: "This member isn't on your roster." });
    }

    const memberAvailability = await client.query(
      `SELECT day_of_week, TO_CHAR(start_time, 'HH24:MI') AS start_time,
              TO_CHAR(end_time, 'HH24:MI') AS end_time
       FROM user_workout_availability
       WHERE user_id = $1`,
      [plan.rows[0].user_id]
    );
    const level = member.rows[0].activity_level || "Beginner";
    const [minimumDays, maximumDays] = getExperienceRange(level);
    const workoutFrequency = Number(member.rows[0].workout_days_per_week);
    const sessionDuration = DEFAULT_WORKOUT_SESSION_DURATION;
    if (!Number.isInteger(workoutFrequency) || workoutFrequency < minimumDays || workoutFrequency > maximumDays) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: `${level} users should select ${minimumDays}–${maximumDays} workout days per week before a plan can be scheduled.`,
      });
    }
    if (workoutFrequency !== memberAvailability.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: `The member must select exactly ${workoutFrequency} available days to match their weekly workout frequency.`,
      });
    }
    const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const scheduledWeekday = weekdayNames[parsedSessionDate.getUTCDay()];
    const scheduledAvailability = memberAvailability.rows.find((slot) => slot.day_of_week === scheduledWeekday);
    if (!scheduledAvailability) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: `This member is not available on ${scheduledWeekday}.`,
      });
    }
    const compatibleStartTimes = await getCoachCompatibleStartTimes(
      client,
      trainerId,
      parsedSessionDate.getUTCDay(),
      scheduledAvailability,
      sessionDuration
    );
    if (!compatibleStartTimes.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "The coach and member do not have a shared 60-minute availability window on this day.",
      });
    }
    const scheduledStartTime = compatibleStartTimes[0];

    const existingPlan = await client.query(
      `
      SELECT wp.workout_plan_id
      FROM workout_plans wp
      WHERE wp.user_id = $1
        AND wp.approval_status IN ('Approved', 'Pending')
        AND wp.workout_plan_id <> $3
        AND (
          (
            COALESCE(wp.requested_session_date::text, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            AND wp.requested_session_date::date = $2::date
          )
          OR EXISTS (
            SELECT 1
            FROM workout_sessions ws
            WHERE ws.workout_plan_id = wp.workout_plan_id
              AND COALESCE(ws.session_date::text, '') = $2::date::text
          )
        )
      LIMIT 1
      `,
      [plan.rows[0].user_id, sessionDate, planId]
    );
    if (existingPlan.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "A workout plan already exists for this member on that date. Edit the existing plan instead.",
      });
    }

    const weeklyPlanCount = await client.query(
      `SELECT COUNT(DISTINCT wp.workout_plan_id)::int AS count
       FROM workout_plans wp
       WHERE wp.user_id = $1
         AND wp.workout_plan_id <> $3
         AND wp.approval_status IN ('Approved', 'Pending')
         AND (
           (
             COALESCE(wp.requested_session_date::text, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             AND wp.requested_session_date::date >= DATE_TRUNC('week', $2::date)::date
             AND wp.requested_session_date::date < (DATE_TRUNC('week', $2::date) + INTERVAL '7 days')::date
           )
           OR EXISTS (
             SELECT 1 FROM workout_sessions ws
             WHERE ws.workout_plan_id = wp.workout_plan_id
               AND COALESCE(ws.session_date::text, '') >= TO_CHAR(DATE_TRUNC('week', $2::date), 'YYYY-MM-DD')
               AND COALESCE(ws.session_date::text, '') < TO_CHAR(DATE_TRUNC('week', $2::date) + INTERVAL '7 days', 'YYYY-MM-DD')
           )
         )`,
      [plan.rows[0].user_id, sessionDate, planId]
    );
    if (Number(weeklyPlanCount.rows[0].count) >= workoutFrequency) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: `This member's ${workoutFrequency}-day weekly workout frequency is already scheduled.`,
      });
    }

    const exerciseIds = [...new Set(sessions.map((session) => Number(session.exercise_id)))];
    const exercises = await client.query(
      `SELECT e.exercise_id, e.muscle_group, e.difficulty, c.category_name
       FROM exercises e
       LEFT JOIN exercise_categories c ON c.category_id = e.category_id
       WHERE e.exercise_id = ANY($1::int[])`,
      [exerciseIds]
    );
    if (exercises.rowCount !== exerciseIds.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: "One or more selected exercises are unavailable." });
    }
    const exercisesById = new Map(exercises.rows.map((exercise) => [Number(exercise.exercise_id), exercise]));
    for (const session of sessions) {
      const exercise = exercisesById.get(Number(session.exercise_id));
      if (plan.rows[0].training_program && !exerciseMatchesProgram(exercise, plan.rows[0].training_program)) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({ success: false, message: `This workout must stay within the ${plan.rows[0].training_program} program.` });
      }
      if (!requiresConservativeWorkout(exercise, member.rows[0].injuries || [], member.rows[0].health_conditions || [])
        && !isWorkoutDoseAllowed(member.rows[0].fitness_goal, session.sets, session.reps)) {
        const rules = getWorkoutGoalRules(member.rows[0].fitness_goal);
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: rules
            ? `For this member's fitness goal, unaffected exercises must use ${rules.sets[0]}–${rules.sets[1]} sets and ${rules.reps[0]}–${rules.reps[1]} reps.`
            : "Enter valid sets and reps for each exercise.",
        });
      }
    }

    const neighboringDates = [
      new Date(Date.UTC(
        parsedSessionDate.getUTCFullYear(),
        parsedSessionDate.getUTCMonth(),
        parsedSessionDate.getUTCDate() - 1
      )).toISOString().slice(0, 10),
      new Date(Date.UTC(
        parsedSessionDate.getUTCFullYear(),
        parsedSessionDate.getUTCMonth(),
        parsedSessionDate.getUTCDate() + 1
      )).toISOString().slice(0, 10),
    ];
    const neighboringMuscles = await client.query(
      `SELECT DISTINCT LOWER(BTRIM(e.muscle_group)) AS muscle_group
       FROM workout_plans wp
       JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
       JOIN exercises e ON e.exercise_id = ws.exercise_id
       WHERE wp.user_id = $1
         AND wp.workout_plan_id <> $3
         AND wp.approval_status IN ('Approved', 'Pending')
         AND ws.session_date = ANY($2::text[])
         AND NULLIF(BTRIM(e.muscle_group), '') IS NOT NULL`,
      [plan.rows[0].user_id, neighboringDates, planId]
    );
    const muscleTokens = (value) => String(value || "")
      .split(/[,/&+]/)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
    const neighboringMuscleSet = new Set(
      neighboringMuscles.rows.flatMap((row) => muscleTokens(row.muscle_group))
    );
    if (exercises.rows.some((exercise) =>
      muscleTokens(exercise.muscle_group).some((muscle) => neighboringMuscleSet.has(muscle))
    )) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "This plan repeats a muscle group from an adjacent workout day. Allow a recovery day before scheduling the same muscle group again.",
      });
    }

    // FIX: define planName once so it is in scope for both the UPDATE and the email below.
    const planName = formatWorkoutPlanName(
      member.rows[0].first_name,
      member.rows[0].last_name,
      plan.rows[0].training_program || "Workout"
    );

    await client.query(
      `UPDATE workout_plans
       SET plan_name = $1, goal = $2,
           scheduled_start_time = $3::time,
           scheduled_duration_minutes = $4,
           trainer_change_reason = $5,
           approval_status = CASE
             WHEN $7::boolean THEN 'Approved'
             WHEN approval_status = 'Rejected' THEN 'Pending'
             ELSE approval_status
           END
       WHERE workout_plan_id = $6`,
      [planName, plan.rows[0].goal, scheduledStartTime, sessionDuration, changeReason, planId, isInitialCoachRequest]
    );
    await client.query("DELETE FROM workout_sessions WHERE workout_plan_id = $1", [planId]);
    for (const session of sessions) {
      await client.query(
        `INSERT INTO workout_sessions
          (workout_plan_id, exercise_id, sets, reps, duration_minutes, session_date)
         VALUES ($1, $2, $3, $4, NULL, $5)`,
        [planId, Number(session.exercise_id), Number(session.sets), Number(session.reps), sessionDate]
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;
    const awaitingApproval = !isInitialCoachRequest
      && ["Pending", "Rejected"].includes(plan.rows[0].approval_status);
    await createNotification({
      audience: "user",
      recipientId: Number(plan.rows[0].user_id),
      message: `Your coach updated your workout plan for ${sessionDate}.${changeReason ? ` Reason: ${changeReason}` : ""}${awaitingApproval ? " It is awaiting approval." : ""}`,
      notificationType: "workout",
      targetUrl: `/user/workout?planId=${planId}&date=${sessionDate}`,
    }).catch((notificationError) => {
      console.error("Revised workout plan notification failed:", notificationError.message);
    });
    await deliverWorkoutPlanEmail({
      to: member.rows[0].email,
      firstName: member.rows[0].first_name,
      planName,
      sessionDate,
      status: "updated",
      reason: changeReason,
    }, "Workout plan update");
    res.json({ success: true, message: "Workout plan updated." });
  } catch (err) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("updateMyWorkoutPlan error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client?.release();
  }
};

const deleteMyWorkoutPlan = async (req, res) => {
  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    const plan = await client.query(
      `
      SELECT wp.workout_plan_id, wp.deletion_request_status, wp.requested_session_date
      FROM workout_plans wp
      WHERE wp.workout_plan_id = $1
        AND wp.trainer_id = $2
        AND (
          wp.user_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM users u
            WHERE u.user_id = wp.user_id
              AND u.trainer_id = $2
          )
        )
      FOR UPDATE
      `,
      [req.params.planId, req.trainer.trainer_id]
    );

    if (!plan.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({
        success: false,
        message: "Workout plan not found in your plans.",
      });
    }
    if (plan.rows[0].deletion_request_status === "Pending") {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "Review the member's deletion request using the approval controls before deleting this plan.",
      });
    }

    const planDate = await client.query(
      `SELECT COALESCE(
         MIN(ws.session_date) FILTER (
           WHERE ws.session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
         ),
         $2::date::text
       ) AS scheduled_date,
       TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS today
       FROM workout_sessions ws
       WHERE ws.workout_plan_id = $1`,
      [plan.rows[0].workout_plan_id, plan.rows[0].requested_session_date]
    );
    if (!planDate.rows[0].scheduled_date || planDate.rows[0].scheduled_date >= planDate.rows[0].today) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "Workout plans can only be deleted after their workout date has passed.",
      });
    }

    await client.query(
      "DELETE FROM workout_sessions WHERE workout_plan_id = $1",
      [plan.rows[0].workout_plan_id]
    );
    await client.query(
      "DELETE FROM workout_plans WHERE workout_plan_id = $1",
      [plan.rows[0].workout_plan_id]
    );
    await client.query("COMMIT");
    transactionStarted = false;
    res.json({ success: true, message: "Workout plan deleted." });
  } catch (err) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("deleteMyWorkoutPlan error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    client?.release();
  }
};

// =========================================================
// GET exercise catalog
// =========================================================

const getExerciseCatalog = async (req, res) => {
  try {
    const result = await loadExerciseCatalog();

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("getExerciseCatalog error:", err.message);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// GET logged-in trainer profile
// =========================================================

const getMyProfile = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        trainer_id,
        full_name,
        email,
        phone,
        specializations,
        profile_image,
        status,
        created_at,
        updated_at,
        goal_specialty,
        photo_url,
        bio
      FROM trainers
      WHERE trainer_id = $1
      `,
      [req.trainer.trainer_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found.",
      });
    }

    const trainer = result.rows[0];

    res.json({
      success: true,
      data: {
        ...trainer,
        specializations: specializationToArray(
          trainer.specializations
        ),
      },
    });
  } catch (err) {
    console.error("getMyProfile error:", err.message);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// PUT logged-in trainer photo
// =========================================================

const updateMyPhoto = async (req, res) => {
  try {
    const { photo_url } = req.body;

    if (!photo_url) {
      return res.status(400).json({
        success: false,
        message: "photo_url is required.",
      });
    }

    const imageCheck = validateImageDataUrl(photo_url);

    if (!imageCheck.ok) {
      return res.status(400).json({
        success: false,
        message: imageCheck.message,
      });
    }

    await pool.query(
      `
      UPDATE trainers
      SET
        photo_url = $1,
        updated_at = NOW()
      WHERE trainer_id = $2
      `,
      [photo_url, req.trainer.trainer_id]
    );

    res.json({
      success: true,
      message: "Photo updated.",
    });
  } catch (err) {
    console.error("updateMyPhoto error:", err.message);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// Helper: member belongs to trainer
// =========================================================

const memberBelongsToTrainer = async (
  userId,
  trainerId
) => {
  const check = await pool.query(
    `
    SELECT user_id
    FROM users
    WHERE user_id = $1
      AND trainer_id = $2
      AND COALESCE(account_status, 'Pending') = 'Active'
    `,
    [userId, trainerId]
  );

  return check.rows.length > 0;
};

// =========================================================
// GET member sessions
// =========================================================

const getRosterMemberSessions = async (req, res) => {
  try {
    const { userId } = req.params;

    const owns = await memberBelongsToTrainer(
      userId,
      req.trainer.trainer_id
    );

    if (!owns) {
      return res.status(403).json({
        success: false,
        message: "This member isn't on your roster.",
      });
    }

    const result = await pool.query(
      `
      SELECT
        ws.*,
        e.exercise_name,
        e.muscle_group,
        e.equipment
      FROM workout_sessions ws
      JOIN workout_plans wp
        ON ws.workout_plan_id = wp.workout_plan_id
      LEFT JOIN exercises e
        ON ws.exercise_id = e.exercise_id
      WHERE wp.user_id = $1
      ORDER BY ws.session_date ASC
      `,
      [userId]
    );

    res.json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error(
      "getRosterMemberSessions error:",
      err.message
    );

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// POST assign workout session
// =========================================================

const assignSessionAsTrainer = async (req, res) => {
  let client;
  let transactionStarted = false;
  try {
    const trainerId = req.trainer.trainer_id;

    const {
      user_id,
      exercise_id,
      sets,
      reps,
      duration_minutes,
      session_date,
    } = req.body;

    if (!user_id || !exercise_id || !session_date) {
      return res.status(400).json({
        success: false,
        message:
          "user_id, exercise_id, and session_date are required.",
      });
    }

    const setsValue = Number(sets);
    const repsValue = Number(reps);

    if (!Number.isInteger(setsValue) || setsValue < 1 || setsValue > 6) {
      return res.status(400).json({
        success: false,
        message: "Sets must be a whole number from 1 to 6.",
      });
    }

    if (!Number.isInteger(repsValue) || repsValue < 3 || repsValue > 16) {
      return res.status(400).json({
        success: false,
        message: "Reps must be a whole number from 3 to 16.",
      });
    }

    if (
      typeof session_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(session_date)
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid workout date.",
      });
    }

    const parsedSessionDate = new Date(`${session_date}T00:00:00.000Z`);
    if (
      Number.isNaN(parsedSessionDate.getTime()) ||
      parsedSessionDate.toISOString().slice(0, 10) !== session_date
    ) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid workout date.",
      });
    }

    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const currentDate = await client.query(
      "SELECT TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS today"
    );
    if (session_date < currentDate.rows[0].today) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "Workout date can't be in the past.",
      });
    }

    const memberResult = await client.query(
      `
      SELECT user_id, activity_level, fitness_goal, workout_days_per_week
      FROM users
      WHERE user_id = $1
        AND trainer_id = $2
        AND LOWER(COALESCE(account_status, 'pending')) = 'active'
      FOR UPDATE
      `,
      [user_id, trainerId]
    );

    if (!memberResult.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "This member isn't on your roster.",
      });
    }

    const member = memberResult.rows[0];
    if (!isWorkoutDoseAllowed(member.fitness_goal, setsValue, repsValue)) {
      const rules = getWorkoutGoalRules(member.fitness_goal);
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: `For this member's fitness goal, use ${rules.sets[0]}–${rules.sets[1]} sets and ${rules.reps[0]}–${rules.reps[1]} reps.`,
      });
    }
    const memberAvailability = await client.query(
      `SELECT day_of_week, start_time, end_time
       FROM user_workout_availability
       WHERE user_id = $1`,
      [user_id]
    );
    const [minimumDays, maximumDays] = getExperienceRange(member.activity_level);
    const workoutFrequency = Number(member.workout_days_per_week);
    const sessionDuration = DEFAULT_WORKOUT_SESSION_DURATION;
    if (!Number.isInteger(workoutFrequency) || workoutFrequency < minimumDays || workoutFrequency > maximumDays) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: `${member.activity_level || "Beginner"} users should select ${minimumDays}–${maximumDays} workout days per week before a plan can be scheduled.`,
      });
    }
    if (workoutFrequency !== memberAvailability.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: `The member must select exactly ${workoutFrequency} available days to match their weekly workout frequency.`,
      });
    }
    const weekday = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ][parsedSessionDate.getUTCDay()];
    const scheduledAvailability = memberAvailability.rows.find(
      (slot) => slot.day_of_week === weekday
    );
    if (!scheduledAvailability) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "The selected date is not part of this client's availability.",
      });
    }
    const scheduledStartTime = await getCoachCompatibleStartTime(
      client,
      trainerId,
      parsedSessionDate.getUTCDay(),
      scheduledAvailability,
      sessionDuration
    );
    if (!scheduledStartTime) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "The coach and member do not have a shared 60-minute availability window on this day.",
      });
    }

    const exercise = await client.query(
      "SELECT muscle_group FROM exercises WHERE exercise_id = $1",
      [exercise_id]
    );
    if (!exercise.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: "Choose a valid exercise." });
    }

    const adjacentDates = [
      new Date(Date.UTC(
        parsedSessionDate.getUTCFullYear(),
        parsedSessionDate.getUTCMonth(),
        parsedSessionDate.getUTCDate() - 1
      )).toISOString().slice(0, 10),
      new Date(Date.UTC(
        parsedSessionDate.getUTCFullYear(),
        parsedSessionDate.getUTCMonth(),
        parsedSessionDate.getUTCDate() + 1
      )).toISOString().slice(0, 10),
    ];
    const adjacentMuscles = await client.query(
      `SELECT DISTINCT LOWER(BTRIM(e.muscle_group)) AS muscle_group
       FROM workout_plans wp
       JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
       JOIN exercises e ON e.exercise_id = ws.exercise_id
       WHERE wp.user_id = $1
         AND ws.session_date = ANY($2::text[])
         AND NULLIF(BTRIM(e.muscle_group), '') IS NOT NULL`,
      [user_id, adjacentDates]
    );
    const muscleTokens = (value) => String(value || "")
      .split(/[,/&+]/)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
    const scheduledMuscles = new Set(
      adjacentMuscles.rows.flatMap((row) => muscleTokens(row.muscle_group))
    );
    if (muscleTokens(exercise.rows[0].muscle_group).some((muscle) => scheduledMuscles.has(muscle))) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "Allow a recovery day before scheduling the same muscle group again.",
      });
    }

    const weeklyPlanCount = await client.query(
      `SELECT COUNT(DISTINCT wp.workout_plan_id)::int AS count
       FROM workout_plans wp
       JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
       WHERE wp.user_id = $1
         AND COALESCE(ws.session_date::text, '') >= TO_CHAR(DATE_TRUNC('week', $2::date), 'YYYY-MM-DD')
         AND COALESCE(ws.session_date::text, '') < TO_CHAR(DATE_TRUNC('week', $2::date) + INTERVAL '7 days', 'YYYY-MM-DD')`,
      [user_id, session_date]
    );
    if (Number(weeklyPlanCount.rows[0].count) >= workoutFrequency) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: `This member's ${workoutFrequency}-day weekly workout frequency is already scheduled.`,
      });
    }

    const existingSession = await client.query(
      `
      SELECT wp.workout_plan_id,
        BOOL_OR(ws.started_at IS NOT NULL OR ws.completed = TRUE) AS has_started
      FROM workout_plans wp
      JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
      WHERE wp.user_id = $1
        AND COALESCE(ws.session_date::text, '') = $2
      GROUP BY wp.workout_plan_id
      LIMIT 1
      `,
      [user_id, session_date]
    );
    if (existingSession.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: existingSession.rows[0].has_started
          ? "This workout has already started and cannot be changed."
          : "A workout plan already exists for this member on that date. Edit the existing plan instead.",
      });
    }

    const created = await client.query(
      `INSERT INTO workout_plans
         (user_id, trainer_id, plan_name, goal, scheduled_start_time, scheduled_duration_minutes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING workout_plan_id`,
      [user_id, trainerId, "Coach Plan", "General Fitness", scheduledStartTime, sessionDuration]
    );
    const planId = created.rows[0].workout_plan_id;

    const result = await client.query(
      `
      INSERT INTO workout_sessions
        (
          workout_plan_id,
          exercise_id,
          sets,
          reps,
          duration_minutes,
          session_date
        )
      VALUES
        ($1, $2, $3, $4, $5, $6)
      RETURNING *
      `,
      [
        planId,
        exercise_id,
        setsValue,
        repsValue,
        duration_minutes || null,
        session_date,
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    await createNotification({
      audience: "user",
      recipientId: Number(user_id),
      message: "Your coach added a workout task to your plan.",
      notificationType: "workout",
      targetUrl: "/user/workout",
    }).catch((err) => {
      console.error("Assigned workout notification failed:", err.message);
    });

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error(
      "assignSessionAsTrainer error:",
      err.message
    );

    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    client?.release();
  }
};

// =========================================================
// DELETE trainer-assigned workout session
// =========================================================

const deleteSessionAsTrainer = async (req, res) => {
  let client;
  let transactionStarted = false;
  try {
    const { sessionId } = req.params;
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const check = await client.query(
      `SELECT ws.session_id, ws.session_date::text AS session_date,
              ws.started_at, ws.completed,
              TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS today
      FROM workout_sessions ws
      JOIN workout_plans wp
        ON ws.workout_plan_id = wp.workout_plan_id
      JOIN users u
        ON wp.user_id = u.user_id
      WHERE ws.session_id = $1
        AND u.trainer_id = $2
      FOR UPDATE OF ws`,
      [sessionId, req.trainer.trainer_id]
    );
    if (!check.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "You can't modify this workout.",
      });
    }

    const workout = check.rows[0];
    if (workout.started_at || workout.completed) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "This workout has started or finished and can no longer be changed.",
      });
    }
    const date = String(workout.session_date).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date < workout.today) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "This workout's date has passed and it can no longer be changed.",
      });
    }

    await client.query(
      `
      DELETE FROM workout_sessions
      WHERE session_id = $1
      `,
      [sessionId]
    );
    await client.query("COMMIT");
    transactionStarted = false;

    res.json({
      success: true,
      message: "Workout removed.",
    });
  } catch (err) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error(
      "deleteSessionAsTrainer error:",
      err.message
    );

    res.status(500).json({
      success: false,
      message: err.message,
    });
  } finally {
    client?.release();
  }
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  getTrainers,
  getTrainerById,
  createTrainer,
  updateTrainer,
  approveTrainer,
  rejectTrainer,
  deactivateTrainer,
  deleteTrainer,
  getActiveTrainers,
  getTrainerRoster,
  loginTrainer,
  getMyRoster,
  getMyMemberProgress,
  getMyProfile,
  updateMyPhoto,
  getMyWorkoutPlans,
  createMyWorkoutPlan,
  reviewMemberWorkoutPlan,
  reviewMemberWorkoutPlanDeletion,
  updateMyWorkoutPlan,
  deleteMyWorkoutPlan,
  getExerciseCatalog,
  getRosterMemberSessions,
  assignSessionAsTrainer,
  deleteSessionAsTrainer,
};