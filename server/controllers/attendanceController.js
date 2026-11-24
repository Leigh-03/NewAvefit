const pool = require("../db");

const getAttendanceSummary = async (userId) => {
  const result = await pool.query(`
    WITH manila_today AS (
      SELECT (NOW() AT TIME ZONE 'Asia/Manila')::date AS attendance_date
    )
    SELECT
      COUNT(ga.attendance_id)::int AS total_visits,
      COUNT(ga.attendance_id) FILTER (
        WHERE ga.attendance_date >= DATE_TRUNC('week', manila_today.attendance_date)::date
      )::int AS visits_this_week,
      COUNT(ga.attendance_id) FILTER (
        WHERE ga.attendance_date >= DATE_TRUNC('month', manila_today.attendance_date)::date
      )::int AS visits_this_month,
      MAX(ga.attendance_date)::text AS last_visit,
      EXISTS (
        SELECT 1
        FROM gym_attendance today_attendance
        WHERE today_attendance.user_id = $1
          AND today_attendance.attendance_date = manila_today.attendance_date
      ) AS checked_in_today,
      COALESCE((
        SELECT JSON_AGG(
          JSON_BUILD_OBJECT(
            'attendance_date', recent.attendance_date::text,
            'checked_in_at', recent.checked_in_at,
            'is_simulated', recent.is_simulated
          )
          ORDER BY recent.attendance_date DESC
        )
        FROM (
          SELECT visits.attendance_date, visits.checked_in_at, visits.is_simulated
          FROM (
            SELECT attendance_date, checked_in_at, FALSE AS is_simulated
            FROM gym_attendance
            WHERE user_id = $1
            UNION ALL
            SELECT samples.attendance_date, samples.checked_in_at, TRUE AS is_simulated
            FROM gym_attendance_samples samples
            WHERE samples.user_id = $1
              AND NOT EXISTS (
                SELECT 1
                FROM gym_attendance actual
                WHERE actual.user_id = samples.user_id
                  AND actual.attendance_date = samples.attendance_date
              )
          ) visits
          ORDER BY visits.attendance_date DESC
          LIMIT 365
        ) recent
      ), '[]'::json) AS recent_visits
    FROM manila_today
    LEFT JOIN gym_attendance ga ON ga.user_id = $1
    GROUP BY manila_today.attendance_date
  `, [userId]);

  return result.rows[0];
};

const getUserAttendance = async (req, res) => {
  try {
    const data = await getAttendanceSummary(req.user.user_id);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("getUserAttendance error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to load attendance history." });
  }
};

const checkInUser = async (req, res) => {
  try {
    const result = await pool.query(`
      INSERT INTO gym_attendance (user_id, attendance_date)
      VALUES ($1, (NOW() AT TIME ZONE 'Asia/Manila')::date)
      ON CONFLICT (user_id, attendance_date)
      DO UPDATE SET checked_in_at = gym_attendance.checked_in_at
      RETURNING attendance_date::text, checked_in_at
    `, [req.user.user_id]);

    return res.json({
      success: true,
      message: "Your gym attendance has been recorded.",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("checkInUser error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to record attendance." });
  }
};

const getAdminMemberAttendance = async (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ success: false, message: "Choose a valid member." });
  }

  try {
    const member = await pool.query("SELECT 1 FROM users WHERE user_id = $1", [userId]);
    if (!member.rowCount) {
      return res.status(404).json({ success: false, message: "Member not found." });
    }
    const data = await getAttendanceSummary(userId);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("getAdminMemberAttendance error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to load member attendance." });
  }
};

const getTrainerMemberAttendance = async (req, res) => {
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

    const data = await getAttendanceSummary(userId);
    return res.json({ success: true, data });
  } catch (error) {
    console.error("getTrainerMemberAttendance error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to load member attendance." });
  }
};

module.exports = {
  getUserAttendance,
  checkInUser,
  getAdminMemberAttendance,
  getTrainerMemberAttendance,
};
