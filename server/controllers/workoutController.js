const pool = require("../db");
const getExerciseCatalog = require("../utils/exerciseCatalog");
const { createNotification } = require("../utils/notifications");

const getWorkouts = async (req, res) => {
  try {
    const result = await getExerciseCatalog();
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("getWorkouts error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getCategories = async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM exercise_categories ORDER BY category_name ASC");
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createWorkout = async (req, res) => {
  try {
    const { exercise_name, category_id, muscle_group, difficulty, calories_per_minute, description, equipment, movement_steps } = req.body;
    const result = await pool.query(`
      INSERT INTO exercises (exercise_name, category_id, muscle_group, difficulty, calories_per_minute, description, equipment, movement_steps)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [exercise_name, category_id || null, muscle_group, difficulty, calories_per_minute || null, description, equipment, movement_steps ? JSON.stringify(movement_steps) : null]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateWorkout = async (req, res) => {
  try {
    const { id } = req.params;
    const { exercise_name, category_id, muscle_group, difficulty, calories_per_minute, description, equipment, movement_steps } = req.body;
    await pool.query(`
      UPDATE exercises SET exercise_name=$1, category_id=COALESCE($2, category_id),
      muscle_group=$3, difficulty=$4, calories_per_minute=COALESCE($5, calories_per_minute),
      description=$6, equipment=$7, movement_steps=$8 WHERE exercise_id=$9
    `, [exercise_name, category_id || null, muscle_group, difficulty, calories_per_minute || null, description, equipment, movement_steps ? JSON.stringify(movement_steps) : null, id]);
    res.json({ success: true, message: "Exercise updated." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteWorkout = async (req, res) => {
  try {
    await pool.query("DELETE FROM exercises WHERE exercise_id = $1", [req.params.id]);
    res.json({ success: true, message: "Exercise deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const getWorkoutPlans = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT wp.workout_plan_id, wp.plan_name, wp.goal, wp.status, wp.created_at,
        u.first_name || ' ' || u.last_name AS member_name, u.user_id,
        t.full_name AS trainer_name
      FROM workout_plans wp
      LEFT JOIN users u ON wp.user_id = u.user_id
      LEFT JOIN trainers t ON wp.trainer_id = t.trainer_id
      ORDER BY wp.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const createWorkoutPlan = async (req, res) => {
  try {
    const { user_id, trainer_id, plan_name, goal } = req.body;
    const result = await pool.query(`
      INSERT INTO workout_plans (user_id, trainer_id, plan_name, goal)
      VALUES ($1,$2,$3,$4) RETURNING *
    `, [user_id || null, trainer_id || null, plan_name, goal]);
    if (user_id) {
      await createNotification({
        audience: "user",
        recipientId: Number(user_id),
        message: `Your coach added the workout plan "${plan_name}".`,
        notificationType: "workout",
        targetUrl: "/user/workout",
      }).catch((err) => {
        console.error("Workout plan notification failed:", err.message);
      });
    }
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const deleteWorkoutPlan = async (req, res) => {
  try {
    await pool.query("DELETE FROM workout_plans WHERE workout_plan_id = $1", [req.params.id]);
    res.json({ success: true, message: "Workout plan deleted." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET all workout sessions assigned to a specific member (across their plans)
const getMemberSessions = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(`
      SELECT ws.*, e.exercise_name, e.muscle_group, e.equipment
      FROM workout_sessions ws
      JOIN workout_plans wp ON ws.workout_plan_id = wp.workout_plan_id
      LEFT JOIN exercises e ON ws.exercise_id = e.exercise_id
      WHERE wp.user_id = $1
      ORDER BY ws.session_date ASC
    `, [userId]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("getMemberSessions error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST assign a workout (exercise + day) to a member — used by trainers/admin.
// Finds the member's existing coach-managed plan or creates one on the fly.
const assignSessionToMember = async (req, res) => {
  try {
    const { user_id, trainer_id, exercise_id, sets, reps, duration_minutes, session_date } = req.body;
    if (!user_id || !exercise_id || !session_date) {
      return res.status(400).json({ success: false, message: "user_id, exercise_id, and session_date are required." });
    }

    let planRes = await pool.query(
      "SELECT workout_plan_id FROM workout_plans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [user_id]
    );

    let planId;
    if (planRes.rows.length > 0) {
      planId = planRes.rows[0].workout_plan_id;
      // Keep the plan's trainer_id current if a trainer is assigning.
      if (trainer_id) {
        await pool.query("UPDATE workout_plans SET trainer_id = $1 WHERE workout_plan_id = $2", [trainer_id, planId]);
      }
    } else {
      const created = await pool.query(
        `INSERT INTO workout_plans (user_id, trainer_id, plan_name, goal)
         VALUES ($1,$2,$3,$4) RETURNING workout_plan_id`,
        [user_id, trainer_id || null, "Coach Plan", "General Fitness"]
      );
      planId = created.rows[0].workout_plan_id;
    }

    const result = await pool.query(`
      INSERT INTO workout_sessions (workout_plan_id, exercise_id, sets, reps, duration_minutes, session_date)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [planId, exercise_id, sets || null, reps || null, duration_minutes || null, session_date]);

    await createNotification({
      audience: "user",
      recipientId: Number(user_id),
      message: "A new workout task was added to your plan.",
      notificationType: "workout",
      targetUrl: "/user/workout",
    }).catch((err) => {
      console.error("Assigned workout notification failed:", err.message);
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("assignSessionToMember error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE a session assigned by a trainer/admin
const deleteAssignedSession = async (req, res) => {
  try {
    await pool.query("DELETE FROM workout_sessions WHERE session_id = $1", [req.params.sessionId]);
    res.json({ success: true, message: "Workout removed." });
  } catch (err) {
    console.error("deleteAssignedSession error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getWorkouts, getCategories, createWorkout, updateWorkout, deleteWorkout,
  getWorkoutPlans, createWorkoutPlan, deleteWorkoutPlan,
  getMemberSessions, assignSessionToMember, deleteAssignedSession,
};