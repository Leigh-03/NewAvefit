const pool = require("../db");

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REPORT_DAYS = 366;

const isValidDate = (value) => {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const getDateRange = (startDate, endDate) => {
  if (!isValidDate(startDate) || !isValidDate(endDate)) return null;
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  const days = Math.floor((end - start) / 86_400_000) + 1;
  if (days < 1 || days > MAX_REPORT_DAYS) return null;
  return { startDate, endDate };
};

const getComparisonRange = ({ startDate, endDate }) => {
  const dayCount = Math.floor(
    (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / 86_400_000
  ) + 1;
  const comparisonEnd = new Date(Date.parse(`${startDate}T00:00:00.000Z`) - 86_400_000);
  const comparisonStart = new Date(comparisonEnd.getTime() - (dayCount - 1) * 86_400_000);
  return {
    startDate: comparisonStart.toISOString().slice(0, 10),
    endDate: comparisonEnd.toISOString().slice(0, 10),
  };
};

const createdAtManila = (alias) => `CASE
  WHEN pg_typeof(${alias}.created_at) = 'timestamp with time zone'::regtype
    THEN ${alias}.created_at AT TIME ZONE 'Asia/Manila'
  ELSE ${alias}.created_at::timestamp
END`;

const completedDateManila = `CASE
  WHEN ws.completed_at IS NOT NULL THEN
    CASE
      WHEN pg_typeof(ws.completed_at) = 'timestamp with time zone'::regtype
        THEN (ws.completed_at AT TIME ZONE 'Asia/Manila')::date
      ELSE ws.completed_at::date
    END
  WHEN ws.session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    THEN TO_DATE(ws.session_date::text, 'YYYY-MM-DD')
  ELSE NULL
END`;

const getOperationalReport = async ({ startDate, endDate }) => {
  const summaryResult = await pool.query(`
    SELECT
      (SELECT COUNT(*)::int FROM users
        WHERE LOWER(COALESCE(account_status, 'pending')) = 'active') AS active_accounts,
      (SELECT COUNT(*)::int FROM users
        WHERE LOWER(COALESCE(account_status, 'pending')) = 'pending') AS pending_accounts,
      (SELECT COUNT(*)::int FROM users
        WHERE membership_end_date BETWEEN $1::date AND $2::date) AS memberships_ending,
      (SELECT COUNT(*)::int FROM workout_sessions ws
        WHERE ws.completed IS TRUE
          AND (${completedDateManila}) BETWEEN $1::date AND $2::date) AS completed_workouts
  `, [startDate, endDate]);

  const registrationsResult = await pool.query(`
    SELECT
      u.user_id,
      CONCAT_WS(' ', u.first_name, u.last_name) AS member_name,
      u.email,
      INITCAP(LOWER(COALESCE(u.account_status, 'pending'))) AS account_status,
      (${createdAtManila("u")})::date AS joined_date,
      u.membership_end_date,
      COALESCE(t.full_name, 'Unassigned') AS trainer_name
    FROM users u
    LEFT JOIN trainers t ON t.trainer_id = u.trainer_id
    WHERE ${createdAtManila("u")} >= $1::date
      AND ${createdAtManila("u")} < ($2::date + INTERVAL '1 day')
    ORDER BY u.created_at DESC NULLS LAST, u.user_id DESC
  `, [startDate, endDate]);

  const membershipsResult = await pool.query(`
    SELECT
      u.user_id,
      CONCAT_WS(' ', u.first_name, u.last_name) AS member_name,
      u.email,
      u.membership_start_date,
      u.membership_end_date,
      INITCAP(LOWER(COALESCE(u.account_status, 'pending'))) AS account_status,
      COALESCE(t.full_name, 'Unassigned') AS trainer_name
    FROM users u
    LEFT JOIN trainers t ON t.trainer_id = u.trainer_id
    WHERE u.membership_end_date BETWEEN $1::date AND $2::date
    ORDER BY u.membership_end_date, u.first_name, u.last_name
  `, [startDate, endDate]);

  const workoutsResult = await pool.query(`
    SELECT
      ws.session_id,
      CONCAT_WS(' ', u.first_name, u.last_name) AS member_name,
      wp.plan_name,
      COALESCE(t.full_name, 'Unassigned') AS trainer_name,
      (${completedDateManila}) AS completed_date
    FROM workout_sessions ws
    JOIN workout_plans wp ON wp.workout_plan_id = ws.workout_plan_id
    LEFT JOIN users u ON u.user_id = wp.user_id
    LEFT JOIN trainers t ON t.trainer_id = wp.trainer_id
    WHERE ws.completed IS TRUE
      AND (${completedDateManila}) BETWEEN $1::date AND $2::date
    ORDER BY completed_date DESC, ws.session_id DESC
  `, [startDate, endDate]);

  const equipmentResult = await pool.query(`
    SELECT equipment_id, equipment_name, quantity,
      equipment_condition AS condition, condition_notes, status, updated_at,
      CASE
        WHEN LOWER(BTRIM(status)) IN ('in service', 'under maintenance', 'under repair', 'needs replacement')
          THEN quantity
        ELSE 0
      END::int AS status_unit_count,
      CASE
        WHEN LOWER(BTRIM(status)) IN ('in service', 'under maintenance', 'under repair', 'needs replacement')
          THEN quantity::text || '/' || quantity::text
        ELSE '0/' || quantity::text
      END AS status_ratio
    FROM equipment_inventory
    ORDER BY
      CASE status
        WHEN 'Needs replacement' THEN 1
        WHEN 'Under repair' THEN 2
        WHEN 'Needs inspection' THEN 3
        ELSE 4
      END,
      equipment_name
  `);

  const coachesResult = await pool.query(`
    SELECT
      t.trainer_id,
      t.full_name AS trainer_name,
      INITCAP(LOWER(COALESCE(t.status, 'unknown'))) AS trainer_status,
      COUNT(u.user_id)::int AS roster_count,
      t.max_members AS total_capacity,
      GREATEST(t.max_members - COUNT(u.user_id), 0)::int AS available_capacity
    FROM trainers t
    LEFT JOIN users u ON u.trainer_id = t.trainer_id
    GROUP BY t.trainer_id, t.full_name, t.status, t.max_members
    ORDER BY t.full_name
  `);

  const coachTotals = coachesResult.rows.reduce((totals, coach) => ({
    coach_count: totals.coach_count + 1,
    roster_count: totals.roster_count + Number(coach.roster_count || 0),
    total_capacity: totals.total_capacity + Number(coach.total_capacity || 0),
    available_capacity: totals.available_capacity + Number(coach.available_capacity || 0),
  }), { coach_count: 0, roster_count: 0, total_capacity: 0, available_capacity: 0 });

  const equipmentTotals = equipmentResult.rows.reduce((totals, item) => ({
    equipment_types: totals.equipment_types + 1,
    equipment_units: totals.equipment_units + Number(item.quantity || 0),
    equipment_needing_attention: totals.equipment_needing_attention
      + (item.status === "In service" ? 0 : Number(item.quantity || 0)),
  }), { equipment_types: 0, equipment_units: 0, equipment_needing_attention: 0 });

  return {
    summary: summaryResult.rows[0] || {
      active_accounts: 0,
      pending_accounts: 0,
      memberships_ending: 0,
      completed_workouts: 0,
    },
    registrations: registrationsResult.rows,
    memberships_ending: membershipsResult.rows,
    completed_workouts: workoutsResult.rows,
    equipment: {
      summary: equipmentTotals,
      items: equipmentResult.rows,
    },
    coaches: {
      summary: coachTotals,
      roster: coachesResult.rows,
    },
  };
};

const getStatisticalReport = async ({ startDate, endDate, comparisonStartDate, comparisonEndDate }) => {
  const trendResult = await pool.query(`
    WITH periods AS (
      SELECT generated.month_start::date AS month_start
      FROM GENERATE_SERIES(
        DATE_TRUNC('month', $1::date),
        DATE_TRUNC('month', $2::date),
        INTERVAL '1 month'
      ) AS generated(month_start)
    ),
    registrations AS (
      SELECT DATE_TRUNC('month', ${createdAtManila("u")})::date AS month_start,
        COUNT(*)::int AS registration_count
      FROM users u
      WHERE LOWER(COALESCE(u.account_status, 'pending')) = 'active'
        AND ${createdAtManila("u")} >= $1::date
        AND ${createdAtManila("u")} < ($2::date + INTERVAL '1 day')
      GROUP BY 1
    ),
    completed_workouts AS (
      SELECT DATE_TRUNC('month', (${completedDateManila})::timestamp)::date AS month_start,
        COUNT(*)::int AS completed_count
      FROM workout_sessions ws
      WHERE ws.completed IS TRUE
        AND (${completedDateManila}) BETWEEN $1::date AND $2::date
      GROUP BY 1
    )
    SELECT
      TO_CHAR(periods.month_start, 'Mon YYYY') AS period,
      COALESCE(registrations.registration_count, 0)::int AS registrations,
      COALESCE(completed_workouts.completed_count, 0)::int AS completed_workouts
    FROM periods
    LEFT JOIN registrations USING (month_start)
    LEFT JOIN completed_workouts USING (month_start)
    ORDER BY periods.month_start
  `, [startDate, endDate]);

  const memberGrowthResult = await pool.query(`
    SELECT
      COUNT(*) FILTER (
        WHERE ${createdAtManila("u")} >= $1::date
          AND ${createdAtManila("u")} < ($2::date + INTERVAL '1 day')
      )::int AS current_count,
      COUNT(*) FILTER (
        WHERE ${createdAtManila("u")} >= $3::date
          AND ${createdAtManila("u")} < ($4::date + INTERVAL '1 day')
      )::int AS previous_count
    FROM users u
    WHERE LOWER(COALESCE(u.account_status, 'pending')) = 'active'
      AND (
        (${createdAtManila("u")} >= $1::date AND ${createdAtManila("u")} < ($2::date + INTERVAL '1 day'))
        OR (${createdAtManila("u")} >= $3::date AND ${createdAtManila("u")} < ($4::date + INTERVAL '1 day'))
      )
  `, [startDate, endDate, comparisonStartDate, comparisonEndDate]);

  const equipmentUsageResult = await pool.query(`
    WITH equipment_counts AS (
      SELECT
        BTRIM(e.equipment) AS equipment,
        COUNT(*) FILTER (
          WHERE (${completedDateManila}) BETWEEN $1::date AND $2::date
        )::int AS current_count,
        COUNT(*) FILTER (
          WHERE (${completedDateManila}) BETWEEN $3::date AND $4::date
        )::int AS previous_count
      FROM workout_sessions ws
      JOIN workout_plans wp ON wp.workout_plan_id = ws.workout_plan_id
      JOIN exercises e ON e.exercise_id = ws.exercise_id
      WHERE ws.completed IS TRUE
        AND NULLIF(BTRIM(e.equipment), '') IS NOT NULL
        AND LOWER(BTRIM(e.equipment)) <> 'gym equipment'
        AND (
          (${completedDateManila}) BETWEEN $1::date AND $2::date
          OR (${completedDateManila}) BETWEEN $3::date AND $4::date
        )
      GROUP BY BTRIM(e.equipment)
    )
    SELECT equipment, current_count, previous_count
    FROM equipment_counts
    ORDER BY (current_count + previous_count) DESC, current_count DESC, equipment
    LIMIT 5
  `, [startDate, endDate, comparisonStartDate, comparisonEndDate]);

  const busiestHoursResult = await pool.query(`
    SELECT hours.hour,
      COUNT(*) FILTER (
        WHERE ws.started_at >= $1::date::timestamp AT TIME ZONE 'Asia/Manila'
          AND ws.started_at < ($2::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Manila'
      )::int AS current_count,
      COUNT(*) FILTER (
        WHERE ws.started_at >= $3::date::timestamp AT TIME ZONE 'Asia/Manila'
          AND ws.started_at < ($4::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Manila'
      )::int AS previous_count
    FROM GENERATE_SERIES(0, 23) AS hours(hour)
    LEFT JOIN workout_sessions ws
      ON ws.started_at IS NOT NULL
      AND EXTRACT(HOUR FROM ws.started_at AT TIME ZONE 'Asia/Manila')::int = hours.hour
      AND (
        (ws.started_at >= $1::date::timestamp AT TIME ZONE 'Asia/Manila'
          AND ws.started_at < ($2::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Manila')
        OR (ws.started_at >= $3::date::timestamp AT TIME ZONE 'Asia/Manila'
          AND ws.started_at < ($4::date + INTERVAL '1 day')::timestamp AT TIME ZONE 'Asia/Manila')
      )
    GROUP BY hours.hour
    ORDER BY hours.hour
  `, [startDate, endDate, comparisonStartDate, comparisonEndDate]);

  const workloadResult = await pool.query(`
    SELECT
      t.trainer_id,
      t.full_name AS trainer_name,
      INITCAP(LOWER(COALESCE(t.status, 'unknown'))) AS trainer_status,
      COUNT(DISTINCT u.user_id) FILTER (
        WHERE LOWER(COALESCE(u.account_status, 'pending')) = 'active'
      )::int AS active_members,
      COUNT(DISTINCT ws.session_id) FILTER (
        WHERE ws.completed IS TRUE
          AND (${completedDateManila}) BETWEEN $1::date AND $2::date
      )::int AS completed_workouts
    FROM trainers t
    LEFT JOIN users u ON u.trainer_id = t.trainer_id
    LEFT JOIN workout_plans wp ON wp.trainer_id = t.trainer_id
    LEFT JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
    GROUP BY t.trainer_id, t.full_name, t.status
    ORDER BY active_members DESC, completed_workouts DESC, t.full_name
  `, [startDate, endDate]);

  return {
    monthly_trends: trendResult.rows,
    member_growth: memberGrowthResult.rows[0] || { current_count: 0, previous_count: 0 },
    equipment_usage: equipmentUsageResult.rows,
    busiest_hours: busiestHoursResult.rows,
    trainer_workload: workloadResult.rows,
  };
};

const getAdminReports = async (req, res) => {
  const { type, start_date: startDate, end_date: endDate } = req.query;
  if (type !== "operational" && type !== "statistical") {
    return res.status(400).json({ success: false, message: "Choose an operational or statistical report." });
  }

  const range = getDateRange(startDate, endDate);
  if (!range) {
    return res.status(400).json({
      success: false,
      message: "Choose a valid date range no longer than 366 days, with the start date on or before the end date.",
    });
  }

  try {
    const comparisonRange = getComparisonRange(range);
    const data = type === "operational"
      ? await getOperationalReport(range)
      : await getStatisticalReport({
        ...range,
        comparisonStartDate: comparisonRange.startDate,
        comparisonEndDate: comparisonRange.endDate,
      });
    return res.json({
      success: true,
      data: {
        type,
        period: {
          start_date: range.startDate,
          end_date: range.endDate,
          ...(type === "statistical" ? {
            comparison_start_date: comparisonRange.startDate,
            comparison_end_date: comparisonRange.endDate,
          } : {}),
        },
        ...data,
      },
    });
  } catch (error) {
    console.error("getAdminReports error:", error.message);
    return res.status(500).json({ success: false, message: "Unable to generate the requested report." });
  }
};

module.exports = { getAdminReports };
