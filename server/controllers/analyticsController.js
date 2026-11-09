const pool = require("../db");
const equipmentOptions = require("../utils/equipmentOptions");
const { isMailConfigured, sendMail } = require("../utils/mailer");

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const PROGRAM_SCHEDULES = {
  2: ["Upper", "Lower"],
  3: ["Push", "Pull", "Legs"],
  4: ["Upper", "Lower", "Upper", "Lower"],
  5: ["Push", "Pull", "Legs", "Upper", "Lower"],
  6: ["Push", "Pull", "Legs", "Chest & Back", "Shoulders & Arms", "Legs"],
};

const getTodayProgramTotals = (members, today, includeMemberNames) => {
  const totals = new Map();
  for (const member of members) {
    const preferredDays = Array.isArray(member.preferred_days) ? member.preferred_days : [];
    const orderedDays = WEEKDAYS.filter((day) => preferredDays.some(
      (preferredDay) => String(preferredDay).toLowerCase() === day.toLowerCase()
    ));
    const dayIndex = orderedDays.findIndex((day) => day.toLowerCase() === today.toLowerCase());
    if (dayIndex < 0) continue;

    const schedule = PROGRAM_SCHEDULES[orderedDays.length] || ["Full Body"];
    const program = schedule[dayIndex % schedule.length];
    if (!totals.has(program)) {
      totals.set(program, { program, count: 0, members: [] });
    }
    const total = totals.get(program);
    total.count += 1;
    if (includeMemberNames && member.member_name) {
      total.members.push(member.member_name);
    }
  }
  return [...totals.values()]
    .sort((left, right) => right.count - left.count || left.program.localeCompare(right.program));
};

const getTrainingPulse = async (req, res) => {
  try {
    const audience = req.trainingAudience;
    const trainerId = audience === "trainer" ? Number(req.trainer.trainer_id) : null;
    const todayParts = new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const todayValues = Object.fromEntries(todayParts.map(({ type, value }) => [type, value]));
    const todayDate = `${todayValues.year}-${todayValues.month}-${todayValues.day}`;
    const requestedDate = audience === "user" && typeof req.query.date === "string"
      ? req.query.date
      : todayDate;
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? new Date(`${requestedDate}T00:00:00.000Z`)
      : null;
    if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== requestedDate) {
      return res.status(400).json({ success: false, message: "Choose a valid overview date." });
    }
    const dateForQueries = new Date(`${requestedDate}T12:00:00.000Z`);
    const selectedWeekday = new Intl.DateTimeFormat("en", {
      timeZone: "UTC",
      weekday: "long",
    }).format(dateForQueries);
    const selectedDateLabel = new Intl.DateTimeFormat("en-PH", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(dateForQueries);
    const isToday = requestedDate === todayDate;
    const memberResult = await pool.query(`
      SELECT preferred_days, CONCAT_WS(' ', first_name, last_name) AS member_name
      FROM users
      WHERE LOWER(COALESCE(account_status, 'pending')) = 'active'
        AND ($1::int IS NULL OR trainer_id = $1)
    `, [trainerId]);

    const includeMemberNames = audience === "admin" || audience === "trainer";
    const todayPrograms = getTodayProgramTotals(memberResult.rows, selectedWeekday, includeMemberNames);
    const currentDay = WEEKDAYS.find((day) => day.toLowerCase() === selectedWeekday.toLowerCase());
    const availabilityResult = await pool.query(`
      SELECT period.label, COUNT(DISTINCT member.user_id)::int AS count
      FROM (VALUES
        ('Morning', TIME '06:00', TIME '12:00'),
        ('Afternoon', TIME '12:00', TIME '17:00'),
        ('Evening', TIME '17:00', TIME '22:00')
      ) AS period(label, start_time, end_time)
      LEFT JOIN user_workout_availability availability
        ON LOWER(availability.day_of_week) = LOWER($1)
        AND availability.start_time < period.end_time
        AND availability.end_time > period.start_time
      LEFT JOIN users member
        ON member.user_id = availability.user_id
        AND LOWER(COALESCE(member.account_status, 'pending')) = 'active'
        AND ($2::int IS NULL OR member.trainer_id = $2)
      GROUP BY period.label, period.start_time
      ORDER BY period.start_time
    `, [currentDay, trainerId]);
    const equipmentResult = await pool.query(`
      SELECT BTRIM(e.equipment) AS equipment, COUNT(*)::int AS count
      FROM workout_sessions ws
      JOIN workout_plans wp ON wp.workout_plan_id = ws.workout_plan_id
      JOIN exercises e ON e.exercise_id = ws.exercise_id
      WHERE wp.approval_status = 'Approved'
        AND NULLIF(BTRIM(e.equipment), '') IS NOT NULL
        AND (
          (
            ws.session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            AND ws.session_date = $1
          )
          OR (
            ws.session_date::text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            AND LOWER(BTRIM(ws.session_date::text)) = LOWER($2)
          )
        )
      GROUP BY BTRIM(e.equipment)
      ORDER BY count DESC, equipment ASC
      LIMIT 5
    `, [requestedDate, selectedWeekday]);

    return res.json({
      success: true,
      data: {
        today: selectedWeekday,
        dateLabel: isToday ? `Today · ${selectedWeekday}` : selectedDateLabel,
        dayLabel: isToday ? "today" : `on ${selectedDateLabel}`,
        todayPrograms,
        busiestProgram: todayPrograms[0] || null,
        todayAvailability: availabilityResult.rows,
        mostUsedEquipment: equipmentResult.rows,
      },
    });
  } catch (err) {
    console.error("getTrainingPulse error:", err.message);
    return res.status(500).json({ success: false, message: "Unable to load the training overview." });
  }
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]);

const getWeeklyProgressRows = async (userId = null) => {
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
        AND NULLIF(BTRIM(u.email), '') IS NOT NULL
        AND ($1::int IS NULL OR u.user_id = $1)
      ORDER BY u.first_name, u.last_name, u.user_id
    `, [userId]);

  return result.rows;
};

const buildWeeklyProgressReport = (member) => {
      const achievements = [];
      if (member.completed_workouts > 0) {
        achievements.push(`Completed ${member.completed_workouts} workout ${member.completed_workouts === 1 ? "session" : "sessions"}${member.completed_plan_names ? ` (${member.completed_plan_names})` : ""}`);
      }
      if (member.progress_date) {
        const measurements = [
          ["Weight", member.current_weight, "kg"],
          ["BMI", member.current_bmi, ""],
          ["Body fat", member.current_body_fat, "%"],
          ["Waist", member.current_waist, ""],
          ["Chest", member.current_chest, ""],
          ["Hips", member.current_hips, ""],
          ["Left arm", member.current_left_arm, ""],
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
        email: member.email,
        achievements: achievements.length ? achievements : ["No progress entries or completed workouts recorded this week."],
      };
};

const sendMemberWeeklyProgressReport = async (member) => {
  const report = buildWeeklyProgressReport(member);
  const reportDate = new Date().toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "long",
  });
  const text = [
    `Weekly Progress Report for ${report.name}`,
    `Reporting window: the last 7 days · ${reportDate}`,
    "",
    "Your progress summary:",
    ...report.achievements.map((achievement) => `• ${achievement}`),
    "",
    "Keep up your consistency, and log your progress regularly to track your journey.",
    "",
    "Avenue Power & Fitness Gym",
  ].join("\n");
  const achievementsHtml = report.achievements
    .map((achievement) => (
      `<tr><td style="padding:0 0 12px;color:#334155;font-size:15px;line-height:24px;">&#8226;&nbsp; ${escapeHtml(achievement)}</td></tr>`
    ))
    .join("");
  const safeName = escapeHtml(report.name);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Weekly Progress Report</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9" style="width:100%;border-collapse:collapse;background-color:#f1f5f9;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" border="0" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:100%;max-width:600px;border-collapse:collapse;background-color:#ffffff;border:1px solid #e2e8f0;">
            <tr>
              <td bgcolor="#f97316" style="padding:24px;background-color:#f97316;color:#ffffff;">
                <h1 style="margin:0;font-size:22px;line-height:28px;font-weight:700;color:#ffffff;">Weekly Progress Report</h1>
                <p style="margin:8px 0 0;font-size:14px;line-height:20px;color:#ffffff;">Your update for the last 7 days · ${escapeHtml(reportDate)}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <p style="margin:0 0 20px;font-size:16px;line-height:24px;color:#0f172a;">Hi ${safeName}, here is your progress summary:</p>
                <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
                  ${achievementsHtml}
                </table>
                <p style="margin:12px 0 0;font-size:14px;line-height:22px;color:#475569;">Keep up your consistency, and log your progress regularly to track your journey.</p>
                <p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:12px;line-height:18px;color:#64748b;">Avenue Power &amp; Fitness Gym</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return sendMail({
    to: report.email,
    subject: "Your Weekly Progress Report",
    text,
    html,
  });
};

const sendWeeklyProgressReport = async (req, res) => {
  if (!isMailConfigured()) {
    return res.status(503).json({ success: false, message: "Weekly report email is unavailable: SMTP is not configured." });
  }

  const userId = req.params.userId ? Number(req.params.userId) : null;
  if (userId !== null && (!Number.isInteger(userId) || userId < 1)) {
    return res.status(400).json({ success: false, message: "Choose a valid active member." });
  }

  try {
    const members = await getWeeklyProgressRows(userId);
    if (userId !== null && !members.length) {
      return res.status(404).json({ success: false, message: "Active member not found." });
    }

    let sentCount = 0;
    const sentUserIds = [];
    const failed = [];
    for (const member of members) {
      try {
        const delivery = await sendMemberWeeklyProgressReport(member);
        if (delivery.delivered) {
          sentCount += 1;
          sentUserIds.push(member.user_id);
        }
        else failed.push(member.email);
      } catch (emailError) {
        console.error(`Weekly progress report delivery failed for user ${member.user_id}:`, emailError.message);
        failed.push(member.email);
      }
    }

    if (userId !== null && sentCount === 0) {
      return res.status(502).json({ success: false, message: "The weekly progress report was not delivered. Check the email service configuration." });
    }
    if (userId === null && members.length > 0 && sentCount === 0) {
      return res.status(502).json({ success: false, message: "No weekly progress reports could be delivered. Check the email service configuration.", sent_count: 0, failed_count: failed.length });
    }

    return res.json({
      success: true,
      message: userId === null
        ? `Sent weekly progress reports to ${sentCount} of ${members.length} active members${failed.length ? `; ${failed.length} failed` : ""}.`
        : "Weekly progress report sent.",
      member_count: members.length,
      sent_count: sentCount,
      failed_count: failed.length,
      sent_user_ids: sentUserIds,
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
    const equipmentPeriod = req.query.equipment_period || "today";
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
    if (!["today", "week", "month"].includes(equipmentPeriod)) {
      return res.status(400).json({ success: false, message: "Choose today, week, or month for the equipment period." });
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
      WITH categorized_goals AS (
        SELECT
          CASE
            WHEN LOWER(fitness_goal) LIKE '%lose%' THEN 'Lose Weight'
            WHEN LOWER(fitness_goal) LIKE '%gain%'
              OR LOWER(fitness_goal) LIKE '%muscle%'
              OR LOWER(fitness_goal) LIKE '%strength%' THEN 'Gain Weight'
            ELSE 'Maintain Weight'
          END AS goal
        FROM users
        WHERE LOWER(COALESCE(account_status, 'pending')) = 'active'
          AND fitness_goal IS NOT NULL
      )
      SELECT
        goal,
        COUNT(*)::int AS count
      FROM categorized_goals
      GROUP BY goal
      ORDER BY CASE goal
        WHEN 'Maintain Weight' THEN 1
        WHEN 'Lose Weight' THEN 2
        ELSE 3
      END
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
      WITH equipment_catalog AS (
        SELECT BTRIM(equipment) AS equipment
        FROM UNNEST($4::text[]) AS equipment_option(equipment)
        UNION
        SELECT DISTINCT BTRIM(equipment) AS equipment
        FROM exercises
        WHERE NULLIF(BTRIM(equipment), '') IS NOT NULL
      ),
      period_bounds AS (
        SELECT
          COALESCE($1::date, CASE $5
            WHEN 'week' THEN DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Manila')::date
            WHEN 'month' THEN DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila')::date
            ELSE (NOW() AT TIME ZONE 'Asia/Manila')::date
          END) AS starts_on,
          COALESCE($1::date, CASE $5
            WHEN 'week' THEN (DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Manila') + INTERVAL '6 days')::date
            WHEN 'month' THEN (DATE_TRUNC('month', NOW() AT TIME ZONE 'Asia/Manila') + INTERVAL '1 month - 1 day')::date
            ELSE (NOW() AT TIME ZONE 'Asia/Manila')::date
          END) AS ends_on
      ),
      scheduled_occurrences AS (
        SELECT BTRIM(e.equipment) AS equipment,
          occurrence.scheduled_on,
          wp.scheduled_start_time,
          u.preferred_workout_time
        FROM workout_sessions ws
        JOIN workout_plans wp ON wp.workout_plan_id = ws.workout_plan_id
        JOIN users u ON u.user_id = wp.user_id
        JOIN exercises e ON e.exercise_id = ws.exercise_id
        CROSS JOIN period_bounds bounds
        CROSS JOIN LATERAL GENERATE_SERIES(
          bounds.starts_on::timestamp,
          bounds.ends_on::timestamp,
          INTERVAL '1 day'
        ) AS occurrence(scheduled_on)
        WHERE wp.approval_status = 'Approved'
          AND NULLIF(BTRIM(e.equipment), '') IS NOT NULL
          AND (
            (
              ws.session_date::text = TO_CHAR(occurrence.scheduled_on, 'YYYY-MM-DD')
            )
            OR LOWER(BTRIM(ws.session_date::text)) = LOWER(TO_CHAR(occurrence.scheduled_on, 'FMDay'))
          )
      ),
      filtered_usage AS (
        SELECT occurrence.equipment, COUNT(*)::int AS count
        FROM scheduled_occurrences occurrence
        WHERE ($2::integer IS NULL OR EXTRACT(HOUR FROM occurrence.scheduled_start_time)::integer = $2::integer)
          AND ($3::text IS NULL OR CASE $3
              WHEN 'Morning' THEN COALESCE(EXTRACT(HOUR FROM occurrence.scheduled_start_time), CASE occurrence.preferred_workout_time WHEN 'Morning' THEN 6 ELSE NULL END) >= 6
                AND COALESCE(EXTRACT(HOUR FROM occurrence.scheduled_start_time), CASE occurrence.preferred_workout_time WHEN 'Morning' THEN 6 ELSE NULL END) < 12
              WHEN 'Afternoon' THEN COALESCE(EXTRACT(HOUR FROM occurrence.scheduled_start_time), CASE occurrence.preferred_workout_time WHEN 'Afternoon' THEN 12 ELSE NULL END) >= 12
                AND COALESCE(EXTRACT(HOUR FROM occurrence.scheduled_start_time), CASE occurrence.preferred_workout_time WHEN 'Afternoon' THEN 12 ELSE NULL END) < 17
              WHEN 'Evening' THEN COALESCE(EXTRACT(HOUR FROM occurrence.scheduled_start_time), CASE occurrence.preferred_workout_time WHEN 'Evening' THEN 17 ELSE NULL END) >= 17
                AND COALESCE(EXTRACT(HOUR FROM occurrence.scheduled_start_time), CASE occurrence.preferred_workout_time WHEN 'Evening' THEN 17 ELSE NULL END) < 22
              WHEN 'Flexible' THEN COALESCE(EXTRACT(HOUR FROM occurrence.scheduled_start_time), 6) >= 6
                AND COALESCE(EXTRACT(HOUR FROM occurrence.scheduled_start_time), 6) < 22
              ELSE FALSE
            END)
        GROUP BY occurrence.equipment
      )
      SELECT catalog.equipment, COALESCE(usage_stats.count, 0)::int AS count
      FROM equipment_catalog catalog
      LEFT JOIN filtered_usage usage_stats ON usage_stats.equipment = catalog.equipment
      ORDER BY count DESC, catalog.equipment ASC
    `, [
      equipmentDay || null,
      equipmentHour === "" ? null : Number(equipmentHour),
      equipmentTimePeriod || null,
      equipmentOptions,
      equipmentPeriod,
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

module.exports = { getDashboardStats, getAnalytics, getTrainingPulse, sendWeeklyProgressReport };