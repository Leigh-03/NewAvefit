const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const loadExerciseCatalog = require("../utils/exerciseCatalog");
const { createNotification } = require("../utils/notifications");
const {
  sendWorkoutPlanReadyEmail,
  sendAccountPasswordChangedEmail,
} = require("../utils/mailer");

const {
  validateEmail,
  validatePassword,
  validateName,
  validateImageDataUrl,
  normalizeEmail,
} = require("../utils/security");

const GOAL_SPECIALTIES = [
  "Weight Loss",
  "Muscle Gain",
  "Maintain Weight",
  "General Fitness",
];

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
      ORDER BY created_at DESC
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

    if (password) {
      const hashed = await bcrypt.hash(password, 12);

      const updateResult = await pool.query(
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
          String(full_name).trim(),
          normalizeEmail(email),
          phone ? String(phone).trim() : null,
          cleanSpecializations,
          status,
          hashed,
          photo_url || null,
          goal_specialty || null,
          bioText || null,
          id,
        ]
      );
      if (updateResult.rowCount > 0) {
        try {
          const delivery = await sendAccountPasswordChangedEmail({
            to: normalizeEmail(email),
            accountName: String(full_name).trim(),
            accountType: "coach",
          });
          if (!delivery.delivered) {
            console.error(`Coach password change email was not delivered to ${normalizeEmail(email)}.`);
          }
        } catch (mailError) {
          console.error("Coach password change email failed:", mailError.message);
        }
      }
    } else {
      await pool.query(
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
          String(full_name).trim(),
          normalizeEmail(email),
          phone ? String(phone).trim() : null,
          cleanSpecializations,
          status,
          photo_url || null,
          goal_specialty || null,
          bioText || null,
          id,
        ]
      );
    }

    res.json({
      success: true,
      message: "Trainer updated.",
    });
  } catch (err) {
    console.error("updateTrainer error:", err.message);

    if (err.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "A trainer with that email already exists.",
      });
    }

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// PUT approve trainer
// =========================================================

const approveTrainer = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE trainers
      SET
        status = 'Active',
        token_version = COALESCE(token_version, 0) + 1,
        updated_at = NOW()
      WHERE trainer_id = $1
      RETURNING trainer_id, status
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found.",
      });
    }

    res.json({
      success: true,
      message: "Trainer approved successfully.",
      trainer: result.rows[0],
    });
  } catch (err) {
    console.error("approveTrainer error:", err.message);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// PUT reject trainer
// =========================================================

const rejectTrainer = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE trainers
      SET
        status = 'Rejected',
        token_version = COALESCE(token_version, 0) + 1,
        updated_at = NOW()
      WHERE trainer_id = $1
      RETURNING trainer_id, status
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found.",
      });
    }

    res.json({
      success: true,
      message: "Trainer rejected.",
      trainer: result.rows[0],
    });
  } catch (err) {
    console.error("rejectTrainer error:", err.message);

    res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// PUT deactivate trainer
// =========================================================

const deactivateTrainer = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE trainers
      SET
        status = 'Inactive',
        token_version = COALESCE(token_version, 0) + 1,
        updated_at = NOW()
      WHERE trainer_id = $1
      RETURNING trainer_id, status
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Trainer not found.",
      });
    }

    res.json({
      success: true,
      message: "Trainer deactivated.",
      trainer: result.rows[0],
    });
  } catch (err) {
    console.error("deactivateTrainer error:", err.message);

    res.status(500).json({
      success: false,
      message: err.message,
    });
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
        pl.weight AS latest_weight,
        pl.bmi AS latest_bmi,
        pl.log_date AS latest_log_date,
        workout_stats.assigned_workouts,
        workout_stats.completed_workouts
      FROM users u
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
        AND LOWER(COALESCE(u.account_status, 'pending')) = 'active'
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
        pl.weight AS latest_weight,
        pl.bmi AS latest_bmi,
        pl.log_date AS latest_log_date,
        COALESCE(workout_stats.assigned_workouts, 0)::int AS assigned_workouts,
        COALESCE(workout_stats.completed_workouts, 0)::int AS completed_workouts,
        COALESCE(workout_days.workouts_by_day, '[]'::json) AS workouts_by_day
      FROM users u
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

const getMyWorkoutPlans = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        wp.workout_plan_id,
        wp.plan_name,
        wp.goal,
        wp.status,
        wp.created_at,
        u.user_id,
        plan_sessions.scheduled_date,
        plan_sessions.exercise_count,
        plan_sessions.completed_count,
        CASE
          WHEN plan_sessions.exercise_count > 0
            AND plan_sessions.completed_count = plan_sessions.exercise_count
            THEN 'Complete'
          WHEN plan_sessions.scheduled_date IS NULL
            OR plan_sessions.scheduled_date > TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD')
            THEN 'Active'
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
            WHERE ws.session_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          ) AS scheduled_date,
          COUNT(ws.session_id)::int AS exercise_count,
          COUNT(ws.session_id) FILTER (WHERE ws.completed = TRUE)::int AS completed_count,
          COALESCE(
            JSON_AGG(
              JSON_BUILD_OBJECT(
                'exercise_id', ws.exercise_id,
                'sets', ws.sets,
                'reps', ws.reps
              )
              ORDER BY ws.session_id
            ) FILTER (WHERE ws.session_id IS NOT NULL),
            '[]'::json
          ) AS sessions,
          COALESCE(BOOL_OR(ws.started_at IS NOT NULL OR ws.completed = TRUE), FALSE) AS has_started
        FROM workout_sessions ws
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
  const planName = typeof req.body.plan_name === "string" ? req.body.plan_name.trim() : "";
  const goal = typeof req.body.goal === "string" ? req.body.goal.trim() : "";
  const userId = Number(req.body.user_id);
  const sessionDate = req.body.session_date;
  const sessions = req.body.sessions;

  if (!planName) {
    return res.status(400).json({ success: false, message: "Plan name is required." });
  }
  if (!goal) {
    return res.status(400).json({ success: false, message: "Goal is required." });
  }
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
  if (!Array.isArray(sessions) || sessions.length === 0 || sessions.length > 30) {
    return res.status(400).json({ success: false, message: "A workout routine must contain between 1 and 30 exercises." });
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
      SELECT user_id, first_name, email, preferred_days
      FROM users
      WHERE user_id = $1
        AND trainer_id = $2
        AND COALESCE(account_status, 'Pending') = 'Active'
      FOR UPDATE
      `,
      [userId, trainerId]
    );
    if (!member.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({ success: false, message: "This member isn't on your roster." });
    }

    const preferredDays = Array.isArray(member.rows[0].preferred_days)
      ? member.rows[0].preferred_days.map((day) => String(day).trim().toLowerCase())
      : [];
    const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const scheduledWeekday = weekdayNames[parsedSessionDate.getUTCDay()];
    if (preferredDays.length > 0 && !preferredDays.includes(scheduledWeekday)) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: `Choose one of the member's preferred workout days: ${member.rows[0].preferred_days.join(", ")}.`,
      });
    }

    const existingPlan = await client.query(
      `
      SELECT wp.workout_plan_id
      FROM workout_plans wp
      JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
      WHERE wp.user_id = $1
        AND ws.session_date = $2
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
      "SELECT exercise_id FROM exercises WHERE exercise_id = ANY($1::int[])",
      [exerciseIds]
    );
    if (exercises.rowCount !== exerciseIds.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: "One or more selected exercises are unavailable." });
    }

    const plan = await client.query(
      `
      INSERT INTO workout_plans (user_id, trainer_id, plan_name, goal)
      VALUES ($1, $2, $3, $4)
      RETURNING workout_plan_id, plan_name, goal, status, created_at
      `,
      [userId, trainerId, planName, goal || null]
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

const updateMyWorkoutPlan = async (req, res) => {
  const trainerId = req.trainer.trainer_id;
  const planId = Number(req.params.planId);
  const planName = typeof req.body.plan_name === "string" ? req.body.plan_name.trim() : "";
  const goal = typeof req.body.goal === "string" ? req.body.goal.trim() : "";
  const sessionDate = req.body.session_date;
  const sessions = req.body.sessions;

  if (!Number.isInteger(planId) || planId < 1) {
    return res.status(400).json({ success: false, message: "Choose a valid workout plan." });
  }
  if (!planName) {
    return res.status(400).json({ success: false, message: "Plan name is required." });
  }
  if (!goal) {
    return res.status(400).json({ success: false, message: "Goal is required." });
  }
  const parsedSessionDate = typeof sessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
    ? new Date(`${sessionDate}T00:00:00.000Z`)
    : null;
  if (!parsedSessionDate || !Number.isFinite(parsedSessionDate.getTime()) ||
      parsedSessionDate.toISOString().slice(0, 10) !== sessionDate) {
    return res.status(400).json({ success: false, message: "Choose a valid workout date." });
  }
  if (!Array.isArray(sessions) || sessions.length === 0 || sessions.length > 30) {
    return res.status(400).json({ success: false, message: "A workout routine must contain between 1 and 30 exercises." });
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
      SELECT wp.workout_plan_id, wp.user_id
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

    const planSessions = await client.query(
      `SELECT session_id, session_date::text AS session_date, started_at, completed
       FROM workout_sessions
       WHERE workout_plan_id = $1
       FOR UPDATE`,
      [planId]
    );
    const currentDate = await client.query(
      "SELECT TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS today"
    );
    const todayDate = currentDate.rows[0].today;
    const hasPastWorkoutDate = planSessions.rows.some((session) => {
      const date = String(session.session_date).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < todayDate;
    });
    if (hasPastWorkoutDate) {
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

    const keepingExistingDate = planSessions.rows.length > 0
      && planSessions.rows.every((session) => String(session.session_date).slice(0, 10) === sessionDate);
    if (!keepingExistingDate) {
      const member = await client.query(
        `SELECT user_id, preferred_days
         FROM users
         WHERE user_id = $1 AND trainer_id = $2 AND COALESCE(account_status, 'Pending') = 'Active'`,
        [plan.rows[0].user_id, trainerId]
      );
      if (!member.rowCount) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(403).json({ success: false, message: "This member isn't on your roster." });
      }

      const preferredDays = Array.isArray(member.rows[0].preferred_days)
        ? member.rows[0].preferred_days.map((day) => String(day).trim().toLowerCase())
        : [];
      const weekdayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
      const scheduledWeekday = weekdayNames[parsedSessionDate.getUTCDay()];
      if (preferredDays.length > 0 && !preferredDays.includes(scheduledWeekday)) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: `Choose one of the member's preferred workout days: ${member.rows[0].preferred_days.join(", ")}.`,
        });
      }
    }

    const existingPlan = await client.query(
      `
      SELECT wp.workout_plan_id
      FROM workout_plans wp
      JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
      WHERE wp.user_id = $1
        AND ws.session_date = $2
        AND wp.workout_plan_id <> $3
      LIMIT 1
      `,
      [plan.rows[0].user_id, sessionDate, planId]
    );
    if (!keepingExistingDate && existingPlan.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "A workout plan already exists for this member on that date. Edit the existing plan instead.",
      });
    }

    const exerciseIds = [...new Set(sessions.map((session) => Number(session.exercise_id)))];
    const exercises = await client.query(
      "SELECT exercise_id FROM exercises WHERE exercise_id = ANY($1::int[])",
      [exerciseIds]
    );
    if (exercises.rowCount !== exerciseIds.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: "One or more selected exercises are unavailable." });
    }

    await client.query(
      "UPDATE workout_plans SET plan_name = $1, goal = $2 WHERE workout_plan_id = $3",
      [planName, goal, planId]
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
      SELECT wp.workout_plan_id
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

    const planDate = await client.query(
      `SELECT MIN(session_date) FILTER (
         WHERE session_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       ) AS scheduled_date,
       COALESCE(BOOL_OR(started_at IS NOT NULL OR completed = TRUE), FALSE) AS has_started,
       TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS today
       FROM workout_sessions
       WHERE workout_plan_id = $1`,
      [plan.rows[0].workout_plan_id]
    );
    if (planDate.rows[0].has_started) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "This workout plan has started or finished and can no longer be changed.",
      });
    }
    if (planDate.rows[0].scheduled_date && planDate.rows[0].scheduled_date < planDate.rows[0].today) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: "This workout plan's date has passed and it can no longer be changed.",
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

    const memberAvailability = await client.query(
      `
      SELECT preferred_days
      FROM users
      WHERE user_id = $1
        AND trainer_id = $2
        AND COALESCE(account_status, 'Pending') = 'Active'
      FOR UPDATE
      `,
      [user_id, trainerId]
    );

    if (!memberAvailability.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "This member isn't on your roster.",
      });
    }

    const preferredDays = memberAvailability.rows[0]?.preferred_days || [];
    const weekday = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ][parsedSessionDate.getUTCDay()];

    if (
      !Array.isArray(preferredDays) ||
      !preferredDays.some(
        (day) => String(day).trim().toLowerCase() === weekday.toLowerCase()
      )
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: "The selected date is not part of this client's availability.",
      });
    }

    const existingSession = await client.query(
      `
      SELECT wp.workout_plan_id,
        BOOL_OR(ws.started_at IS NOT NULL OR ws.completed = TRUE) AS has_started
      FROM workout_plans wp
      JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
      WHERE wp.user_id = $1
        AND ws.session_date = $2
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

    const planRes = await client.query(
      `
      SELECT workout_plan_id
      FROM workout_plans
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [user_id]
    );

    let planId;

    if (planRes.rows.length > 0) {
      planId = planRes.rows[0].workout_plan_id;

      await client.query(
        `
        UPDATE workout_plans
        SET trainer_id = $1
        WHERE workout_plan_id = $2
        `,
        [trainerId, planId]
      );
    } else {
      const created = await client.query(
        `
        INSERT INTO workout_plans
          (
            user_id,
            trainer_id,
            plan_name,
            goal
          )
        VALUES
          ($1, $2, $3, $4)
        RETURNING workout_plan_id
        `,
        [
          user_id,
          trainerId,
          "Coach Plan",
          "General Fitness",
        ]
      );

      planId = created.rows[0].workout_plan_id;
    }

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
  try {
    const { sessionId } = req.params;

    const check = await pool.query(
      `
      SELECT ws.session_id
      FROM workout_sessions ws
      JOIN workout_plans wp
        ON ws.workout_plan_id = wp.workout_plan_id
      JOIN users u
        ON wp.user_id = u.user_id
      WHERE ws.session_id = $1
        AND u.trainer_id = $2
      `,
      [sessionId, req.trainer.trainer_id]
    );

    if (check.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "You can't modify this workout.",
      });
    }

    await pool.query(
      `
      DELETE FROM workout_sessions
      WHERE session_id = $1
      `,
      [sessionId]
    );

    res.json({
      success: true,
      message: "Workout removed.",
    });
  } catch (err) {
    console.error(
      "deleteSessionAsTrainer error:",
      err.message
    );

    res.status(500).json({
      success: false,
      message: err.message,
    });
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
  getMyProfile,
  updateMyPhoto,
  getMyWorkoutPlans,
  createMyWorkoutPlan,
  updateMyWorkoutPlan,
  deleteMyWorkoutPlan,
  getExerciseCatalog,
  getRosterMemberSessions,
  assignSessionAsTrainer,
  deleteSessionAsTrainer,
};