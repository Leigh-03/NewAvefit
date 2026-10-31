const pool = require("../db");

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME_WINDOWS = {
  Morning: { start: "06:00", end: "12:00" },
  Afternoon: { start: "12:00", end: "17:00" },
  Evening: { start: "17:00", end: "22:00" },
  Flexible: { start: "06:00", end: "22:00" },
};
const DURATIONS = new Set([30, 45, 60, 75, 90]);
const EXPERIENCE_DAYS = {
  beginner: [2, 3],
  intermediate: [3, 5],
  advanced: [4, 6],
};

const getExperienceRange = (activityLevel) =>
  EXPERIENCE_DAYS[String(activityLevel || "Beginner").trim().toLowerCase()] || EXPERIENCE_DAYS.beginner;

const normalizeAvailability = (availability) => {
  if (!Array.isArray(availability) || availability.length > DAYS.length) {
    return { error: "Select no more than one availability time for each day." };
  }
  const seenDays = new Set();
  const normalized = [];
  for (const slot of availability) {
    const day = DAYS.find((candidate) => candidate.toLowerCase() === String(slot?.day_of_week || "").trim().toLowerCase());
    const timePreference = String(slot?.time_preference || "");
    if (!day || !Object.prototype.hasOwnProperty.call(TIME_WINDOWS, timePreference)) {
      return { error: "Choose a valid day and time preference for every available day." };
    }
    if (seenDays.has(day)) {
      return { error: `Availability for ${day} can only be selected once.` };
    }
    seenDays.add(day);
    normalized.push({
      day_of_week: day,
      time_preference: timePreference,
      ...TIME_WINDOWS[timePreference],
    });
  }
  return { availability: normalized.sort((a, b) => DAYS.indexOf(a.day_of_week) - DAYS.indexOf(b.day_of_week)) };
};

const getAvailability = async (req, res) => {
  try {
    const [userResult, availabilityResult] = await Promise.all([
      pool.query(
        `SELECT activity_level, workout_days_per_week, workout_duration, preferred_days,
                preferred_workout_time, setup_completed
         FROM users WHERE user_id = $1`,
        [req.user.user_id]
      ),
      pool.query(
        `SELECT day_of_week, time_preference,
                TO_CHAR(start_time, 'HH24:MI') AS start_time,
                TO_CHAR(end_time, 'HH24:MI') AS end_time
         FROM user_workout_availability
         WHERE user_id = $1
         ORDER BY array_position(ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'], day_of_week)`,
        [req.user.user_id]
      ),
    ]);
    if (!userResult.rowCount) {
      return res.status(404).json({ success: false, message: "User not found." });
    }
    const user = userResult.rows[0];
    let availability = availabilityResult.rows;
    if (!availability.length && Array.isArray(user.preferred_days) && TIME_WINDOWS[user.preferred_workout_time]) {
      availability = user.preferred_days
        .map((day) => DAYS.find((candidate) => candidate.toLowerCase() === String(day).toLowerCase()))
        .filter(Boolean)
        .map((day) => ({
          day_of_week: day,
          time_preference: user.preferred_workout_time,
          ...TIME_WINDOWS[user.preferred_workout_time],
        }));
    }
    res.json({
      success: true,
      data: {
        activity_level: user.activity_level || "Beginner",
        workout_days_per_week: user.workout_days_per_week,
        workout_duration: user.workout_duration,
        setup_completed: user.setup_completed === true,
        availability,
      },
    });
  } catch (err) {
    console.error("getUserWorkoutAvailability error:", err.message);
    res.status(500).json({ success: false, message: "Unable to load your weekly availability." });
  }
};

const saveAvailability = async (req, res) => {
  const normalized = normalizeAvailability(req.body?.availability);
  if (normalized.error) {
    return res.status(400).json({ success: false, message: normalized.error });
  }

  const frequency = Number(req.body?.workout_days_per_week);
  const duration = Number(req.body?.workout_duration);
  const requestedLevel = req.body?.activity_level;
  if (!Number.isInteger(frequency)) {
    return res.status(400).json({ success: false, message: "Choose a valid number of workout days per week." });
  }
  if (!DURATIONS.has(duration)) {
    return res.status(400).json({ success: false, message: "Choose a session duration from 30 to 90 minutes." });
  }
  if (requestedLevel !== undefined && !["Beginner", "Intermediate", "Advanced"].includes(requestedLevel)) {
    return res.status(400).json({ success: false, message: "Choose Beginner, Intermediate, or Advanced as your experience level." });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    const userResult = await client.query(
      "SELECT activity_level, setup_completed FROM users WHERE user_id = $1 FOR UPDATE",
      [req.user.user_id]
    );
    if (!userResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const user = userResult.rows[0];
    if (user.setup_completed === true) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        success: false,
        message: "Workout availability and experience level are locked after setup is complete.",
      });
    }
    const activityLevel = requestedLevel || user.activity_level || "Beginner";
    const [minimum, maximum] = getExperienceRange(activityLevel);
    if (frequency < minimum || frequency > maximum) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `${activityLevel} users should select ${minimum}–${maximum} workout days per week.`,
      });
    }
    if (frequency > normalized.availability.length) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        success: false,
        message: `You selected ${frequency} workout days per week, but you are only available on ${normalized.availability.length} days. Please update your availability or workout frequency.`,
      });
    }

    await client.query("DELETE FROM user_workout_availability WHERE user_id = $1", [req.user.user_id]);
    for (const slot of normalized.availability) {
      await client.query(
        `INSERT INTO user_workout_availability
           (user_id, day_of_week, start_time, end_time, time_preference)
         VALUES ($1, $2, $3::time, $4::time, $5)`,
        [req.user.user_id, slot.day_of_week, slot.start, slot.end, slot.time_preference]
      );
    }
    await client.query(
      `UPDATE users
       SET workout_days_per_week = $1,
           workout_duration = $2,
           preferred_days = $3,
           activity_level = COALESCE($4, activity_level),
           preferred_workout_time = NULL,
           updated_at = NOW()
       WHERE user_id = $5`,
      [
        frequency,
        duration,
        normalized.availability.map((slot) => slot.day_of_week),
        requestedLevel || null,
        req.user.user_id,
      ]
    );
    await client.query("COMMIT");
    res.json({
      success: true,
      message: "Weekly workout availability saved.",
      data: {
        workout_days_per_week: frequency,
        workout_duration: duration,
        activity_level: activityLevel,
        availability: normalized.availability.map(({ day_of_week, time_preference, start, end }) => ({
          day_of_week,
          time_preference,
          start_time: start,
          end_time: end,
        })),
      },
    });
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    console.error("saveUserWorkoutAvailability error:", err.message);
    res.status(500).json({ success: false, message: "Unable to save your weekly availability." });
  } finally {
    client?.release();
  }
};

module.exports = { getAvailability, saveAvailability, getExperienceRange, normalizeAvailability };
