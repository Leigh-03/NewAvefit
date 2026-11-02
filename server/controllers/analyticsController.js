const pool = require("../db");
const { isMailConfigured, sendMail } = require("../utils/mailer");
const { getConfiguredAdminEmail } = require("../utils/adminAccess");

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

const sendWeeklyProgressReport = async (req, res) => {
  const adminEmail = getConfiguredAdminEmail();
  if (!adminEmail) {
    return res.status(503).json({ success: false, message: "Weekly report email is unavailable: ADMIN_EMAIL is not configured." });
  }
  if (!isMailConfigured()) {
    return res.status(503).json({ success: false, message: "Weekly report email is unavailable: SMTP is not configured." });
  }

  try {
    const result = await pool.query(`
      SELECT
        u.user_id,
        CONCAT_WS(' ', u.first_name, u.last_name) AS member_name,
        u.email,
        current_progress.weight AS current_weight,
        current_progress.bmi AS current_bmi,
        current_progress.body_fat AS current_body_fat,
        current_progress.waist AS current_waist,
        current_progress.chest AS current_chest,
        current_progress.hips AS current_hips,
        current_progress.left_arm AS current_left_arm,
        current_progress.log_date AS progress_date,
        previous_progress.weight AS previous_weight,
        COALESCE(workout_progress.completed_count, 0)::int AS completed_workouts,
        COALESCE(workout_progress.plan_names, '') AS completed_plan_names
      FROM users u
      LEFT JOIN LATERAL (
        SELECT weight, bmi, body_fat, waist, chest, hips, left_arm, log_date
        FROM progress_logs
        WHERE user_id = u.user_id
          AND log_date >= (NOW() AT TIME ZONE 'Asia/Manila')::date - 6
        ORDER BY log_date DESC
        LIMIT 1
      ) current_progress ON TRUE
      LEFT JOIN LATERAL (
        SELECT weight
        FROM progress_logs
        WHERE user_id = u.user_id
          AND log_date < (NOW() AT TIME ZONE 'Asia/Manila')::date - 6
        ORDER BY log_date DESC
        LIMIT 1
      ) previous_progress ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE ws.completed = TRUE AND ws.completed_at >= NOW() - INTERVAL '7 days')::int AS completed_count,
          STRING_AGG(DISTINCT wp.plan_name, ', ') FILTER (
            WHERE ws.completed = TRUE AND ws.completed_at >= NOW() - INTERVAL '7 days'
          ) AS plan_names
        FROM workout_plans wp
        JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
        WHERE wp.user_id = u.user_id
      ) workout_progress ON TRUE
      WHERE LOWER(COALESCE(u.account_status, 'pending')) = 'active'
      ORDER BY u.first_name, u.last_name, u.user_id
    `);

    const reportRows = result.rows.map((member) => {
      const achievements = [];
      if (member.completed_workouts > 0) {
        achievements.push(`Completed ${member.completed_workouts} workout ${member.completed_workouts === 1 ? "session" : "sessions"}${member.completed_plan_names ? ` (${member.completed_plan_names})` : ""}`);
      }
      if (member.progress_date) {
        const measurements = [
          ["Weight", member.current_weight, "kg"],
          ["BMI", member.current_bmi, ""],
          ["Body fat", member.current_body_fat, "%"],
          ["Waist", member.current_waist, "cm"],
          ["Chest", member.current_chest, "cm"],
          ["Hips", member.current_hips, "cm"],
          ["Left arm", member.current_left_arm, "cm"],
        ].filter(([, value]) => value !== null && value !== undefined)
          .map(([label, value, unit]) => `${label}: ${value}${unit}`);
        achievements.push(`Logged progress on ${new Date(member.progress_date).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}${measurements.length ? ` — ${measurements.join(", ")}` : ""}`);
        if (member.current_weight != null && member.previous_weight != null) {
          const change = Number(member.current_weight) - Number(member.previous_weight);
          achievements.push(`Weight ${change < 0 ? "decreased" : change > 0 ? "increased" : "remained stable"} by ${Math.abs(change).toFixed(1)} kg since the previous report period`);
        }
      }
      return {
        name: member.member_name || member.email,
        achievements: achievements.length ? achievements : ["No progress entries or completed workouts recorded this week."],
      };
    });

    const text = [
      "AveFit weekly member progress report",
      "Reporting window: the last 7 days",
      "",
      ...reportRows.flatMap((member) => [
        member.name,
        ...member.achievements.map((achievement) => `- ${achievement}`),
        "",
      ]),
      reportRows.length ? "" : "No active members were found.",
    ].join("\n");
    const rowsHtml = reportRows.length
      ? reportRows.map((member) => `<tr><td style="padding:14px;border-bottom:1px solid #e2e8f0;vertical-align:top;"><strong>${escapeHtml(member.name)}</strong></td><td style="padding:14px;border-bottom:1px solid #e2e8f0;">${member.achievements.map((achievement) => `<p style="margin:0 0 6px;">${escapeHtml(achievement)}</p>`).join("")}</td></tr>`).join("")
      : '<tr><td colspan="2" style="padding:18px;">No active members were found.</td></tr>';
    const html = `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#f8fafc;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;"><tr><td style="padding:22px 28px;background:#f97316;color:#fff;"><strong style="font-size:20px;">AveFit weekly progress report</strong><p style="margin:6px 0 0;">Last 7 days · ${escapeHtml(new Date().toLocaleDateString("en-PH", { timeZone: "Asia/Manila" }))}</p></td></tr><tr><td style="padding:20px 28px;"><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><thead><tr><th align="left" style="padding:10px 14px;background:#f1f5f9;">Member</th><th align="left" style="padding:10px 14px;background:#f1f5f9;">Progress &amp; achievements</th></tr></thead><tbody>${rowsHtml}</tbody></table></td></tr></table></body></html>`;

    const delivery = await sendMail({
      to: adminEmail,
      subject: "AveFit weekly member progress report",
      text,
      html,
    });
    if (!delivery.delivered) {
      return res.status(502).json({ success: false, message: "The weekly report could not be delivered. Check the email service configuration." });
    }

    return res.json({
      success: true,
      message: `Weekly progress report sent to ${adminEmail}.`,
      member_count: reportRows.length,
    });
  } catch (err) {
    console.error("sendWeeklyProgressReport error:", err.message);
    return res.status(500).json({ success: false, message: "Unable to generate or send the weekly progress report." });
  }
};

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
    const equipmentDay = req.query.equipment_day || "";
    const equipmentHour = req.query.equipment_hour || "";
    const equipmentTimePeriod = req.query.equipment_time_period || "";
    const manilaDateParts = new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const manilaDateValues = Object.fromEntries(manilaDateParts.map(({ type, value }) => [type, value]));
    const todayInManila = `${manilaDateValues.year}-${manilaDateValues.month}-${manilaDateValues.day}`;
    const parsedEquipmentDay = typeof equipmentDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(equipmentDay)
      ? new Date(`${equipmentDay}T00:00:00.000Z`)
      : null;
    if (equipmentDay && (
      !parsedEquipmentDay ||
      !Number.isFinite(parsedEquipmentDay.getTime()) ||
      parsedEquipmentDay.toISOString().slice(0, 10) !== equipmentDay
    )) {
      return res.status(400).json({ success: false, message: "Equipment day must be a valid date." });
    }
    if (equipmentDay && equipmentDay > todayInManila) {
      return res.status(400).json({ success: false, message: "Equipment day can't be in the future." });
    }
    if (equipmentHour && (
      typeof equipmentHour !== "string" ||
      !/^(?:[0-9]|1[0-9]|2[0-3])$/.test(equipmentHour)
    )) {
      return res.status(400).json({ success: false, message: "Equipment hour must be between 0 and 23." });
    }
    if (equipmentTimePeriod && !["Morning", "Afternoon", "Evening", "Flexible"].includes(equipmentTimePeriod)) {
      return res.status(400).json({
        success: false,
        message: "Choose Morning, Afternoon, Evening, or Flexible for the equipment time period.",
      });
    }

    const growthPeriods = {
      week: { granularity: "day", offset: "6 days", step: "1 day", labelFormat: "Dy" },
      month: { granularity: "day", offset: "29 days", step: "1 day", labelFormat: "Mon FMDD" },
      threeMonths: { granularity: "week", offset: "11 weeks", step: "1 week", labelFormat: "Mon FMDD" },
      sixMonths: { granularity: "month", offset: "5 months", step: "1 month", labelFormat: "Mon YYYY" },
      year: { granularity: "month", offset: "11 months", step: "1 month", labelFormat: "Mon YYYY" },
    };
    const requestedGrowthPeriod = req.query.period || "sixMonths";
    const growthPeriod = Object.prototype.hasOwnProperty.call(growthPeriods, requestedGrowthPeriod)
      ? growthPeriods[requestedGrowthPeriod]
      : null;

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
          DATE_TRUNC($1, NOW() AT TIME ZONE 'Asia/Manila') - $2::interval AS start_at,
          DATE_TRUNC($1, NOW() AT TIME ZONE 'Asia/Manila') AS end_at
      ),
      buckets AS (
        SELECT generated.bucket_start
        FROM bounds
        CROSS JOIN LATERAL GENERATE_SERIES(
          bounds.start_at,
          bounds.end_at,
          $3::interval
        ) AS generated(bucket_start)
      ),
      new_members AS (
        SELECT DATE_TRUNC($1, ${createdAtManila}) AS bucket_start,
          COUNT(*)::int AS count
        FROM users
        WHERE LOWER(COALESCE(account_status, 'pending')) = 'active'
          AND ${createdAtManila} >= (SELECT start_at FROM bounds)
          AND ${createdAtManila} < (SELECT end_at FROM bounds) + $3::interval
        GROUP BY DATE_TRUNC($1, ${createdAtManila})
      ),
      completed_workouts AS (
        SELECT DATE_TRUNC($1, ${completedAtManila}) AS bucket_start,
          COUNT(*)::int AS count
        FROM workout_sessions
        WHERE completed = true
          AND completed_at IS NOT NULL
          AND ${completedAtManila} >= (SELECT start_at FROM bounds)
          AND ${completedAtManila} < (SELECT end_at FROM bounds) + $3::interval
        GROUP BY DATE_TRUNC($1, ${completedAtManila})
      )
      SELECT
        TO_CHAR(buckets.bucket_start, $4) AS label,
        COALESCE(new_members.count, 0)::int AS new_members,
        COALESCE(completed_workouts.count, 0)::int AS workout_sessions
      FROM buckets
      LEFT JOIN new_members USING (bucket_start)
      LEFT JOIN completed_workouts USING (bucket_start)
      ORDER BY buckets.bucket_start
    `, [
      growthPeriod.granularity,
      growthPeriod.offset,
      growthPeriod.step,
      growthPeriod.labelFormat,
    ]);

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

    const equipmentCompletedAtManila = `CASE
      WHEN pg_typeof(ws.completed_at) = 'timestamp with time zone'::regtype
        THEN ws.completed_at AT TIME ZONE 'Asia/Manila'
      ELSE ws.completed_at::timestamp
    END`;
    const mostUsedEquipment = await pool.query(`
      SELECT BTRIM(e.equipment) AS equipment, COUNT(*)::int AS count
      FROM workout_sessions ws
      JOIN workout_plans wp ON wp.workout_plan_id = ws.workout_plan_id
      JOIN exercises e ON e.exercise_id = ws.exercise_id
      WHERE ws.completed = TRUE
        AND NULLIF(BTRIM(e.equipment), '') IS NOT NULL
        AND ($1::date IS NULL OR (
          ws.completed_at IS NOT NULL
          AND (${equipmentCompletedAtManila})::date = $1::date
        ))
        AND ($2::integer IS NULL OR (
          ws.completed_at IS NOT NULL
          AND EXTRACT(HOUR FROM (${equipmentCompletedAtManila}))::integer = $2::integer
        ))
        AND ($3::text IS NULL OR (
          ws.completed_at IS NOT NULL
          AND CASE $3
            WHEN 'Morning' THEN EXTRACT(HOUR FROM (${equipmentCompletedAtManila})) >= 6
              AND EXTRACT(HOUR FROM (${equipmentCompletedAtManila})) < 12
            WHEN 'Afternoon' THEN EXTRACT(HOUR FROM (${equipmentCompletedAtManila})) >= 12
              AND EXTRACT(HOUR FROM (${equipmentCompletedAtManila})) < 17
            WHEN 'Evening' THEN EXTRACT(HOUR FROM (${equipmentCompletedAtManila})) >= 17
              AND EXTRACT(HOUR FROM (${equipmentCompletedAtManila})) < 22
            WHEN 'Flexible' THEN EXTRACT(HOUR FROM (${equipmentCompletedAtManila})) >= 6
              AND EXTRACT(HOUR FROM (${equipmentCompletedAtManila})) < 22
            ELSE FALSE
          END
        ))
      GROUP BY BTRIM(e.equipment)
      ORDER BY COUNT(*) DESC, BTRIM(e.equipment) ASC
      LIMIT 10
    `, [
      equipmentDay || null,
      equipmentHour === "" ? null : Number(equipmentHour),
      equipmentTimePeriod || null,
    ]);

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

module.exports = { getDashboardStats, getAnalytics, sendWeeklyProgressReport };