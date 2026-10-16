const pool = require("../db");

// GET dashboard summary stats
const getDashboardStats = async (req, res) => {
  try {
    const totalMembers = await pool.query("SELECT COUNT(*) AS count FROM users WHERE LOWER(COALESCE(account_status, 'pending')) = 'active'");
    const pendingMembers = await pool.query(`
      SELECT COUNT(*) AS count FROM users
      WHERE LOWER(COALESCE(account_status, 'pending')) = 'pending' 
    `);
    const totalExercises = await pool.query("SELECT COUNT(*) AS count FROM exercises");
    const totalMealPlans = await pool.query("SELECT COUNT(*) AS count FROM meal_plans");

    const recentMembers = await pool.query(`
      SELECT
        user_id AS member_id,
        first_name,
        last_name,
        INITCAP(LOWER(COALESCE(account_status, 'pending'))) AS status,
        created_at AS joined_date
      FROM users
      ORDER BY created_at DESC NULLS LAST, user_id DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        totalMembers: parseInt(totalMembers.rows[0].count),
        pendingMembers: parseInt(pendingMembers.rows[0].count),
        totalExercises: parseInt(totalExercises.rows[0].count),
        totalMealPlans: parseInt(totalMealPlans.rows[0].count),
        recentMembers: recentMembers.rows,
      },
    });
  } catch (err) {
    console.error("getDashboardStats error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET full analytics
const getAnalytics = async (req, res) => {
  try {
    const growthPeriods = {
      week: { granularity: "day", offset: "6 days", step: "1 day", labelFormat: "Dy" },
      month: { granularity: "day", offset: "29 days", step: "1 day", labelFormat: "Mon FMDD" },
      threeMonths: { granularity: "week", offset: "11 weeks", step: "1 week", labelFormat: "Mon FMDD" },
      sixMonths: { granularity: "month", offset: "5 months", step: "1 month", labelFormat: "Mon YYYY" },
      year: { granularity: "month", offset: "11 months", step: "1 month", labelFormat: "Mon YYYY" },
    };
    const requestedGrowthPeriod = req.query.period || "sixMonths";
    const growthPeriod = growthPeriods[requestedGrowthPeriod];

    if (!growthPeriod) {
      return res.status(400).json({
        success: false,
        message: "Invalid growth period. Choose week, month, threeMonths, sixMonths, or year.",
      });
    }

    // Active member sign-ups by calendar month for the last six months.
    const memberGrowth = await pool.query(`
      WITH months AS (
        SELECT month_start
        FROM GENERATE_SERIES(
          DATE_TRUNC('month', NOW()) - INTERVAL '5 months',
          DATE_TRUNC('month', NOW()),
          INTERVAL '1 month'
        ) AS generated(month_start)
      )
      SELECT
        TO_CHAR(months.month_start, 'Mon YYYY') AS month,
        TO_CHAR(months.month_start, 'Mon YYYY') AS label,
        COUNT(users.user_id)::int AS count
      FROM months
      LEFT JOIN users
        ON LOWER(COALESCE(users.account_status, 'pending')) = 'active'
        AND users.created_at >= months.month_start
        AND users.created_at < months.month_start + INTERVAL '1 month'
      GROUP BY months.month_start
      ORDER BY months.month_start ASC
    `);

    const createdAtManila = `CASE
      WHEN pg_typeof(created_at) = 'timestamp with time zone'::regtype
        THEN created_at AT TIME ZONE 'Asia/Manila'
      ELSE created_at::timestamp
    END`;
    const completedAtManila = "(completed_at AT TIME ZONE current_setting('TIMEZONE')) AT TIME ZONE 'Asia/Manila'";
    const growthOverview = await pool.query(`
      WITH bounds AS (
        SELECT
          DATE_TRUNC('${growthPeriod.granularity}', NOW() AT TIME ZONE 'Asia/Manila') - INTERVAL '${growthPeriod.offset}' AS start_at,
          DATE_TRUNC('${growthPeriod.granularity}', NOW() AT TIME ZONE 'Asia/Manila') AS end_at
      ),
      buckets AS (
        SELECT generated.bucket_start
        FROM bounds
        CROSS JOIN LATERAL GENERATE_SERIES(
          bounds.start_at,
          bounds.end_at,
          INTERVAL '${growthPeriod.step}'
        ) AS generated(bucket_start)
      ),
      new_members AS (
        SELECT DATE_TRUNC('${growthPeriod.granularity}', ${createdAtManila}) AS bucket_start,
          COUNT(*)::int AS count
        FROM users
        WHERE LOWER(COALESCE(account_status, 'pending')) = 'active'
          AND ${createdAtManila} >= (SELECT start_at FROM bounds)
          AND ${createdAtManila} < (SELECT end_at FROM bounds) + INTERVAL '${growthPeriod.step}'
        GROUP BY DATE_TRUNC('${growthPeriod.granularity}', ${createdAtManila})
      ),
      completed_workouts AS (
        SELECT DATE_TRUNC('${growthPeriod.granularity}', ${completedAtManila}) AS bucket_start,
          COUNT(*)::int AS count
        FROM workout_sessions
        WHERE completed = true
          AND completed_at IS NOT NULL
          AND ${completedAtManila} >= (SELECT start_at FROM bounds)
          AND ${completedAtManila} < (SELECT end_at FROM bounds) + INTERVAL '${growthPeriod.step}'
        GROUP BY DATE_TRUNC('${growthPeriod.granularity}', ${completedAtManila})
      )
      SELECT
        TO_CHAR(buckets.bucket_start, '${growthPeriod.labelFormat}') AS label,
        COALESCE(new_members.count, 0)::int AS new_members,
        COALESCE(completed_workouts.count, 0)::int AS workout_sessions
      FROM buckets
      LEFT JOIN new_members USING (bucket_start)
      LEFT JOIN completed_workouts USING (bucket_start)
      ORDER BY buckets.bucket_start
    `);

    // Fitness goal distribution
    const goalDistribution = await pool.query(`
      SELECT fitness_goal AS goal, COUNT(*) AS count
      FROM users
      WHERE LOWER(COALESCE(account_status, 'pending')) = 'active'
        AND fitness_goal IS NOT NULL
      GROUP BY fitness_goal ORDER BY count DESC
    `);

    // BMI distribution
    const bmiDistribution = await pool.query(`
      SELECT
        CASE
          WHEN (weight / POWER(height / 100.0, 2)) < 18.5 THEN 'Underweight'
          WHEN (weight / POWER(height / 100.0, 2)) BETWEEN 18.5 AND 24.9 THEN 'Normal'
          WHEN (weight / POWER(height / 100.0, 2)) BETWEEN 25 AND 29.9 THEN 'Overweight'
          ELSE 'Obese'
        END AS category,
        COUNT(*) AS count
      FROM users
      WHERE LOWER(COALESCE(account_status, 'pending')) = 'active'
        AND height IS NOT NULL AND height > 0 AND weight IS NOT NULL
      GROUP BY category
    `);

    // completed_at is stored without a timezone, so interpret it in PostgreSQL's
    // configured timezone before converting to the gym's Asia/Manila clock.
    const completionDay = `CASE
      WHEN completed_at IS NOT NULL THEN TO_CHAR(${completedAtManila}, 'FMDay')
      ELSE session_date
    END`;

    // Use the actual completion weekday when a timestamp exists. Older records
    // without completed_at retain the weekday stored in session_date.
    const attendance = await pool.query(`
      SELECT ${completionDay} AS day, COUNT(*) AS count
      FROM workout_sessions
      WHERE completed = true
        AND (completed_at IS NOT NULL OR session_date IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'))
      GROUP BY ${completionDay}
      ORDER BY CASE ${completionDay}
        WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
        WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6
        WHEN 'Sunday' THEN 7 ELSE 8
      END
    `);

    const peakHours = await pool.query(`
      SELECT hours.hour, COALESCE(activity.count, 0)::int AS count
      FROM generate_series(0, 23) AS hours(hour)
      LEFT JOIN (
        SELECT EXTRACT(HOUR FROM started_at AT TIME ZONE 'Asia/Manila')::int AS hour, COUNT(*)::int AS count
        FROM workout_sessions
        WHERE started_at IS NOT NULL
        GROUP BY EXTRACT(HOUR FROM started_at AT TIME ZONE 'Asia/Manila')::int
      ) AS activity ON activity.hour = hours.hour
      ORDER BY hours.hour
    `);

    const dayAvailability = await pool.query(`
      WITH weekdays(day, day_order) AS (
        VALUES
          ('Monday', 1), ('Tuesday', 2), ('Wednesday', 3), ('Thursday', 4),
          ('Friday', 5), ('Saturday', 6), ('Sunday', 7)
      )
      SELECT weekdays.day, COUNT(DISTINCT users.user_id)::int AS count
      FROM weekdays
      LEFT JOIN users
        ON LOWER(COALESCE(users.account_status, 'pending')) = 'active'
        AND EXISTS (
          SELECT 1
          FROM UNNEST(COALESCE(users.preferred_days, ARRAY[]::text[])) AS preferred(day)
          WHERE LOWER(BTRIM(preferred.day)) = LOWER(weekdays.day)
        )
      GROUP BY weekdays.day, weekdays.day_order
      ORDER BY weekdays.day_order
    `);

    const mostUsedEquipment = await pool.query(`
      SELECT BTRIM(e.equipment) AS equipment, COUNT(*)::int AS count
      FROM workout_sessions ws
      JOIN workout_plans wp ON wp.workout_plan_id = ws.workout_plan_id
      JOIN exercises e ON e.exercise_id = ws.exercise_id
      WHERE NULLIF(BTRIM(e.equipment), '') IS NOT NULL
      GROUP BY BTRIM(e.equipment)
      ORDER BY COUNT(*) DESC, BTRIM(e.equipment) ASC
      LIMIT 10
    `);

    // Summary
    const totalMembers = await pool.query("SELECT COUNT(*) AS count FROM users WHERE LOWER(COALESCE(account_status, 'pending')) = 'active'");
    const avgBmi = await pool.query(`
      SELECT ROUND(AVG(weight / POWER(height / 100.0, 2))::numeric,1) AS avg
      FROM users
      WHERE LOWER(COALESCE(account_status, 'pending')) = 'active'
        AND height IS NOT NULL AND height > 0 AND weight IS NOT NULL
    `);
    const totalWorkoutPlans = await pool.query("SELECT COUNT(*) AS count FROM workout_plans");
    const totalMealPlans = await pool.query("SELECT COUNT(*) AS count FROM meal_plans");

    res.json({
      success: true,
      data: {
        summary: {
          totalMembers: parseInt(totalMembers.rows[0].count),
          avgBmi: parseFloat(avgBmi.rows[0].avg) || 0,
          totalWorkoutPlans: parseInt(totalWorkoutPlans.rows[0].count),
          totalNutritionPlans: parseInt(totalMealPlans.rows[0].count),
        },
        memberGrowth: memberGrowth.rows,
        growthOverview: growthOverview.rows,
        goalDistribution: goalDistribution.rows,
        bmiDistribution: bmiDistribution.rows,
        attendance: attendance.rows,
        peakHours: peakHours.rows,
        dayAvailability: dayAvailability.rows,
        mostUsedEquipment: mostUsedEquipment.rows,
        peakMonths: memberGrowth.rows,
      },
    });
  } catch (err) {
    console.error("getAnalytics error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getDashboardStats, getAnalytics };