const pool = require("../db");
const getExerciseCatalog = require("../utils/exerciseCatalog");
const { createNotification } = require("../utils/notifications");
const { getWorkoutGoalRules, isWorkoutDoseAllowed } = require("../utils/workoutGoalRules");

const getWorkouts = async (req, res) => {
  try {
    const result = await getExerciseCatalog();
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("getWorkouts error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

const EQUIPMENT_CONDITIONS_BY_STATUS = {
  "Needs inspection": ["Not assessed"],
  "Under repair": ["Damaged"],
  "In service": ["Good", "Rusty"],
  "Needs replacement": ["Poor", "Damaged", "Worn"],
};
const equipmentStatuses = Object.keys(EQUIPMENT_CONDITIONS_BY_STATUS);

const validateEquipmentInput = (body, { creating = false } = {}) => {
  const equipmentName = typeof body.equipment_name === "string" ? body.equipment_name.trim() : "";
  const quantity = Number(body.quantity);
  const quantityIsDigits = typeof body.quantity === "number"
    ? Number.isInteger(body.quantity)
    : typeof body.quantity === "string" && /^\d+$/.test(body.quantity);
  const condition = creating ? "Good" : typeof body.condition === "string" ? body.condition.trim() : "";
  const conditionNotes = typeof body.condition_notes === "string" ? body.condition_notes.trim() : "";
  const status = creating ? "In service" : typeof body.status === "string" ? body.status.trim() : "";
  if (creating && (!/^(?=.*\p{L})[\p{L}\s]+$/u.test(equipmentName))) {
    return { error: "Equipment name is required and can contain letters and spaces only." };
  }
  if (!equipmentName || equipmentName.length > 120) {
    return { error: "Equipment name is required and must be 120 characters or fewer." };
  }
  if (!quantityIsDigits || quantity < 1 || quantity > 50) {
    return { error: "Quantity must be a whole number from 1 to 50." };
  }
  if (!equipmentStatuses.includes(status)) {
    return { error: "Choose a valid equipment status." };
  }
  if (!EQUIPMENT_CONDITIONS_BY_STATUS[status].includes(condition)) {
    return { error: `Choose a condition available for the ${status.toLowerCase()} status.` };
  }
  if (conditionNotes.length > 500) {
    return { error: "Condition details must be 500 characters or fewer." };
  }
  return {
    value: {
      equipmentName,
      quantity,
      condition,
      conditionNotes,
      status,
    },
  };
};

const getEquipmentInventory = async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT inventory.equipment_id,
             inventory.equipment_name,
             inventory.quantity,
             inventory.equipment_condition AS condition,
             inventory.condition_notes,
             inventory.status,
             inventory.updated_at,
             COALESCE(plan_usage.planned_session_count, 0)::int AS planned_session_count,
             COALESCE(plan_usage.usage_count, 0)::int AS usage_count,
             COALESCE(plan_usage.users, '[]'::json) AS users
      FROM equipment_inventory inventory
      LEFT JOIN LATERAL (
        SELECT COUNT(*)::int AS planned_session_count,
               COUNT(*) FILTER (WHERE session_usage.completed)::int AS usage_count,
               JSON_AGG(
                 JSON_BUILD_OBJECT(
                   'user_id', session_usage.user_id,
                   'member_name', session_usage.member_name,
                   'plan_name', session_usage.plan_name,
                   'session_date', session_usage.session_date,
                   'completed', session_usage.completed
                 )
                 ORDER BY session_usage.session_date DESC, session_usage.member_name
               ) AS users
        FROM (
          SELECT u.user_id,
                 CONCAT_WS(' ', u.first_name, u.last_name) AS member_name,
                 wp.plan_name,
                 ws.session_date,
                 BOOL_AND(ws.completed = TRUE) AS completed
          FROM workout_sessions ws
          JOIN workout_plans wp ON wp.workout_plan_id = ws.workout_plan_id
          JOIN exercises e ON e.exercise_id = ws.exercise_id
          JOIN users u ON u.user_id = wp.user_id
          WHERE LOWER(BTRIM(e.equipment)) = LOWER(BTRIM(inventory.equipment_name))
            AND wp.approval_status = 'Approved'
          GROUP BY u.user_id, u.first_name, u.last_name, wp.workout_plan_id, wp.plan_name, ws.session_date
        ) session_usage
      ) plan_usage ON TRUE
      ORDER BY inventory.equipment_name ASC
    `);
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error("getEquipmentInventory error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to load equipment inventory." });
  }
};

const createEquipment = async (req, res) => {
  const validated = validateEquipmentInput(req.body, { creating: true });
  if (validated.error) {
    return res.status(400).json({ success: false, message: validated.error });
  }
  const { equipmentName, quantity, condition, conditionNotes, status } = validated.value;
  try {
    const result = await pool.query(
      `INSERT INTO equipment_inventory
        (equipment_name, quantity, equipment_condition, condition_notes, status, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (LOWER(BTRIM(equipment_name))) DO NOTHING
        RETURNING equipment_id, equipment_name, quantity, equipment_condition AS condition, condition_notes, status, updated_at`,
      [equipmentName, quantity, condition, conditionNotes, status]
    );
    if (!result.rowCount) {
      return res.status(409).json({ success: false, message: "This equipment is already in the inventory." });
    }
    return res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "This equipment is already in the inventory." });
    }
    console.error("createEquipment error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to add equipment." });
  }
};

const updateEquipment = async (req, res) => {
  const equipmentId = Number(req.params.equipmentId);
  if (!Number.isInteger(equipmentId) || equipmentId < 1) {
    return res.status(400).json({ success: false, message: "Choose valid equipment." });
  }
  const validated = validateEquipmentInput(req.body);
  if (validated.error) {
    return res.status(400).json({ success: false, message: validated.error });
  }
  const { equipmentName, quantity, condition, conditionNotes, status } = validated.value;
  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;
    const current = await client.query(
      "SELECT equipment_name FROM equipment_inventory WHERE equipment_id = $1 FOR UPDATE",
      [equipmentId]
    );
    if (!current.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(404).json({ success: false, message: "Equipment was not found." });
    }
    const result = await client.query(
      `UPDATE equipment_inventory
       SET equipment_name = $1, quantity = $2, equipment_condition = $3,
           condition_notes = $4, status = $5, updated_at = NOW()
       WHERE equipment_id = $6
       RETURNING equipment_id, equipment_name, quantity, equipment_condition AS condition, condition_notes, status, updated_at`,
      [equipmentName, quantity, condition, conditionNotes, status, equipmentId]
    );
    if (current.rows[0].equipment_name !== equipmentName) {
      await client.query(
        "UPDATE exercises SET equipment = $1 WHERE LOWER(BTRIM(equipment)) = LOWER(BTRIM($2))",
        [equipmentName, current.rows[0].equipment_name]
      );
    }
    await client.query("COMMIT");
    transactionStarted = false;
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (transactionStarted) await client.query("ROLLBACK");
    if (error.code === "23505") {
      return res.status(409).json({ success: false, message: "This equipment name is already in the inventory." });
    }
    console.error("updateEquipment error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to update equipment details." });
  } finally {
    client?.release();
  }
};

const deleteEquipment = async (req, res) => {
  const equipmentId = Number(req.params.equipmentId);
  if (!Number.isInteger(equipmentId) || equipmentId < 1) {
    return res.status(400).json({ success: false, message: "Choose valid equipment." });
  }
  try {
    const result = await pool.query(
      `DELETE FROM equipment_inventory
       WHERE equipment_id = $1
       RETURNING equipment_id`,
      [equipmentId]
    );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: "Equipment was not found." });
    }
    return res.json({ success: true, message: "Equipment removed from inventory." });
  } catch (error) {
    console.error("deleteEquipment error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to remove equipment." });
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
    const member = await pool.query("SELECT fitness_goal FROM users WHERE user_id = $1", [user_id]);
    if (member.rowCount && !isWorkoutDoseAllowed(member.rows[0].fitness_goal, sets, reps)) {
      const rules = getWorkoutGoalRules(member.rows[0].fitness_goal);
      return res.status(400).json({
        success: false,
        message: `For this member's fitness goal, use ${rules.sets[0]}–${rules.sets[1]} sets and ${rules.reps[0]}–${rules.reps[1]} reps.`,
      });
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
  getWorkouts, getCategories, updateWorkout,
  getEquipmentInventory,
  createEquipment,
  updateEquipment,
  deleteEquipment,
  getWorkoutPlans, createWorkoutPlan, deleteWorkoutPlan,
  getMemberSessions, assignSessionToMember, deleteAssignedSession,
};