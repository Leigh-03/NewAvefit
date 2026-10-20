const pool = require("../db");

const isValidTime = (value) =>
  typeof value === "string" &&
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const timeToMinutes = (value) => {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
};

const validateAvailability = (availability) => {
  if (!Array.isArray(availability) || availability.length > 70) {
    return "Availability must contain no more than 70 weekly time slots.";
  }

  const normalized = [];
  for (const slot of availability) {
    const dayOfWeek = Number(slot?.day_of_week);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return "Choose a valid day of the week for every time slot.";
    }
    if (!isValidTime(slot.start_time) || !isValidTime(slot.end_time)) {
      return "Enter a valid start and end time for every time slot.";
    }
    if (timeToMinutes(slot.start_time) < 360 || timeToMinutes(slot.end_time) > 1320) {
      return "Coach availability must be between 6:00 AM and 10:00 PM.";
    }
    if (slot.start_time >= slot.end_time) {
      return "Each availability slot must end after it starts.";
    }
    normalized.push({
      day_of_week: dayOfWeek,
      start_time: slot.start_time,
      end_time: slot.end_time,
    });
  }

  const seen = new Set();
  for (const slot of normalized) {
    const key = `${slot.day_of_week}:${slot.start_time}:${slot.end_time}`;
    if (seen.has(key)) return "Duplicate availability slots are not allowed.";
    seen.add(key);
  }
  for (let i = 0; i < normalized.length; i += 1) {
    const a = normalized[i];
    const aStart = a.start_time.replace(":", "");
    const aEnd = a.end_time.replace(":", "");
    for (let j = i + 1; j < normalized.length; j += 1) {
      const b = normalized[j];
      if (a.day_of_week !== b.day_of_week) continue;
      const bStart = b.start_time.replace(":", "");
      const bEnd = b.end_time.replace(":", "");
      if (aStart < bEnd && bStart < aEnd) {
        return "Availability time slots on the same day must not overlap.";
      }
    }
  }
  return null;
};

const listAvailability = async (trainerId) => {
  const result = await pool.query(
    `SELECT availability_id, trainer_id, day_of_week,
            TO_CHAR(start_time, 'HH24:MI') AS start_time,
            TO_CHAR(end_time, 'HH24:MI') AS end_time
     FROM trainer_availability
     WHERE trainer_id = $1
     ORDER BY day_of_week, start_time`,
    [trainerId]
  );
  return result.rows;
};

const getForAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const trainer = await pool.query("SELECT trainer_id FROM trainers WHERE trainer_id = $1", [id]);
    if (!trainer.rowCount) {
      return res.status(404).json({ success: false, message: "Trainer not found." });
    }
    res.json({ success: true, data: await listAvailability(id) });
  } catch (err) {
    console.error("get trainer availability error:", err.message);
    res.status(500).json({ success: false, message: "Unable to load trainer availability." });
  }
};

const getForTrainer = async (req, res) => {
  try {
    res.json({ success: true, data: await listAvailability(req.trainer.trainer_id) });
  } catch (err) {
    console.error("get own trainer availability error:", err.message);
    res.status(500).json({ success: false, message: "Unable to load your availability." });
  }
};

const replaceAvailability = async (trainerId, slots) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const trainer = await client.query(
      "SELECT trainer_id FROM trainers WHERE trainer_id = $1 FOR UPDATE",
      [trainerId]
    );
    if (!trainer.rowCount) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("DELETE FROM trainer_availability WHERE trainer_id = $1", [trainerId]);
    for (const slot of slots) {
      await client.query(
        `INSERT INTO trainer_availability (trainer_id, day_of_week, start_time, end_time)
         VALUES ($1, $2, $3::time, $4::time)`,
        [trainerId, slot.day_of_week, slot.start_time, slot.end_time]
      );
    }
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
};

const saveForTrainer = async (req, res) => {
  const validationError = validateAvailability(req.body?.availability);
  if (validationError) {
    return res.status(400).json({ success: false, message: validationError });
  }
  try {
    await replaceAvailability(req.trainer.trainer_id, req.body.availability);
    res.json({ success: true, data: await listAvailability(req.trainer.trainer_id) });
  } catch (err) {
    console.error("save own trainer availability error:", err.message);
    res.status(500).json({ success: false, message: "Unable to save your availability." });
  }
};

module.exports = { getForAdmin, getForTrainer, saveForTrainer, validateAvailability };
