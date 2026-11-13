const pool = require("../db");
const { createNotification } = require("../utils/notifications");
const {
  isMailConfigured,
  sendWorkoutPlanApprovalRequestEmail,
} = require("../utils/mailer");
const { getWorkoutGoalRules, isWorkoutDoseAllowed } = require("../utils/workoutGoalRules");
const {
  TRAINING_PROGRAMS,
  getExerciseLimitForExperience,
  exerciseMatchesProgram,
  isExerciseAllowedForExperience,
  getProgramForDate,
  getScheduledPrograms,
  requiresConservativeWorkout,
} = require("../utils/trainingPrograms");

const DEFAULT_WORKOUT_SESSION_DURATION = 60;

const SCHEDULED_FOR_TODAY_SQL = `(
  (
    ws.session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND ws.session_date = TO_CHAR(NOW() AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD')
  )
  OR (
    ws.session_date::text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    AND LOWER(BTRIM(ws.session_date::text)) = LOWER(TO_CHAR(NOW() AT TIME ZONE 'Asia/Manila', 'FMDay'))
  )
)`;

const getOwnedSessionSchedule = async (sessionId, userId) => pool.query(`
  SELECT ws.session_id, ws.session_date, wp.deletion_request_status,
         ${SCHEDULED_FOR_TODAY_SQL} AS scheduled_today
  FROM workout_sessions ws
  JOIN workout_plans wp ON ws.workout_plan_id = wp.workout_plan_id
  WHERE ws.session_id = $1 AND wp.user_id = $2
    AND wp.approval_status = 'Approved'
`, [sessionId, userId]);

// GET user's workout plan
const getUserWorkoutPlan = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ws.*, e.exercise_name, e.muscle_group, e.difficulty, e.equipment, e.description,
             wp.workout_plan_id, wp.plan_name, wp.trainer_change_reason,
             wp.training_program, wp.previous_training_program, wp.is_program_switch,
             wp.deletion_request_status,
             wp.scheduled_start_time, wp.scheduled_duration_minutes
      FROM workout_sessions ws
      JOIN workout_plans wp ON wp.workout_plan_id = ws.workout_plan_id
      LEFT JOIN exercises e ON ws.exercise_id = e.exercise_id
      WHERE wp.user_id = $1
        AND wp.approval_status = 'Approved'
      ORDER BY ws.session_date ASC
    `, [req.user.user_id]);
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("getUserWorkoutPlan error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET user's workout plans list
const getUserPlans = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT wp.*,
              COALESCE(
                (SELECT MIN(ws.session_date)::text
               FROM workout_sessions ws
               WHERE ws.workout_plan_id = wp.workout_plan_id),
                wp.requested_session_date::text
              ) AS session_date,
              (SELECT COALESCE(BOOL_OR(ws.started_at IS NOT NULL OR ws.completed = TRUE), FALSE)
               FROM workout_sessions ws
               WHERE ws.workout_plan_id = wp.workout_plan_id) AS has_started
       FROM workout_plans wp
       WHERE wp.user_id = $1
       ORDER BY wp.created_at DESC`,
      [req.user.user_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error("getUserPlans error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

const requestWorkoutPlan = async (req, res) => {
  const sessionDate = req.body.session_date;
  const requestType = req.body.request_type || "member_plan";
  const requestNote = typeof req.body.notes === "string" ? req.body.notes.trim() : "";
  const normalizedRequestType = requestType === "keep_current_program"
    ? "coach_created"
    : requestType === "specific_workout" || requestType === "program_change"
      ? "member_plan"
      : requestType;
  if (!["member_plan", "coach_created", "keep_current_program", "program_change", "specific_workout"].includes(requestType)) {
    return res.status(400).json({ success: false, message: "Choose a valid workout request type." });
  }
  const sessions = Array.isArray(req.body.sessions) ? req.body.sessions : [];
  const parsedDate = typeof sessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sessionDate)
    ? new Date(`${sessionDate}T00:00:00.000Z`)
    : null;
  if (!parsedDate || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== sessionDate) {
    return res.status(400).json({ success: false, message: "Choose a valid workout date." });
  }
  if (normalizedRequestType === "member_plan" && requestType !== "specific_workout" && (sessions.length < 3 || sessions.length > 30)) {
    return res.status(400).json({ success: false, message: "A workout plan must contain between 3 and 30 exercises." });
  }
  if (normalizedRequestType === "member_plan" && requestType === "specific_workout" && sessions.length > 30) {
    return res.status(400).json({ success: false, message: "A workout request can include up to 30 exercises." });
  }
  if ((requestType === "keep_current_program" || requestType === "specific_workout" || requestType === "program_change") && sessions.length > 30) {
    return res.status(400).json({ success: false, message: "A coach-requested workout can include up to 30 exercises." });
  }
  if (requestType === "keep_current_program" && (sessions.length < 3 || sessions.length > 30)) {
    return res.status(400).json({ success: false, message: "Add between 3 and 30 exercises for your coach to review." });
  }
  if (normalizedRequestType === "coach_created" && requestType !== "keep_current_program" && sessions.length !== 0) {
    return res.status(400).json({ success: false, message: "A coach-created workout request must not include member-selected exercises." });
  }
  if (requestNote.length > 1000) {
    return res.status(400).json({ success: false, message: "Keep the coach notes under 1000 characters." });
  }
  if (sessions.length && sessions.some((session) =>
    !session ||
    !Number.isInteger(Number(session.exercise_id)) ||
    Number(session.exercise_id) < 1 ||
    !Number.isInteger(Number(session.sets)) ||
    Number(session.sets) < 1 ||
    Number(session.sets) > 6 ||
    !Number.isInteger(Number(session.reps)) ||
    Number(session.reps) < 3 ||
    Number(session.reps) > 16
  )) {
    return res.status(400).json({ success: false, message: "Every exercise needs sets from 1 to 6 and reps from 3 to 16." });
  }
  const exerciseIds = sessions.map((session) => Number(session.exercise_id));
  if (sessions.length && new Set(exerciseIds).size !== exerciseIds.length) {
    return res.status(400).json({ success: false, message: "An exercise can only appear once in a workout plan." });
  }

  let client;
  let transactionStarted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionStarted = true;

    const memberResult = await client.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email, u.trainer_id,
              u.activity_level,
              u.fitness_goal, u.workout_days_per_week,
              u.preferred_days, u.injuries, u.health_conditions,
              u.target_weight,
              TO_CHAR(u.membership_start_date, 'YYYY-MM-DD') AS membership_start_date,
              TO_CHAR(u.membership_end_date, 'YYYY-MM-DD') AS membership_end_date,
              t.full_name AS trainer_name,
              t.email AS trainer_email
       FROM users u
       LEFT JOIN trainers t ON t.trainer_id = u.trainer_id AND t.status = 'Active'
       WHERE u.user_id = $1
         AND LOWER(COALESCE(u.account_status, 'pending')) = 'active'
       FOR UPDATE OF u`,
      [req.user.user_id]
    );
    if (!memberResult.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({ success: false, message: "An active member account is required to request a workout plan." });
    }
    const member = memberResult.rows[0];
    const exerciseLimit = getExerciseLimitForExperience(member.activity_level);
    if (sessions.length > exerciseLimit.max) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({
        success: false,
        message: `${exerciseLimit.label} workouts can include up to ${exerciseLimit.max} exercises.`,
      });
    }
    if (!member.trainer_id || !member.trainer_email) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: "Choose an active coach before submitting a workout plan." });
    }

    const todayResult = await client.query(
      "SELECT TO_CHAR((NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD') AS today"
    );
    if (sessionDate <= todayResult.rows[0].today) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: "Workout requests are only available for future dates." });
    }
    if (member.membership_end_date && member.membership_end_date < todayResult.rows[0].today) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "Your membership has ended. You can continue using AveFit, but workout requests are unavailable until it is renewed.",
      });
    }
    const membershipStartDate = member.membership_start_date || null;
    const membershipEndDate = member.membership_end_date || null;
    if ((membershipStartDate && sessionDate < membershipStartDate)
      || (membershipEndDate && sessionDate > membershipEndDate)) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(403).json({
        success: false,
        message: "Workout requests must be scheduled within your membership period.",
      });
    }

    const scheduledDay = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(parsedDate);
    const availability = await client.query(
      `SELECT day_of_week FROM user_workout_availability
       WHERE user_id = $1 AND LOWER(day_of_week) = LOWER($2)`,
      [member.user_id, scheduledDay]
    );
    if (!availability.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: `Choose one of your available workout days. ${scheduledDay} is not selected in your schedule.` });
    }

    const defaultProgram = getProgramForDate(sessionDate, member.preferred_days || []);
    const isProgramSwitch = req.body.is_program_switch === true;
    const trainingProgram = typeof req.body.training_program === "string" && req.body.training_program.trim()
      ? req.body.training_program.trim()
      : defaultProgram;
    if (!defaultProgram || !TRAINING_PROGRAMS.includes(trainingProgram)) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: "Set your preferred workout days before choosing a training program." });
    }
    if (!getScheduledPrograms(member.preferred_days || []).has(trainingProgram)) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ success: false, message: "Choose a program from your preferred weekly split." });
    }
    if (isProgramSwitch) {
      if (trainingProgram === defaultProgram || req.body.previous_program !== defaultProgram) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({ success: false, message: "Choose an alternative program to request a switch." });
      }
    } else if (trainingProgram !== defaultProgram) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: "Use the switch-program option to request a different program." });
    }
    const alreadySelected = await client.query(
      `SELECT 1
       FROM workout_plans wp
       WHERE wp.user_id = $1
         AND wp.training_program = $2
         AND wp.approval_status IN ('Approved', 'Pending')
         AND (
           CASE
             WHEN wp.requested_session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
               THEN wp.requested_session_date::date >= DATE_TRUNC('week', $3::date)::date
                 AND wp.requested_session_date::date < (DATE_TRUNC('week', $3::date) + INTERVAL '7 days')::date
             ELSE FALSE
           END
           OR EXISTS (
             SELECT 1
             FROM workout_sessions ws
             WHERE ws.workout_plan_id = wp.workout_plan_id
               AND CASE
                 WHEN ws.session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
                   THEN ws.session_date::date >= DATE_TRUNC('week', $3::date)::date
                     AND ws.session_date::date < (DATE_TRUNC('week', $3::date) + INTERVAL '7 days')::date
                 ELSE FALSE
               END
           )
         )
       LIMIT 1`,
      [member.user_id, trainingProgram, sessionDate]
    );
    if (alreadySelected.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ success: false, message: "Each program can only be selected once per week. Your choices reset next Monday." });
    }

    const workoutFrequency = Number(member.workout_days_per_week);
    if (!Number.isInteger(workoutFrequency) || workoutFrequency < 1 || workoutFrequency > 7) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: "Set your weekly workout frequency before submitting a plan." });
    }

    const sessionDuration = DEFAULT_WORKOUT_SESSION_DURATION;

    const exercisesResult = await client.query(
      `SELECT e.exercise_id, e.muscle_group, e.difficulty, c.category_name
       FROM exercises e
       LEFT JOIN exercise_categories c ON c.category_id = e.category_id
       WHERE e.exercise_id = ANY($1::int[])`,
      [exerciseIds]
    );
    if (exercisesResult.rowCount !== exerciseIds.length) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(400).json({ success: false, message: "One or more selected exercises are unavailable." });
    }
    const exercisesById = new Map(exercisesResult.rows.map((exercise) => [Number(exercise.exercise_id), exercise]));
    for (const session of sessions) {
      const exercise = exercisesById.get(Number(session.exercise_id));
      if (!isExerciseAllowedForExperience(exercise, member.activity_level || "Beginner")) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: "Choose exercises that match your experience level.",
        });
      }
      if (!exerciseMatchesProgram(exercise, trainingProgram)) {
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({ success: false, message: `Choose only exercises that belong to the ${trainingProgram} program.` });
      }
      if (requiresConservativeWorkout(exercise, member.injuries || [], member.health_conditions || [])) {
        if (String(exercise.difficulty || "").toLowerCase() !== "beginner") {
          await client.query("ROLLBACK");
          transactionStarted = false;
          return res.status(400).json({ success: false, message: "For injury-affected areas or recorded health conditions, choose a beginner-level exercise for coach review." });
        }
        if (Number(session.sets) < 1 || Number(session.sets) > 2 || Number(session.reps) < 6 || Number(session.reps) > 10) {
          await client.query("ROLLBACK");
          transactionStarted = false;
          return res.status(400).json({ success: false, message: "Use 1–2 sets and 6–10 reps for this exercise because the member has injury or health-condition restrictions." });
        }
      } else if (!isWorkoutDoseAllowed(member.fitness_goal, session.sets, session.reps)) {
        const rules = getWorkoutGoalRules(member.fitness_goal);
        await client.query("ROLLBACK");
        transactionStarted = false;
        return res.status(400).json({
          success: false,
          message: rules
            ? `For this fitness goal, each unaffected exercise must use ${rules.sets[0]}–${rules.sets[1]} sets and ${rules.reps[0]}–${rules.reps[1]} reps.`
            : "Enter valid sets and reps for each exercise.",
        });
      }
    }

    const duplicateDate = await client.query(
      `SELECT 1
       FROM workout_plans wp
       WHERE wp.user_id = $1
         AND wp.approval_status IN ('Approved', 'Pending')
         AND (
           (CASE
             WHEN wp.requested_session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN wp.requested_session_date::date
             ELSE NULL
           END = $2::date)
           OR EXISTS (
             SELECT 1 FROM workout_sessions ws
             WHERE ws.workout_plan_id = wp.workout_plan_id
               AND CASE
                 WHEN ws.session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN ws.session_date::date
                 ELSE NULL
               END = $2::date
           )
         )
       LIMIT 1`,
      [member.user_id, sessionDate]
    );
    if (duplicateDate.rowCount) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({ success: false, message: "A workout plan already exists or is awaiting approval for this date." });
    }

    const weeklyPlanCount = await client.query(
      `SELECT COUNT(DISTINCT wp.workout_plan_id)::int AS count
       FROM workout_plans wp
       WHERE wp.user_id = $1
         AND wp.approval_status IN ('Approved', 'Pending')
         AND (
           ((CASE
             WHEN wp.requested_session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN wp.requested_session_date::date
             ELSE NULL
           END >= DATE_TRUNC('week', $2::date)::date)
           AND (CASE
             WHEN wp.requested_session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN wp.requested_session_date::date
             ELSE NULL
           END < (DATE_TRUNC('week', $2::date) + INTERVAL '7 days')::date))
           OR EXISTS (
             SELECT 1 FROM workout_sessions ws
             WHERE ws.workout_plan_id = wp.workout_plan_id
               AND CASE
                 WHEN ws.session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN ws.session_date::date
                 ELSE NULL
               END >= DATE_TRUNC('week', $2::date)::date
               AND CASE
                 WHEN ws.session_date::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN ws.session_date::date
                 ELSE NULL
               END < (DATE_TRUNC('week', $2::date) + INTERVAL '7 days')::date
           )
         )`,
      [member.user_id, sessionDate]
    );
    if (Number(weeklyPlanCount.rows[0].count) >= workoutFrequency) {
      await client.query("ROLLBACK");
      transactionStarted = false;
      return res.status(409).json({
        success: false,
        message: `Your ${workoutFrequency}-day weekly workout frequency is already scheduled or awaiting approval.`,
      });
    }

    const planMemberName = `${member.first_name || ""} ${member.last_name || ""}`.trim() || "Member";
    const planName = `${planMemberName}'s ${trainingProgram} day Workout Routine`;
    const approvalStatus = requestType === "coach_created" ? "Approved" : "Pending";
    const goal = member.target_weight != null && Number.isFinite(Number(member.target_weight))
      ? `Target weight: ${Number(member.target_weight)} kg`
      : member.fitness_goal || "Fitness goal not set";
    const planResult = await client.query(
      `INSERT INTO workout_plans
         (user_id, trainer_id, plan_name, goal, scheduled_duration_minutes, approval_status, training_program, previous_training_program, is_program_switch, request_type, requested_session_date, request_note)
       VALUES ($1, $2, $3, $4, $5, $12, $6, $7, $8, $9, $10, $11)
       RETURNING workout_plan_id, plan_name, goal, approval_status, training_program, previous_training_program, is_program_switch, request_type, request_note`,
      [member.user_id, member.trainer_id, planName, goal, sessionDuration, trainingProgram, isProgramSwitch ? defaultProgram : null, isProgramSwitch, normalizedRequestType, sessionDate, requestNote || null, approvalStatus]
    );
    const planId = planResult.rows[0].workout_plan_id;
    for (const session of sessions) {
      await client.query(
        `INSERT INTO workout_sessions
           (workout_plan_id, exercise_id, sets, reps, duration_minutes, session_date)
         VALUES ($1, $2, $3, $4, NULL, $5)`,
        [planId, Number(session.exercise_id), Number(session.sets), Number(session.reps), sessionDate]
      );
    }

    await client.query("COMMIT");
    transactionStarted = false;

    const memberName = `${member.first_name || ""} ${member.last_name || ""}`.trim() || "A member";
    await createNotification({
      audience: "trainer",
      recipientId: member.trainer_id,
      message: normalizedRequestType === "coach_created" && sessions.length > 0
        ? `${memberName} submitted a ${trainingProgram} workout for ${sessionDate}. Please review the workout.`
        : isProgramSwitch
        ? normalizedRequestType === "coach_created"
          ? `${memberName} requested you to create a ${trainingProgram} workout for ${sessionDate}, switching from ${defaultProgram}. Review the request.`
          : `${memberName} requested a switch from ${defaultProgram} to ${trainingProgram}. Goal weight: ${member.target_weight == null ? "not set" : `${member.target_weight} kg`}. Review the workout request.`
        : normalizedRequestType === "coach_created"
          ? `${memberName} requested a ${trainingProgram} workout from you for ${sessionDate}. Please create the plan.`
          : `${memberName} requested a ${trainingProgram} workout. Goal weight: ${member.target_weight == null ? "not set" : `${member.target_weight} kg`}.`,
      notificationType: "workout",
      userName: memberName,
      targetUrl: `/trainer/workout-plans?planId=${planId}`,
    }).catch((notificationError) => {
      console.error("Workout plan request notification failed:", notificationError.message);
    });

    let emailSent = false;
    if (isMailConfigured()) {
      try {
        const delivery = await sendWorkoutPlanApprovalRequestEmail({
          to: member.trainer_email,
          trainerName: member.trainer_name,
          memberName,
          planName,
          trainingProgram,
          targetWeight: member.target_weight,
          isProgramSwitch,
          previousProgram: defaultProgram,
          requestType: normalizedRequestType,
          hasSubmittedWorkout: sessions.length > 0,
          sessionDate,
        });
        emailSent = delivery.delivered;
      } catch (emailError) {
        console.error("Workout plan approval email failed:", emailError.message);
      }
    }

    return res.status(201).json({
      success: true,
      data: { ...planResult.rows[0], workout_plan_id: planId, session_date: sessionDate, exercise_count: sessions.length },
      email_sent: emailSent,
      message: isProgramSwitch
        ? emailSent
          ? normalizedRequestType === "coach_created"
            ? "Your request for a coach-created program switch was sent. Your coach has been notified by email."
            : "Program switch submitted. Your coach has been notified by email and must approve the workout."
          : "Your request was submitted, but your coach's email could not be delivered. Please contact your coach."
        : emailSent
          ? normalizedRequestType === "coach_created"
            ? sessions.length > 0
              ? "Workout plan submitted. Your coach has been notified by email and will review it."
              : "Workout request sent. Your coach has been notified by email and will create the plan."
            : "Workout plan submitted. Your coach has been notified by email."
          : normalizedRequestType === "coach_created" && sessions.length > 0
            ? "Workout plan submitted for your coach to review, but their email could not be delivered. Please contact your coach."
            : "Your request was submitted, but the coach email could not be delivered. Please contact your coach.",
    });
  } catch (err) {
    if (transactionStarted) await client.query("ROLLBACK");
    console.error("requestWorkoutPlan error:", err.message);
    return res.status(500).json({ success: false, message: "Unable to submit your workout plan." });
  } finally {
    client?.release();
  }
};

// Members must submit complete plans for coach approval instead of adding sessions directly.
const addWorkoutSession = async (req, res) => {
  return res.status(403).json({
    success: false,
    message: "Submit a complete workout plan for coach approval before it can be added to your schedule.",
  });
};

// PUT update workout session
const updateWorkoutSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { sets, reps, duration_minutes, completed } = req.body;
    const memberResult = await pool.query(
      "SELECT fitness_goal FROM users WHERE user_id = $1",
      [req.user.user_id]
    );
    if (memberResult.rowCount && !isWorkoutDoseAllowed(memberResult.rows[0].fitness_goal, sets, reps)) {
      const rules = getWorkoutGoalRules(memberResult.rows[0].fitness_goal);
      return res.status(400).json({
        success: false,
        message: `For your fitness goal, use ${rules.sets[0]}–${rules.sets[1]} sets and ${rules.reps[0]}–${rules.reps[1]} reps.`,
      });
    }
    if (completed === true) {
      const scheduledSession = await getOwnedSessionSchedule(id, req.user.user_id);
      if (!scheduledSession.rowCount) {
        return res.status(404).json({ success: false, message: "Workout not found." });
      }
      if (scheduledSession.rows[0].deletion_request_status === "Pending") {
        return res.status(409).json({ success: false, message: "This workout is paused while your coach reviews its deletion request." });
      }
      if (!scheduledSession.rows[0].scheduled_today) {
        return res.status(400).json({
          success: false,
          message: "You can only complete this workout on its scheduled day.",
        });
      }
    }

    const result = await pool.query(`
      UPDATE workout_sessions ws
      SET sets=$1, reps=$2, duration_minutes=$3, completed=$4
      FROM workout_plans wp
      WHERE ws.session_id=$5
        AND ws.workout_plan_id = wp.workout_plan_id
        AND wp.user_id = $6
        AND wp.approval_status = 'Approved'
        AND COALESCE(wp.deletion_request_status, '') <> 'Pending'
        AND ($4 IS NOT TRUE OR (ws.started_at IS NOT NULL AND ${SCHEDULED_FOR_TODAY_SQL}))
      RETURNING ws.session_id
    `, [sets, reps, duration_minutes, completed || false, id, req.user.user_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, message: "Workout not found." });
    }

    res.json({ success: true, message: "Workout updated." });
  } catch (err) {
    console.error("updateWorkoutSession error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT record the member's workout start/check-in time.
const startWorkoutSession = async (req, res) => {
  try {
    const scheduledSession = await getOwnedSessionSchedule(req.params.id, req.user.user_id);
    if (!scheduledSession.rowCount) {
      return res.status(404).json({ success: false, message: "Workout not found." });
    }
    if (scheduledSession.rows[0].deletion_request_status === "Pending") {
      return res.status(409).json({ success: false, message: "This workout is paused while your coach reviews its deletion request." });
    }
    if (!scheduledSession.rows[0].scheduled_today) {
      return res.status(400).json({
        success: false,
        message: "You can only start this workout on its scheduled day.",
      });
    }

    const result = await pool.query(`
      UPDATE workout_sessions ws
      SET started_at = COALESCE(ws.started_at, NOW())
      FROM workout_plans wp
      WHERE ws.session_id = $1
        AND ws.workout_plan_id = wp.workout_plan_id
        AND wp.user_id = $2
        AND wp.approval_status = 'Approved'
        AND COALESCE(wp.deletion_request_status, '') <> 'Pending'
        AND ws.completed = false
        AND ${SCHEDULED_FOR_TODAY_SQL}
      RETURNING ws.session_id, ws.started_at
    `, [req.params.id, req.user.user_id]);

    if (result.rowCount === 0) {
      return res.status(400).json({ success: false, message: "This workout can only be started on its scheduled day." });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error("startWorkoutSession error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT mark session as complete
const completeSession = async (req, res) => {
  try {
    const scheduledSession = await getOwnedSessionSchedule(req.params.id, req.user.user_id);
    if (!scheduledSession.rowCount) {
      return res.status(404).json({ success: false, message: "Workout not found." });
    }
    if (scheduledSession.rows[0].deletion_request_status === "Pending") {
      return res.status(409).json({ success: false, message: "This workout is paused while your coach reviews its deletion request." });
    }
    if (!scheduledSession.rows[0].scheduled_today) {
      return res.status(400).json({
        success: false,
        message: "You can only complete this workout on its scheduled day.",
      });
    }

    const result = await pool.query(`
      UPDATE workout_sessions ws
      SET completed = true, completed_at = NOW()
      FROM workout_plans wp
      WHERE ws.session_id = $1
        AND ws.workout_plan_id = wp.workout_plan_id
        AND wp.user_id = $2
        AND wp.approval_status = 'Approved'
        AND COALESCE(wp.deletion_request_status, '') <> 'Pending'
        AND ws.started_at IS NOT NULL
        AND ws.completed = false
        AND ${SCHEDULED_FOR_TODAY_SQL}
      RETURNING ws.session_id, ws.workout_plan_id
    `, [req.params.id, req.user.user_id]);

    if (result.rowCount === 0) {
      return res.status(400).json({ success: false, message: "This workout cannot be completed. Start it on its scheduled day first." });
    }

    let workout;
    try {
      const workoutDetails = await pool.query(
        `SELECT COALESCE(wp.trainer_id, u.trainer_id) AS trainer_id,
                e.exercise_name, u.first_name, u.last_name
         FROM workout_plans wp
         JOIN users u ON u.user_id = wp.user_id
         JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
         LEFT JOIN exercises e ON e.exercise_id = ws.exercise_id
         WHERE wp.workout_plan_id = $1 AND ws.session_id = $2`,
        [result.rows[0].workout_plan_id, result.rows[0].session_id]
      );
      workout = workoutDetails.rows[0];
    } catch (err) {
      console.error("Workout completion notification recipient lookup failed:", err.message);
    }
    if (workout?.trainer_id) {
      const memberName = `${workout.first_name || ""} ${workout.last_name || ""}`.trim() || "A member";
      await createNotification({
        audience: "trainer",
        recipientId: workout.trainer_id,
        message: `${memberName} completed ${workout.exercise_name || "a workout task"}.`,
        notificationType: "workout",
        userName: memberName,
        targetUrl: "/trainer/roster",
      }).catch((err) => {
        console.error("Workout completion trainer notification failed:", err.message);
      });
    }

    res.json({ success: true, message: "Session completed." });
  } catch (err) {
    console.error("completeSession error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE workout session
const deleteWorkoutSession = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(`
      DELETE FROM workout_sessions ws
      USING workout_plans wp
      WHERE ws.session_id = $1
        AND ws.workout_plan_id = wp.workout_plan_id
        AND wp.user_id = $2
        AND wp.approval_status = 'Approved'
        AND ws.completed = false
      RETURNING ws.session_id
    `, [id, req.user.user_id]);

    if (result.rowCount === 0) {
      const existing = await pool.query(`
        SELECT ws.completed
        FROM workout_sessions ws
        JOIN workout_plans wp ON ws.workout_plan_id = wp.workout_plan_id
        WHERE ws.session_id = $1 AND wp.user_id = $2
      `, [id, req.user.user_id]);
      if (existing.rows[0]?.completed) {
        return res.status(409).json({ success: false, message: "Completed workouts cannot be deleted." });
      }
      return res.status(404).json({ success: false, message: "Workout not found." });
    }

    res.json({ success: true, message: "Workout deleted." });
  } catch (err) {
    console.error("deleteWorkoutSession error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE reset all sessions in user's plan
const resetWeek = async (req, res) => {
  try {
    await pool.query(`
      DELETE FROM workout_sessions
      WHERE workout_plan_id IN (
        SELECT workout_plan_id FROM workout_plans WHERE user_id=$1 AND approval_status = 'Approved'
      )
      AND completed = false
      AND (
        session_date = ANY(ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']::text[])
        OR (
          session_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND session_date >= TO_CHAR(DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Manila')::date, 'YYYY-MM-DD')
          AND session_date < TO_CHAR((DATE_TRUNC('week', NOW() AT TIME ZONE 'Asia/Manila') + INTERVAL '7 days')::date, 'YYYY-MM-DD')
        )
      )
    `, [req.user.user_id]);
    res.json({ success: true, message: "Week reset." });
  } catch (err) {
    console.error("resetWeek error:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = { getUserWorkoutPlan, getUserPlans, requestWorkoutPlan, addWorkoutSession, updateWorkoutSession, startWorkoutSession, completeSession, deleteWorkoutSession, resetWeek };