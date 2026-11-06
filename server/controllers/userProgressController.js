const pool = require("../db");

// GET user progress logs
const getProgress = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM progress_logs WHERE user_id = $1 ORDER BY log_date ASC",
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
// Derives an estimated timeline from the assessment/goal/availability answers
// instead of requiring the user to type in a weekly rate themselves.
const autoPredict = async (req, res) => {
  try {
    const {
      goal,                 // "Weight Loss" | "Gain Weight" | "Maintain Weight"
      current_weight,
      target_weight,
      height,
      days_per_week,        // 1-7
      intensity,            // 1-5
      experience,           // "Beginner" | "Intermediate" | "Advanced"
    } = req.body;

    const cw = parseFloat(current_weight);
    const tw = parseFloat(target_weight);
    const days = Math.min(Math.max(parseInt(days_per_week) || 3, 1), 7);
    const level = Math.min(Math.max(parseInt(intensity) || 3, 1), 5);

    if (!cw || cw <= 0) {
      return res.status(400).json({ success: false, message: "current_weight is required." });
    }

    const experienceFactor = { Beginner: 1.1, Intermediate: 1.0, Advanced: 0.9 }[experience] || 1.0;
    const dayFactor = days / 3;       // 3 days/week = baseline
    const intensityFactor = level / 3; // moderate (3) = baseline

    // Safe, realistic weekly body-weight change ranges (kg/week)
    const RATE_BOUNDS = {
      "Weight Loss": { base: 0.4, min: 0.25, max: 1.0 },
      "Gain Weight": { base: 0.2, min: 0.1, max: 0.45 },
      "Muscle Gain": { base: 0.2, min: 0.1, max: 0.45 },
    };

    let weightDiff = tw ? Math.abs(cw - tw) : 0;
    const isMaintenance = goal === "Maintain Weight" || !tw || weightDiff < 0.5;

    let result;
    if (isMaintenance) {
      // No meaningful weight target — estimate time to build a consistent habit / see recomposition results instead.
      const baseWeeks = 8;
      const consistentWeeks = Math.max(4, Math.round(baseWeeks / (dayFactor * intensityFactor * experienceFactor)));
      const inconsistentWeeks = Math.round(consistentWeeks * 2.2);
      result = {
        mode: "maintenance",
        goal: goal || "Maintain Weight",
        weekly_rate_kg: 0,
        weeks_needed_consistent: consistentWeeks,
        months_needed_consistent: +(consistentWeeks / 4.345).toFixed(1),
        weeks_needed_inconsistent: inconsistentWeeks,
        months_needed_inconsistent: +(inconsistentWeeks / 4.345).toFixed(1),
        note: "No target weight change — timeline reflects when a consistent routine typically shows visible fitness/body-composition results.",
      };
    } else {
      const bounds = RATE_BOUNDS[goal] || RATE_BOUNDS["Weight Loss"];
      let weeklyRate = bounds.base * dayFactor * intensityFactor * experienceFactor;
      weeklyRate = Math.min(Math.max(weeklyRate, bounds.min), bounds.max);

      const consistentWeeks = Math.max(1, Math.ceil(weightDiff / weeklyRate));
      // Inconsistent adherence roughly halves effective weekly progress
      const inconsistentRate = weeklyRate * 0.45;
      const inconsistentWeeks = Math.max(consistentWeeks + 1, Math.ceil(weightDiff / inconsistentRate));

      let predicted_bmi = null;
      if (height) {
        const h = parseFloat(height) / 100;
        if (h > 0) predicted_bmi = (tw / (h * h)).toFixed(2);
      }

      result = {
        mode: "target-weight",
        goal,
        current_weight: cw,
        target_weight: tw,
        weight_diff_kg: +weightDiff.toFixed(1),
        weekly_rate_kg: +weeklyRate.toFixed(2),
        weeks_needed_consistent: consistentWeeks,
        months_needed_consistent: +(consistentWeeks / 4.345).toFixed(1),
        weeks_needed_inconsistent: inconsistentWeeks,
        months_needed_inconsistent: +(inconsistentWeeks / 4.345).toFixed(1),
        predicted_bmi,
      };
    }

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

module.exports = { getProgress, logProgress, calculatePrediction, autoPredict, getUserNotifications };