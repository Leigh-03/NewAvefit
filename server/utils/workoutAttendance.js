const syncWorkoutAttendance = async (client) => {
  const result = await client.query(`
    WITH workout_activity AS (
      SELECT
        wp.user_id,
        COALESCE(
          (ws.started_at AT TIME ZONE 'Asia/Manila')::date,
          (ws.completed_at AT TIME ZONE 'Asia/Manila')::date,
          CASE
            WHEN ws.session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
              THEN TO_DATE(ws.session_date::text, 'YYYY-MM-DD')
            ELSE NULL
          END
        ) AS attendance_date,
        MIN(COALESCE(ws.started_at, ws.completed_at)) AS activity_at
      FROM workout_sessions ws
      JOIN workout_plans wp ON wp.workout_plan_id = ws.workout_plan_id
      WHERE wp.approval_status = 'Approved'
        AND (
          ws.started_at IS NOT NULL
          OR ws.completed_at IS NOT NULL
          OR ws.completed IS TRUE
        )
      GROUP BY wp.user_id, attendance_date
    )
    INSERT INTO gym_attendance (user_id, attendance_date, checked_in_at)
    SELECT
      user_id,
      attendance_date,
      COALESCE(
        activity_at,
        (attendance_date::timestamp + TIME '12:00') AT TIME ZONE 'Asia/Manila'
      )
    FROM workout_activity
    WHERE attendance_date IS NOT NULL
      AND attendance_date <= (NOW() AT TIME ZONE 'Asia/Manila')::date
    ON CONFLICT (user_id, attendance_date) DO NOTHING
  `);

  return result.rowCount;
};

module.exports = { syncWorkoutAttendance };
