const pool = require("../db");
const { calculateWeightTimeline } = require("../utils/weightTimeline");

// GET user progress logs
const getProgress = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM progress_logs WHERE user_id = $1 ORDER BY log_date ASC, progress_id ASC",
      [req.user.user_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("getProgress error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST log progress
const logProgress = async (req, res) => {
  try {
    const { weight, bmi, body_fat, waist, chest, hips, left_arm } = req.body;

    if (
      weight != null &&
      (!Number.isFinite(Number(weight)) || Number(weight) < 20 || Number(weight) > 200)
    ) {
      return res.status(400).json({
        success: false,
        message: "Weight must be between 20 kg and 200 kg.",
      });
    }

    const result = await pool.query(`
      INSERT INTO progress_logs (user_id, weight, bmi, body_fat, waist, chest, hips, left_arm, log_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,(NOW() AT TIME ZONE 'Asia/Manila')::date) RETURNING *
    `, [req.user.user_id, weight || null, bmi || null, body_fat || null, waist || null, chest || null, hips || null, left_arm || null]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("logProgress error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

const updateUserGoal = async (req, res) => {
  try {
    const { fitness_goal, target_weight } = req.body;
    const profileResult = await pool.query(
      `SELECT u.height, u.weight,
        (SELECT p.weight FROM progress_logs p
         WHERE p.user_id = u.user_id AND p.weight IS NOT NULL
         ORDER BY p.log_date DESC, p.progress_id DESC
         LIMIT 1) AS latest_weight
       FROM users u
       WHERE u.user_id = $1`,
      [req.user.user_id]
    );
    if (!profileResult.rowCount) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const profile = profileResult.rows[0];
    const height = Number(profile.height);
    const currentWeight = Number(profile.latest_weight ?? profile.weight);
    const targetWeight = Number(target_weight);
    if (
      !Number.isFinite(height) || height <= 0 ||
      !Number.isFinite(currentWeight) || currentWeight <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid height and current weight are required before setting a goal.",
      });
    }

    const bmi = currentWeight / ((height / 100) ** 2);
    const allowedGoals = bmi < 18.5
      ? ["Gain Weight"]
      : bmi >= 25
        ? ["Weight Loss"]
        : ["Weight Loss", "Maintain Weight", "Gain Weight"];
    if (!allowedGoals.includes(fitness_goal)) {
      return res.status(400).json({
        success: false,
        message: "That goal is not available for your current BMI.",
      });
    }

    const heightMeters = height / 100;
    const normalMin = Math.ceil(18.5 * heightMeters ** 2);
    const normalMax = Math.floor(24.9 * heightMeters ** 2);
    if (normalMin > normalMax) {
      return res.status(400).json({
        success: false,
        message: "Your height does not allow us to calculate a healthy target-weight range.",
      });
    }

    let targetMin = normalMin;
    let targetMax = normalMax;
    if (fitness_goal === "Weight Loss") {
      targetMax = Math.max(normalMin, Math.min(normalMax, Math.ceil(currentWeight) - 1));
    } else if (fitness_goal === "Gain Weight") {
      targetMin = Math.min(normalMax, Math.max(normalMin, Math.floor(currentWeight) + 1));
    } else {
      const maintenanceWeight = Math.min(Math.max(Math.round(currentWeight), normalMin), normalMax);
      targetMin = maintenanceWeight;
      targetMax = maintenanceWeight;
    }

    if (!Number.isInteger(targetWeight) || targetWeight < targetMin || targetWeight > targetMax) {
      return res.status(400).json({
        success: false,
        message: `Choose a target weight between ${targetMin} kg and ${targetMax} kg for this goal.`,
      });
    }

    const result = await pool.query(
      `UPDATE users
       SET fitness_goal = $1, target_weight = $2, updated_at = NOW()
       WHERE user_id = $3
       RETURNING fitness_goal, target_weight`,
      [fitness_goal, targetWeight, req.user.user_id]
    );
    return res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("updateUserGoal error:", err.message);
    return res.status(500).json({ success: false, message: "Unable to update your goal." });
  }
};

// POST calculate weight prediction
const calculatePrediction = async (req, res) => {
  try {
    const { current_weight, goal_weight, weekly_loss } = req.body;

    const cw = parseFloat(current_weight);
    const gw = parseFloat(goal_weight);
    const wl = weekly_loss === undefined || weekly_loss === null || weekly_loss === ""
      ? 0.5
      : parseFloat(weekly_loss);

    if (!cw || !gw || cw <= 0 || gw <= 0)
      return res.status(400).json({ success: false, message: "Current and goal weight must be greater than 0." });

    if (cw < 20 || cw > 200 || gw < 20 || gw > 200)
      return res.status(400).json({
        success: false,
        message: "Current and goal weight must be between 20 kg and 200 kg.",
      });

    if (!Number.isFinite(wl) || wl <= 0)
      return res.status(400).json({ success: false, message: "Invalid weekly loss/gain value." });

    const weightDiff = Math.abs(cw - gw);
    const weeksNeeded = Math.ceil(weightDiff / wl);
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + weeksNeeded * 7);

    // Get user height for BMI
    const userRes = await pool.query("SELECT height FROM users WHERE user_id=$1", [req.user.user_id]);
    const height = userRes.rows[0]?.height;
    let predicted_bmi = null;
    if (height) {
      const h = parseFloat(height) / 100;
      predicted_bmi = (gw / (h * h)).toFixed(2);
    }

    // Save prediction
    await pool.query(`
      INSERT INTO predictions (user_id, predicted_weight, predicted_bmi, prediction_date)
      VALUES ($1,$2,$3,$4)
    `, [req.user.user_id, gw, predicted_bmi, targetDate]);

    res.json({
      success: true,
      data: {
        current_weight: cw,
        goal_weight: gw,
        weekly_loss: wl,
        weeks_needed: weeksNeeded,
        target_date: targetDate.toDateString(),
        predicted_bmi,
      },
    });
  } catch (err) {
    console.error("calculatePrediction error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST predictive analytics for onboarding confirmation screen
// Estimates a target-weight timeline from current weight and goal.
const autoPredict = async (req, res) => {
  try {
    const {
      goal,
      current_weight,
      target_weight,
      height,
    } = req.body;

    const cw = Number(current_weight);
    if (!Number.isFinite(cw) || cw < 20 || cw > 200) {
      return res.status(400).json({
        success: false,
        message: "Current weight must be between 20 kg and 200 kg.",
      });
    }

    if (!["Weight Loss", "Gain Weight", "Muscle Gain", "Maintain Weight"].includes(goal)) {
      return res.status(400).json({
        success: false,
        message: "Choose a valid weight goal before requesting a timeline.",
      });
    }

    if (goal === "Maintain Weight") {
      return res.json({
        success: true,
        data: {
          mode: "maintenance",
          goal,
          weekly_rate_kg: 0,
          weeks_needed_consistent: null,
          months_needed_consistent: null,
          weeks_needed_inconsistent: null,
          months_needed_inconsistent: null,
          note: "A weight-maintenance goal has no target-weight timeline. This estimate cannot predict body recomposition.",
        },
      });
    }

    const tw = Number(target_weight);
    if (!Number.isFinite(tw) || tw < 20 || tw > 200) {
      return res.status(400).json({
        success: false,
        message: "Target weight must be between 20 kg and 200 kg.",
      });
    }

    if ((goal === "Weight Loss" && tw > cw) || (goal !== "Weight Loss" && tw < cw)) {
      return res.status(400).json({
        success: false,
        message: goal === "Weight Loss"
          ? "Target weight must be lower than current weight for a weight-loss goal."
          : "Target weight must be higher than current weight for a weight-gain goal.",
      });
    }

    const result = calculateWeightTimeline({
      goal,
      currentWeight: cw,
      targetWeight: tw,
      height,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error("autoPredict error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET user notifications
const getUserNotifications = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM notifications WHERE user_id=$1 ORDER BY created_at DESC",
      [req.user.user_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("getUserNotifications error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getProgress, logProgress, updateUserGoal, calculatePrediction, autoPredict, getUserNotifications };