const pool = require("../db");
const PRESET_AVAILABILITY_RANGES = new Set([
  "06:00|12:00",
  "12:00|17:00",
  "17:00|22:00",
  "06:00|22:00",
]);

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
    const memberLimit = Number(slot?.member_limit ?? 1);
    const isCustomRange = slot.is_custom === true || !PRESET_AVAILABILITY_RANGES.has(`${slot.start_time}|${slot.end_time}`);
    const minMemberLimit = isCustomRange ? 1 : 2;
    const maxMemberLimit = isCustomRange ? 3 : 5;
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return "Choose a valid day of the week for every time slot.";
    }
    if (!isValidTime(slot.start_time) || !isValidTime(slot.end_time)) {
      return "Enter a valid start and end time for every time slot.";
    }
    if (!Number.isInteger(memberLimit) || memberLimit < minMemberLimit || memberLimit > maxMemberLimit) {
      return isCustomRange
        ? "Custom availability must allow between 1 and 3 members."
        : "Preset availability must allow between 2 and 5 members.";
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
      member_limit: memberLimit,
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
            TO_CHAR(end_time, 'HH24:MI') AS end_time,
            member_limit,
            is_custom
     FROM trainer_availability
     WHERE trainer_id = $1
     ORDER BY day_of_week, start_time`,
    [trainerId]
  );
  return result.rows;
};

const listAvailabilityForAdmin = async (trainerId) => {
  const result = await pool.query(
    `SELECT ta.availability_id, ta.trainer_id, ta.day_of_week,
            TO_CHAR(ta.start_time, 'HH24:MI') AS start_time,
            TO_CHAR(ta.end_time, 'HH24:MI') AS end_time,
            ta.member_limit,
            ta.is_custom,
            matching_members.assigned_member_count,
            matching_members.assigned_members
     FROM trainer_availability ta
     LEFT JOIN LATERAL (
       SELECT
         COUNT(DISTINCT member.user_id)::integer AS assigned_member_count,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'user_id', member.user_id,
               'full_name', CONCAT_WS(' ', member.first_name, member.last_name)
             )
             ORDER BY member.first_name, member.last_name
           ) FILTER (WHERE member.user_id IS NOT NULL),
           '[]'::json
         ) AS assigned_members
       FROM users member
       JOIN user_workout_availability member_slot
         ON member_slot.user_id = member.user_id
       WHERE member.trainer_id = ta.trainer_id
         AND CASE member_slot.day_of_week
           WHEN 'Sunday' THEN 0
           WHEN 'Monday' THEN 1
           WHEN 'Tuesday' THEN 2
           WHEN 'Wednesday' THEN 3
           WHEN 'Thursday' THEN 4
           WHEN 'Friday' THEN 5
           WHEN 'Saturday' THEN 6
           ELSE -1
         END = ta.day_of_week
         AND member_slot.start_time < ta.end_time
         AND member_slot.end_time > ta.start_time
     ) matching_members ON TRUE
     WHERE ta.trainer_id = $1
     ORDER BY ta.day_of_week, ta.start_time`,
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
    res.json({ success: true, data: await listAvailabilityForAdmin(id) });
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
      const memberLimit = Number(slot?.member_limit ?? 1);
      await client.query(
        `INSERT INTO trainer_availability (trainer_id, day_of_week, start_time, end_time, member_limit, is_custom)
         VALUES ($1, $2, $3::time, $4::time, $5, $6)`,
        [trainerId, slot.day_of_week, slot.start_time, slot.end_time, memberLimit, slot.is_custom === true]
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

const saveForAdmin = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Admins can view coach availability but cannot edit the trainer's member limits or time slots.",
  });
};

module.exports = { getForAdmin, getForTrainer, saveForAdmin, saveForTrainer, validateAvailability };
