const pool = require("../db");
const { createNotification } = require("../utils/notifications");

const SCHEDULED_FOR_TODAY_SQL = `(
  (
    ws.session_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND ws.session_date = TO_CHAR(NOW() AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD')
  )
  OR (
    ws.session_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND LOWER(BTRIM(ws.session_date)) = LOWER(TO_CHAR(NOW() AT TIME ZONE 'Asia/Manila', 'FMDay'))
  )
)`;

const getOwnedSessionSchedule = async (sessionId, userId) => pool.query(`
  SELECT ws.session_id, ws.session_date, ${SCHEDULED_FOR_TODAY_SQL} AS scheduled_today
  FROM workout_sessions ws
  JOIN workout_plans wp ON ws.workout_plan_id = wp.workout_plan_id
  WHERE ws.session_id = $1 AND wp.user_id = $2
`, [sessionId, userId]);

// GET user's workout plan
const getUserWorkoutPlan = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ws.*, e.exercise_name, e.muscle_group, e.difficulty, e.equipment, e.description
      FROM workout_sessions ws
      LEFT JOIN exercises e ON ws.exercise_id = e.exercise_id
      WHERE ws.workout_plan_id IN (
        SELECT workout_plan_id FROM workout_plans WHERE user_id = $1
      )
      ORDER BY ws.session_date ASC
    `, [req.user.user_id]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("getUserWorkoutPlan error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET user's workout plans list
const getUserPlans = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM workout_plans WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.user_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("getUserPlans error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST create workout session (add workout to plan)
const addWorkoutSession = async (req, res) => {
  try {
    const { workout_plan_id, exercise_id, sets, reps, duration_minutes, session_date } = req.body;

    // Create a plan if none provided
    let planId = workout_plan_id;
    if (!planId) {
      const planRes = await pool.query(
        "INSERT INTO workout_plans (user_id, plan_name, goal) VALUES ($1, $2, $3) RETURNING workout_plan_id",
        [req.user.user_id, "My Workout Plan", "General Fitness"]
      );
      planId = planRes.rows[0].workout_plan_id;
    }

    const result = await pool.query(`
      INSERT INTO workout_sessions (workout_plan_id, exercise_id, sets, reps, duration_minutes, session_date)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [planId, exercise_id || null, sets || null, reps || null, duration_minutes || null, session_date || new Date()]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("addWorkoutSession error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT update workout session
const updateWorkoutSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { sets, reps, duration_minutes, completed } = req.body;
    if (completed === true) {
      const scheduledSession = await getOwnedSessionSchedule(id, req.user.user_id);
      if (!scheduledSession.rowCount) {
        return res.status(404).json({ success: false, message: "Workout not found." });
      }
      if (!scheduledSession.rows[0].scheduled_today) {
        return res.status(400).json({
          success: false,
          message: "You can only complete this workout on its scheduled day.",
        });
      }
    }

    const result = await pool.query(`
      UPDATE workout_sessions ws
      SET sets=$1, reps=$2, duration_minutes=$3, completed=$4
      FROM workout_plans wp
      WHERE ws.session_id=$5
        AND ws.workout_plan_id = wp.workout_plan_id
        AND wp.user_id = $6
        AND ($4 IS NOT TRUE OR (ws.started_at IS NOT NULL AND ${SCHEDULED_FOR_TODAY_SQL}))
      RETURNING ws.session_id
    `, [sets, reps, duration_minutes, completed || false, id, req.user.user_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Workout not found." });
    }

    res.json({ success: true, message: "Workout updated." });
  } catch (err) {
    console.error("updateWorkoutSession error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT record the member's workout start/check-in time.
const startWorkoutSession = async (req, res) => {
  try {
    const scheduledSession = await getOwnedSessionSchedule(req.params.id, req.user.user_id);
    if (!scheduledSession.rowCount) {
      return res.status(404).json({ success: false, message: "Workout not found." });
    }
    if (!scheduledSession.rows[0].scheduled_today) {
      return res.status(400).json({
        success: false,
        message: "You can only start this workout on its scheduled day.",
      });
    }

    const result = await pool.query(`
      UPDATE workout_sessions ws
      SET started_at = COALESCE(ws.started_at, NOW())
      FROM workout_plans wp
      WHERE ws.session_id = $1
        AND ws.workout_plan_id = wp.workout_plan_id
        AND wp.user_id = $2
        AND ws.completed = false
        AND ${SCHEDULED_FOR_TODAY_SQL}
      RETURNING ws.session_id, ws.started_at
    `, [req.params.id, req.user.user_id]);

    if (result.rowCount === 0) {
      return res.status(400).json({ success: false, message: "This workout can only be started on its scheduled day." });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("startWorkoutSession error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT mark session as complete
const completeSession = async (req, res) => {
  try {
    const scheduledSession = await getOwnedSessionSchedule(req.params.id, req.user.user_id);
    if (!scheduledSession.rowCount) {
      return res.status(404).json({ success: false, message: "Workout not found." });
    }
    if (!scheduledSession.rows[0].scheduled_today) {
      return res.status(400).json({
        success: false,
        message: "You can only complete this workout on its scheduled day.",
      });
    }

    const result = await pool.query(`
      UPDATE workout_sessions ws
      SET completed = true, completed_at = NOW()
      FROM workout_plans wp
      WHERE ws.session_id = $1
        AND ws.workout_plan_id = wp.workout_plan_id
        AND wp.user_id = $2
        AND ws.started_at IS NOT NULL
        AND ws.completed = false
        AND ${SCHEDULED_FOR_TODAY_SQL}
      RETURNING ws.session_id, ws.workout_plan_id
    `, [req.params.id, req.user.user_id]);

    if (result.rowCount === 0) {
      return res.status(400).json({ success: false, message: "This workout cannot be completed. Start it on its scheduled day first." });
    }

    let workout;
    try {
      const workoutDetails = await pool.query(
        `SELECT COALESCE(wp.trainer_id, u.trainer_id) AS trainer_id,
                e.exercise_name, u.first_name, u.last_name
         FROM workout_plans wp
         JOIN users u ON u.user_id = wp.user_id
         JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
         LEFT JOIN exercises e ON e.exercise_id = ws.exercise_id
         WHERE wp.workout_plan_id = $1 AND ws.session_id = $2`,
        [result.rows[0].workout_plan_id, result.rows[0].session_id]
      );
      workout = workoutDetails.rows[0];
    } catch (err) {
      console.error("Workout completion notification recipient lookup failed:", err.message);
    }
    if (workout?.trainer_id) {
      const memberName = `${workout.first_name || ""} ${workout.last_name || ""}`.trim() || "A member";
      await createNotification({
        audience: "trainer",
        recipientId: workout.trainer_id,
        message: `${memberName} completed ${workout.exercise_name || "a workout task"}.`,
        notificationType: "workout",
        userName: memberName,
        targetUrl: "/trainer/roster",
      }).catch((err) => {
        console.error("Workout completion trainer notification failed:", err.message);
      });
    }

    res.json({ success: true, message: "Session completed." });
  } catch (err) {
    console.error("completeSession error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE workout session
const deleteWorkoutSession = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM workout_sessions ws
      USING workout_plans wp
      WHERE ws.session_id = $1
        AND ws.workout_plan_id = wp.workout_plan_id
        AND wp.user_id = $2
        AND ws.completed = false
      RETURNING ws.session_id
    `, [id, req.user.user_id]);

    if (result.rowCount === 0) {
      const existing = await pool.query(`
        SELECT ws.completed
        FROM workout_sessions ws
        JOIN workout_plans wp ON ws.workout_plan_id = wp.workout_plan_id
        WHERE ws.session_id = $1 AND wp.user_id = $2
      `, [id, req.user.user_id]);
      if (existing.rows[0]?.completed) {
        return res.status(409).json({ success: false, message: "Completed workouts cannot be deleted." });
      }
      return res.status(404).json({ success: false, message: "Workout not found." });
    }

    res.json({ success: true, message: "Workout deleted." });
  } catch (err) {
    console.error("deleteWorkoutSession error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE reset all sessions in user's plan
const resetWeek = async (req, res) => {
  try {
    await pool.query(`
      DELETE FROM workout_sessions
      WHERE workout_plan_id IN (
        SELECT workout_plan_id FROM workout_plans WHERE user_id=$1
      )
      AND completed = false
      AND (
        session_date = ANY(ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']::text[])
        OR (
          session_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND session_date >= TO_CHAR(DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD')
          AND session_date < TO_CHAR((DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Manila') + INTERVAL '7 days')::date, 'YYYY-MM-DD')
        )
      )
    `, [req.user.user_id]);
    res.json({ success: true, message: "Week reset." });
  } catch (err) {
    console.error("resetWeek error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getUserWorkoutPlan, getUserPlans, addWorkoutSession, updateWorkoutSession, startWorkoutSession, completeSession, deleteWorkoutSession, resetWeek };