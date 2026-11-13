const bcrypt = require("bcrypt");
const crypto = require("node:crypto");
const pool = require("../db");
const { getWorkoutGoalRules } = require("../utils/workoutGoalRules");

const SEED_YEAR = 2026;
const MEMBER_CAPACITY = 15;
const DEMO_WORKOUT_PLAN_PREFIX = `Demo Coach Workout ${SEED_YEAR}`;
const COACHES = [
  { name: "Coach Test One", slug: "one", surname: "Brooks" },
  { name: "Coach Test Two", slug: "two", surname: "Rivera" },
  { name: "Coach Test Three", slug: "three", surname: "Santos" },
  { name: "Coach Test Four", slug: "four", surname: "Bennett" },
  { name: "Coach Test Five", slug: "five", surname: "Cruz" },
];
const FIRST_NAMES = [
  "Alex", "Bailey", "Casey", "Dakota", "Eden",
  "Frankie", "Harper", "Jordan", "Kai", "Logan",
  "Morgan", "Nico", "Parker", "Quinn", "Riley",
];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TRAINER_DAYS = ["Sunday", ...DAYS.slice(0, 6)];
const TIME_WINDOWS = {
  Morning: { start: "06:00", end: "12:00" },
  Afternoon: { start: "12:00", end: "17:00" },
  Evening: { start: "17:00", end: "22:00" },
};
const FITNESS_GOALS = ["Weight Loss", "Gain Weight", "Maintain Weight"];
const EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced"];
const WORKOUT_DAYS = { Beginner: 2, Intermediate: 4, Advanced: 5 };
const PROGRAM_SCHEDULES = {
  2: ["Upper", "Lower"],
  4: ["Upper", "Lower", "Upper", "Lower"],
  5: ["Push", "Pull", "Legs", "Upper", "Lower"],
};
const PROGRAM_MUSCLES = {
  Upper: ["chest", "back", "shoulder", "bicep", "tricep", "arm"],
  Lower: ["leg", "glute", "quad", "hamstring", "calf"],
  Push: ["chest", "shoulder", "tricep"],
  Pull: ["back", "bicep"],
  Legs: ["leg", "glute", "quad", "hamstring", "calf"],
};
const EXPECTED_AVAILABILITY_ENTRIES = COACHES.length * (5 * 2 + 5 * 4 + 5 * 5);
const PROGRESS_MONTH_COUNT = 11;
const PROGRESS_MONTHS = Array.from({ length: PROGRESS_MONTH_COUNT }, (_, index) => ({
  month: index,
  day: index === 10 ? 10 : 15,
}));

const round = (value, places = 1) => Number(value.toFixed(places));
const bmiFor = (weight, height) => round(weight / ((height / 100) ** 2), 2);
const emailFor = (coach, memberIndex) =>
  `coach-test-${coach.slug}-member-${String(memberIndex + 1).padStart(2, "0")}@example.test`;
const profileFor = (coach, coachIndex, memberIndex) => {
  const globalIndex = coachIndex * MEMBER_CAPACITY + memberIndex;
  const fitnessGoal = FITNESS_GOALS[memberIndex % FITNESS_GOALS.length];
  const activityLevel = EXPERIENCE_LEVELS[memberIndex % EXPERIENCE_LEVELS.length];
  const height = 154 + ((globalIndex * 7) % 34);
  const heightMeters = height / 100;
  const startingBmi = fitnessGoal === "Weight Loss"
    ? 27 + ((globalIndex * 3) % 6) * 0.55
    : fitnessGoal === "Gain Weight"
      ? 17.4 + (globalIndex % 4) * 0.2
      : 20 + (globalIndex % 5) * 0.65;
  const startingWeight = round((heightMeters ** 2) * startingBmi);
  const targetBmi = fitnessGoal === "Weight Loss"
    ? 22 + (globalIndex % 4) * 0.35
    : fitnessGoal === "Gain Weight"
      ? 20.5 + (globalIndex % 5) * 0.35
      : startingBmi + ((globalIndex % 3) - 1) * 0.2;
  const targetWeight = round((heightMeters ** 2) * targetBmi);
  const progressFraction = fitnessGoal === "Maintain Weight"
    ? 0
    : 0.68 + ((globalIndex * 7) % 23) / 100;
  const startingBodyFat = fitnessGoal === "Weight Loss"
    ? 27 + (globalIndex % 7) * 1.1
    : fitnessGoal === "Gain Weight"
      ? 13 + (globalIndex % 7) * 0.9
      : 19 + (globalIndex % 8) * 1.0;
  const startingWaist = 68 + ((globalIndex * 13) % 35);
  const startingChest = 82 + ((globalIndex * 7) % 28);
  const startingHips = 85 + ((globalIndex * 11) % 31);
  const startingArm = 23 + ((globalIndex * 5) % 13);
  const startingLeg = 48 + ((globalIndex * 7) % 20);
  const preferredWorkoutTime = Object.keys(TIME_WINDOWS)[memberIndex % 3];
  const workoutDaysPerWeek = WORKOUT_DAYS[activityLevel];
  const firstDay = (globalIndex * 3) % DAYS.length;
  const preferredDays = Array.from(
    { length: workoutDaysPerWeek },
    (_, index) => DAYS[(firstDay + index) % DAYS.length]
  );
  const age = 20 + ((globalIndex * 5) % 36);
  const birthYear = SEED_YEAR - age;
  const birthDate = `${birthYear}-06-15`;
  const logDates = PROGRESS_MONTHS.map(({ month, day }) =>
    new Date(Date.UTC(SEED_YEAR, month, day)).toISOString().slice(0, 10)
  );
  const progress = PROGRESS_MONTHS.map((_, monthIndex) => {
    const fraction = monthIndex / (PROGRESS_MONTHS.length - 1);
    const variation = Math.sin((globalIndex + 1) * (monthIndex + 1)) * Math.sin(Math.PI * fraction);
    const weight = fitnessGoal === "Maintain Weight"
      ? startingWeight + variation * 0.8
      : startingWeight + (targetWeight - startingWeight) * fraction * progressFraction + variation * 0.35;
    const bodyFat = fitnessGoal === "Weight Loss"
      ? startingBodyFat - 4.5 * fraction + variation * 0.3
      : fitnessGoal === "Gain Weight"
        ? startingBodyFat + 0.8 * fraction + variation * 0.25
        : startingBodyFat + variation * 0.3;
    const waist = fitnessGoal === "Weight Loss"
      ? startingWaist - 7 * fraction + variation * 0.5
      : fitnessGoal === "Gain Weight"
        ? startingWaist + 1.5 * fraction + variation * 0.4
        : startingWaist + variation * 0.5;
    const chest = fitnessGoal === "Gain Weight"
      ? startingChest + 3 * fraction + variation * 0.4
      : startingChest - (fitnessGoal === "Weight Loss" ? 1.5 * fraction : 0) + variation * 0.4;
    const hips = startingHips - (fitnessGoal === "Weight Loss" ? 5 * fraction : 0) + variation * 0.5;
    const arm = startingArm + (fitnessGoal === "Gain Weight" ? 2 * fraction : 0) + variation * 0.2;
    const leg = startingLeg + (fitnessGoal === "Gain Weight" ? 1.5 * fraction : 0) + variation * 0.3;
    const roundedWeight = round(weight);

    return {
      weight: roundedWeight,
      bmi: bmiFor(roundedWeight, height),
      body_fat: round(bodyFat),
      log_date: logDates[monthIndex],
      waist: round(waist),
      chest: round(chest),
      hips: round(hips),
      left_arm: round(arm),
      right_arm: round(arm + 0.4),
      left_leg: round(leg),
      right_leg: round(leg + 0.5),
      notes: `Synthetic demo progress check-in for ${logDates[monthIndex]}.`,
    };
  });
  const dayCount = workoutDaysPerWeek;
  const initialSlots = preferredDays.map((day) => ({
    day,
    ...TIME_WINDOWS[preferredWorkoutTime],
    timePreference: preferredWorkoutTime,
  }));
  const fullName = `${FIRST_NAMES[memberIndex]} ${coach.surname}`;

  return {
    firstName: FIRST_NAMES[memberIndex],
    lastName: coach.surname,
    fullName,
    email: emailFor(coach, memberIndex),
    phone: `TEST-${coachIndex + 1}-${String(memberIndex + 1).padStart(2, "0")}`,
    gender: globalIndex % 2 === 0 ? "Female" : "Male",
    birthDate,
    age,
    height,
    fitnessGoal,
    activityLevel,
    targetWeight,
    workoutDaysPerWeek: dayCount,
    workoutDuration: [45, 60, 75, 90][globalIndex % 4],
    preferredDays,
    preferredWorkoutTime,
    intensity: String((globalIndex % 5) + 1),
    trainerId: null,
    initialSlots,
    progress,
    current: progress[progress.length - 1],
  };
};

const buildExpectedEmails = () => COACHES.flatMap((coach) =>
  Array.from({ length: MEMBER_CAPACITY }, (_, index) => emailFor(coach, index))
);

const getTodayInManila = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getDifficultyRank = (difficulty) => {
  const normalized = String(difficulty || "").trim().toLowerCase();
  if (normalized === "beginner") return 1;
  if (normalized === "intermediate" || normalized === "moderate") return 2;
  if (normalized === "advanced") return 3;
  return 0;
};

const getScheduledStartTime = (profile, globalIndex, monthIndex, programIndex) => {
  const startMinutes = Number(TIME_WINDOWS[profile.preferredWorkoutTime].start.slice(0, 2)) * 60;
  const scheduledMinutes = startMinutes + ((globalIndex + monthIndex + programIndex) % 4) * 30;
  return `${String(Math.floor(scheduledMinutes / 60)).padStart(2, "0")}:${String(scheduledMinutes % 60).padStart(2, "0")}`;
};

const buildDemoWorkoutFixtures = (userRows, exercises, today) => {
  const usersByEmail = new Map(userRows.map((user) => [user.email, user]));
  const plans = [];
  const sessions = [];
  const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" });

  for (let coachIndex = 0; coachIndex < COACHES.length; coachIndex += 1) {
    for (let memberIndex = 0; memberIndex < MEMBER_CAPACITY; memberIndex += 1) {
      const globalIndex = coachIndex * MEMBER_CAPACITY + memberIndex;
      const profile = profileFor(COACHES[coachIndex], coachIndex, memberIndex);
      const user = usersByEmail.get(profile.email);
      if (!user || !Number(user.trainer_id)) {
        throw new Error(`The synthetic member for ${COACHES[coachIndex].name} is missing or assigned elsewhere.`);
      }
      profile.trainerId = Number(user.trainer_id);

      const orderedWorkoutDays = DAYS.filter((day) => profile.preferredDays.includes(day));
      const programs = PROGRAM_SCHEDULES[profile.workoutDaysPerWeek];
      if (!programs || orderedWorkoutDays.length !== programs.length) {
        throw new Error(`No workout program schedule is configured for ${profile.activityLevel}.`);
      }
      const experienceRank = getDifficultyRank(profile.activityLevel);
      const allowedExercises = exercises.filter((exercise) => {
        const exerciseRank = getDifficultyRank(exercise.difficulty);
        return exerciseRank > 0 && exerciseRank <= experienceRank;
      });
      if (allowedExercises.length < 5) {
        throw new Error(`The exercise catalog has too few ${profile.activityLevel}-level exercises for demo workouts.`);
      }
      const doseRules = getWorkoutGoalRules(profile.fitnessGoal);
      if (!doseRules) throw new Error(`No workout dose rules are configured for ${profile.fitnessGoal}.`);

      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const daysInMonth = new Date(Date.UTC(SEED_YEAR, monthIndex + 1, 0)).getUTCDate();
        const monthName = monthFormatter.format(new Date(Date.UTC(SEED_YEAR, monthIndex, 1)));
        const plansByProgram = new Map();

        for (let day = 1; day <= daysInMonth; day += 1) {
          const date = new Date(Date.UTC(SEED_YEAR, monthIndex, day));
          const weekday = DAYS[(date.getUTCDay() + 6) % DAYS.length];
          const programIndex = orderedWorkoutDays.indexOf(weekday);
          if (programIndex < 0) continue;

          const program = programs[programIndex];
          const planKey = `${user.user_id}:${monthIndex}:${program}`;
          let plan = plansByProgram.get(program);
          if (!plan) {
            const planName = `${DEMO_WORKOUT_PLAN_PREFIX} ${monthName} - ${profile.fullName} ${program} Plan`;
            const scheduledStartTime = getScheduledStartTime(profile, globalIndex, monthIndex, programIndex);
            plan = {
              key: planKey,
              userId: Number(user.user_id),
              trainerId: Number(user.trainer_id),
              planName,
              goal: `${profile.fitnessGoal}; target ${profile.targetWeight} kg`,
              createdAt: `${SEED_YEAR}-${String(monthIndex + 1).padStart(2, "0")}-01 08:00:00`,
              scheduledStartTime,
              scheduledDurationMinutes: profile.workoutDuration,
              trainingProgram: program,
              sessionCount: 0,
            };
            plansByProgram.set(program, plan);
            plans.push(plan);
          }

          const targetMuscles = PROGRAM_MUSCLES[program] || [];
          const matchingExercises = allowedExercises.filter((exercise) => {
            const muscleGroup = String(exercise.muscle_group || "").toLowerCase();
            return targetMuscles.some((muscle) => muscleGroup.includes(muscle));
          });
          const exerciseCount = 3 + ((globalIndex + monthIndex + day + programIndex) % 3);
          const candidates = matchingExercises.length >= exerciseCount ? matchingExercises : allowedExercises;
          if (exerciseCount > 5 || candidates.length < exerciseCount) {
            throw new Error(`Unable to select a valid ${program} workout for ${profile.fullName}.`);
          }

          const adherenceScore = 5 + ((globalIndex + monthIndex * 3 + programIndex) % 5);
          const completionBucket = (globalIndex * 11 + monthIndex * 7 + day * 3 + programIndex) % 10;
          const sessionDate = `${SEED_YEAR}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const completed = sessionDate < today && completionBucket < adherenceScore;
          const startTime = getScheduledStartTime(profile, globalIndex, monthIndex, programIndex);
          const startedAt = completed
            ? new Date(`${sessionDate}T${startTime}:00+08:00`)
            : null;
          const completedAt = startedAt
            ? new Date(startedAt.getTime() + profile.workoutDuration * 60 * 1000)
            : null;
          const exerciseOffset = (globalIndex * 17 + monthIndex * 11 + day * 3 + programIndex * 5) % candidates.length;

          for (let exerciseIndex = 0; exerciseIndex < exerciseCount; exerciseIndex += 1) {
            const exercise = candidates[(exerciseOffset + exerciseIndex) % candidates.length];
            const repRange = doseRules.reps[1] - doseRules.reps[0] + 1;
            sessions.push({
              planKey,
              exerciseId: Number(exercise.exercise_id),
              sets: 3 + ((globalIndex + monthIndex + day + exerciseIndex) % 2),
              reps: doseRules.reps[0] + ((globalIndex + monthIndex * 2 + day + exerciseIndex) % repRange),
              sessionDate,
              completed,
              startedAt: startedAt?.toISOString() || null,
              completedAt: completedAt?.toISOString() || null,
            });
            plan.sessionCount += 1;
          }
        }
      }
    }
  }

  return { plans, sessions };
};

const getCoachRows = async (client, lockRows) => client.query(
  `SELECT trainer_id, full_name, status, max_members
   FROM trainers
   WHERE full_name = ANY($1::text[])
   ORDER BY full_name
   ${lockRows ? "FOR UPDATE" : ""}`,
  [COACHES.map((coach) => coach.name)]
);

const getAssignedCounts = async (client, trainerIds) => {
  const result = await client.query(
    `SELECT trainer_id, COUNT(*)::integer AS member_count
     FROM users
     WHERE trainer_id = ANY($1::integer[])
     GROUP BY trainer_id`,
    [trainerIds]
  );
  return new Map(result.rows.map((row) => [Number(row.trainer_id), Number(row.member_count)]));
};

const validateCoaches = (rows) => {
  if (rows.length !== COACHES.length) {
    throw new Error(`Expected exactly ${COACHES.length} named test coaches; found ${rows.length}.`);
  }
  for (const coach of rows) {
    if (coach.status !== "Active" || Number(coach.max_members) !== MEMBER_CAPACITY) {
      throw new Error(`${coach.full_name} must be Active with capacity ${MEMBER_CAPACITY}.`);
    }
  }
};

const getExpectedTrainerSlots = () => TRAINER_DAYS.flatMap((_, dayOfWeek) =>
  Object.values(TIME_WINDOWS).map((range) => ({
    day_of_week: dayOfWeek,
    start_time: range.start,
    end_time: range.end,
    member_limit: 5,
    is_custom: false,
  }))
);

const trainerSlotKey = (slot) =>
  `${Number(slot.day_of_week)}:${slot.start_time}:${slot.end_time}:${Number(slot.member_limit)}:${Boolean(slot.is_custom)}`;

const ensureCoachAvailability = async (client, coach, apply) => {
  const current = await client.query(
    `SELECT day_of_week,
            TO_CHAR(start_time, 'HH24:MI') AS start_time,
            TO_CHAR(end_time, 'HH24:MI') AS end_time,
            member_limit,
            is_custom
     FROM trainer_availability
     WHERE trainer_id = $1
     ORDER BY day_of_week, start_time`,
    [coach.trainer_id]
  );
  const expected = getExpectedTrainerSlots();
  const expectedKeys = new Set(expected.map(trainerSlotKey));
  const actualKeys = new Set(current.rows.map(trainerSlotKey));
  const isExactSchedule = current.rows.length === expected.length &&
    actualKeys.size === expectedKeys.size &&
    [...expectedKeys].every((key) => actualKeys.has(key));

  if (current.rows.length && !isExactSchedule) {
    throw new Error(`${coach.full_name} already has a different availability schedule; refusing to replace it.`);
  }
  if (!current.rows.length && apply) {
    for (const slot of expected) {
      await client.query(
        `INSERT INTO trainer_availability (
           trainer_id, day_of_week, start_time, end_time, member_limit, is_custom
         )
         VALUES ($1, $2, $3::time, $4::time, $5, $6)`,
        [
          coach.trainer_id,
          slot.day_of_week,
          slot.start_time,
          slot.end_time,
          slot.member_limit,
          slot.is_custom,
        ]
      );
    }
  }

  return isExactSchedule;
};

const ensureMemberAvailability = async (client, coach, coachIndex, memberIndex, apply) => {
  const profile = profileFor(coach, coachIndex, memberIndex);
  const userResult = await client.query(
    "SELECT user_id, trainer_id, preferred_workout_time FROM users WHERE email = $1",
    [profile.email]
  );
  if (userResult.rowCount !== 1 || Number(userResult.rows[0].trainer_id) !== Number(coach.trainer_id)) {
    throw new Error(`The synthetic member for ${coach.full_name} is missing or assigned elsewhere.`);
  }

  const user = userResult.rows[0];
  const current = await client.query(
    `SELECT day_of_week,
            TO_CHAR(start_time, 'HH24:MI') AS start_time,
            TO_CHAR(end_time, 'HH24:MI') AS end_time,
            time_preference
     FROM user_workout_availability
     WHERE user_id = $1
     ORDER BY day_of_week`,
    [user.user_id]
  );
  const expectedKeys = new Set(profile.initialSlots.map((slot) =>
    `${slot.day}:${slot.start}:${slot.end}:${slot.timePreference}`
  ));
  const currentKeys = new Set(current.rows.map((slot) =>
    `${slot.day_of_week}:${slot.start_time}:${slot.end_time}:${slot.time_preference}`
  ));
  const isExactAvailability = user.preferred_workout_time === profile.preferredWorkoutTime &&
    current.rows.length === profile.initialSlots.length &&
    currentKeys.size === expectedKeys.size &&
    [...expectedKeys].every((key) => currentKeys.has(key));

  if (isExactAvailability || !apply) return isExactAvailability;

  await client.query(
    "UPDATE users SET preferred_workout_time = $1 WHERE user_id = $2",
    [profile.preferredWorkoutTime, user.user_id]
  );
  await client.query("DELETE FROM user_workout_availability WHERE user_id = $1", [user.user_id]);
  for (const slot of profile.initialSlots) {
    await client.query(
      `INSERT INTO user_workout_availability (
         user_id, day_of_week, start_time, end_time, time_preference
       )
       VALUES ($1, $2, $3::time, $4::time, $5)`,
      [user.user_id, slot.day, slot.start, slot.end, slot.timePreference]
    );
  }
  return true;
};

const ensureDemoSchedules = async (client, coaches, apply) => {
  let schedulesNeeded = false;
  for (const coachRow of coaches) {
    const coachIndex = COACHES.findIndex((entry) => entry.name === coachRow.full_name);
    const coach = { ...COACHES[coachIndex], trainer_id: Number(coachRow.trainer_id) };
    const hasExactSchedule = await ensureCoachAvailability(client, coach, apply);
    if (!hasExactSchedule) schedulesNeeded = true;
    for (let memberIndex = 0; memberIndex < MEMBER_CAPACITY; memberIndex += 1) {
      const hasExactMemberAvailability = await ensureMemberAvailability(
        client,
        coach,
        coachIndex,
        memberIndex,
        apply
      );
      if (!hasExactMemberAvailability) schedulesNeeded = true;
    }
  }

  if (!apply) return schedulesNeeded;

  const overCapacitySlots = await client.query(
    `SELECT ta.trainer_id, ta.day_of_week, ta.start_time, ta.end_time
     FROM trainer_availability ta
     JOIN users member ON member.trainer_id = ta.trainer_id
     JOIN user_workout_availability member_slot
       ON member_slot.user_id = member.user_id
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
     WHERE ta.trainer_id = ANY($1::integer[])
       AND member.email LIKE 'coach-test-%@example.test'
     GROUP BY ta.trainer_id, ta.day_of_week, ta.start_time, ta.end_time, ta.member_limit
     HAVING COUNT(DISTINCT member.user_id) > ta.member_limit`,
    [coaches.map((coach) => Number(coach.trainer_id))]
  );
  if (overCapacitySlots.rowCount) {
    throw new Error("The demo member schedules exceed a coach time slot's member limit.");
  }
  return schedulesNeeded;
};

const ensureDemoWorkoutHistory = async (client, apply) => {
  const emailList = buildExpectedEmails();
  const userResult = await client.query(
    "SELECT user_id, email, trainer_id FROM users WHERE email = ANY($1::text[])",
    [emailList]
  );
  if (userResult.rowCount !== emailList.length) {
    throw new Error("The demo workout history requires all 75 synthetic member accounts.");
  }

  const exerciseResult = await client.query(
    "SELECT exercise_id, exercise_name, muscle_group, difficulty FROM exercises ORDER BY exercise_id"
  );
  if (!exerciseResult.rowCount) throw new Error("The exercise catalog is empty; refusing to create demo workout plans.");

  const fixtures = buildDemoWorkoutFixtures(userResult.rows, exerciseResult.rows, getTodayInManila());
  const existing = await client.query(
    `SELECT wp.user_id, wp.plan_name, COUNT(ws.session_id)::int AS session_count
     FROM workout_plans wp
     JOIN users u ON u.user_id = wp.user_id
     LEFT JOIN workout_sessions ws ON ws.workout_plan_id = wp.workout_plan_id
     WHERE u.email = ANY($1::text[])
       AND wp.plan_name LIKE $2
     GROUP BY wp.workout_plan_id`,
    [emailList, `${DEMO_WORKOUT_PLAN_PREFIX}%`]
  );

  if (existing.rowCount) {
    const expected = new Map(fixtures.plans.map((plan) => [
      `${plan.userId}:${plan.planName}`,
      plan.sessionCount,
    ]));
    if (existing.rowCount !== expected.size || existing.rows.some((plan) => (
      expected.get(`${plan.user_id}:${plan.plan_name}`) !== Number(plan.session_count)
    ))) {
      throw new Error("The existing demo workout history is incomplete or changed; refusing to alter it.");
    }
    return { needed: false, added: false, planCount: fixtures.plans.length, sessionCount: fixtures.sessions.length };
  }

  if (!apply) {
    return { needed: true, added: false, planCount: fixtures.plans.length, sessionCount: fixtures.sessions.length };
  }

  const planInsert = await client.query(
    `INSERT INTO workout_plans (
       user_id, trainer_id, plan_name, goal, created_at,
       scheduled_start_time, scheduled_duration_minutes, training_program, approval_status
     )
     SELECT
       plans.user_id,
       plans.trainer_id,
       plans.plan_name,
       plans.goal,
       plans.created_at,
       plans.scheduled_start_time::time,
       plans.scheduled_duration_minutes,
       plans.training_program,
       'Approved'
     FROM UNNEST(
       $1::integer[], $2::integer[], $3::text[], $4::text[],
       $5::timestamp[], $6::text[], $7::integer[], $8::text[]
     ) AS plans(
       user_id, trainer_id, plan_name, goal, created_at,
       scheduled_start_time, scheduled_duration_minutes, training_program
     )
     RETURNING workout_plan_id, user_id, plan_name`,
    [
      fixtures.plans.map((plan) => plan.userId),
      fixtures.plans.map((plan) => plan.trainerId),
      fixtures.plans.map((plan) => plan.planName),
      fixtures.plans.map((plan) => plan.goal),
      fixtures.plans.map((plan) => plan.createdAt),
      fixtures.plans.map((plan) => plan.scheduledStartTime),
      fixtures.plans.map((plan) => plan.scheduledDurationMinutes),
      fixtures.plans.map((plan) => plan.trainingProgram),
    ]
  );
  if (planInsert.rowCount !== fixtures.plans.length) {
    throw new Error("Not all demo workout plans were created.");
  }

  const planKeysByIdentity = new Map(fixtures.plans.map((plan) => [
    `${plan.userId}:${plan.planName}`,
    plan.key,
  ]));
  const planIdsByKey = new Map(planInsert.rows.map((plan) => [
    planKeysByIdentity.get(`${plan.user_id}:${plan.plan_name}`),
    Number(plan.workout_plan_id),
  ]));
  if (planIdsByKey.size !== fixtures.plans.length || planIdsByKey.has(undefined)) {
    throw new Error("Could not match created workout plans to their scheduled sessions.");
  }

  const sessionRows = fixtures.sessions.map((session) => ({
    ...session,
    planId: planIdsByKey.get(session.planKey),
  }));
  const sessionInsert = await client.query(
    `INSERT INTO workout_sessions (
       workout_plan_id, exercise_id, sets, reps, session_date,
       completed, started_at, completed_at
     )
     SELECT
       sessions.workout_plan_id,
       sessions.exercise_id,
       sessions.sets,
       sessions.reps,
       sessions.session_date,
       sessions.completed,
       sessions.started_at,
       sessions.completed_at
     FROM UNNEST(
       $1::integer[], $2::integer[], $3::integer[], $4::integer[],
       $5::text[], $6::boolean[], $7::timestamptz[], $8::timestamptz[]
     ) AS sessions(
       workout_plan_id, exercise_id, sets, reps, session_date,
       completed, started_at, completed_at
     )`,
    [
      sessionRows.map((session) => session.planId),
      sessionRows.map((session) => session.exerciseId),
      sessionRows.map((session) => session.sets),
      sessionRows.map((session) => session.reps),
      sessionRows.map((session) => session.sessionDate),
      sessionRows.map((session) => session.completed),
      sessionRows.map((session) => session.startedAt),
      sessionRows.map((session) => session.completedAt),
    ]
  );
  if (sessionInsert.rowCount !== fixtures.sessions.length) {
    throw new Error("Not all demo workout sessions were created.");
  }

  return { needed: false, added: true, planCount: fixtures.plans.length, sessionCount: fixtures.sessions.length };
};

const insertMember = async (client, coach, coachIndex, memberIndex, passwordHash) => {
  const profile = profileFor(coach, coachIndex, memberIndex);
  profile.trainerId = Number(coach.trainer_id);
  const memberResult = await client.query(
    `INSERT INTO users (
       first_name, last_name, email, password, phone, gender, birth_date,
       height, weight, fitness_goal, activity_level, address, role,
       age, target_weight, workout_days_per_week, workout_duration,
       preferred_days, intensity, injuries, health_conditions, trainer_id,
       setup_completed, account_status, email_verified, email_verified_at,
       membership_months, membership_start_date, membership_end_date,
       preferred_workout_time, injury_pain_levels
     )
     VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, 'Demo profile', 'Member',
       $12, $13, $14, $15,
       $16, $17, ARRAY['None']::text[], ARRAY['None']::text[], $18,
       TRUE, 'Active', TRUE, CURRENT_TIMESTAMP,
       12, DATE '2026-01-01', DATE '2027-01-01',
       $19, '{}'::jsonb
     )
     RETURNING user_id`,
    [
      profile.firstName,
      profile.lastName,
      profile.email,
      passwordHash,
      profile.phone,
      profile.gender,
      profile.birthDate,
      profile.height,
      profile.current.weight,
      profile.fitnessGoal,
      profile.activityLevel,
      profile.age,
      profile.targetWeight,
      profile.workoutDaysPerWeek,
      profile.workoutDuration,
      profile.preferredDays,
      profile.intensity,
      profile.trainerId,
      profile.preferredWorkoutTime,
    ]
  );
  const userId = memberResult.rows[0].user_id;
  const bmi = profile.current.bmi;

  await client.query(
    `INSERT INTO members (
       full_name, email, phone, gender, age, height, weight, bmi,
       fitness_goal, status, joined_date, trainer_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Active', DATE '2026-01-01', $10)`,
    [
      profile.fullName,
      profile.email,
      profile.phone,
      profile.gender,
      profile.age,
      profile.height,
      profile.current.weight,
      bmi,
      profile.fitnessGoal,
      profile.trainerId,
    ]
  );

  for (const entry of profile.progress) {
    await client.query(
      `INSERT INTO progress_logs (
         user_id, weight, bmi, body_fat, log_date, waist, chest, hips,
         left_arm, right_arm, left_leg, right_leg, notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        userId,
        entry.weight,
        entry.bmi,
        entry.body_fat,
        entry.log_date,
        entry.waist,
        entry.chest,
        entry.hips,
        entry.left_arm,
        entry.right_arm,
        entry.left_leg,
        entry.right_leg,
        entry.notes,
      ]
    );
  }

  for (const slot of profile.initialSlots) {
    await client.query(
      `INSERT INTO user_workout_availability (
         user_id, day_of_week, start_time, end_time, time_preference
       )
       VALUES ($1, $2, $3::time, $4::time, $5)`,
      [userId, slot.day, slot.start, slot.end, slot.timePreference]
    );
  }
};

const seed = async () => {
  const apply = process.argv.includes("--apply");
  const client = await pool.connect();
  let inTransaction = false;
  try {
    if (apply) {
      await client.query("BEGIN");
      inTransaction = true;
    }

    const coachResult = await getCoachRows(client, apply);
    validateCoaches(coachResult.rows);
    const coachIds = coachResult.rows.map((row) => Number(row.trainer_id));
    const assignedCounts = await getAssignedCounts(client, coachIds);
    const emailList = buildExpectedEmails();
    const existingUsers = await client.query(
      "SELECT email, trainer_id FROM users WHERE email = ANY($1::text[])",
      [emailList]
    );

    if (existingUsers.rowCount === emailList.length) {
      for (const coach of coachResult.rows) {
        const coachIndex = COACHES.findIndex((entry) => entry.name === coach.full_name);
        const expectedCoachEmails = Array.from(
          { length: MEMBER_CAPACITY },
          (_, index) => emailFor(COACHES[coachIndex], index)
        );
        const existingCoachEmails = existingUsers.rows.filter(
          (user) => Number(user.trainer_id) === Number(coach.trainer_id)
        ).map((user) => user.email);
        const expectedSet = new Set(expectedCoachEmails);
        if (existingCoachEmails.length !== MEMBER_CAPACITY ||
            existingCoachEmails.some((email) => !expectedSet.has(email)) ||
            Number(assignedCounts.get(Number(coach.trainer_id)) || 0) !== MEMBER_CAPACITY) {
          throw new Error(`${coach.full_name} has a partial or changed demo seed; refusing to alter it.`);
        }
      }
      const relatedCounts = await client.query(
        `SELECT
           (SELECT COUNT(*)::integer FROM members WHERE email = ANY($1::text[])) AS legacy_members,
           (SELECT COUNT(*)::integer FROM progress_logs p JOIN users u ON u.user_id = p.user_id
             WHERE u.email = ANY($1::text[])) AS progress_entries,
           (SELECT COUNT(*)::integer FROM user_workout_availability a JOIN users u ON u.user_id = a.user_id
             WHERE u.email = ANY($1::text[])) AS availability_entries`,
        [emailList]
      );
      if (Number(relatedCounts.rows[0].legacy_members) !== emailList.length ||
          Number(relatedCounts.rows[0].progress_entries) !== emailList.length * PROGRESS_MONTHS.length ||
          Number(relatedCounts.rows[0].availability_entries) !== EXPECTED_AVAILABILITY_ENTRIES) {
        throw new Error("The existing seed is missing linked member or progress records; refusing to modify it.");
      }
      const schedulesNeeded = await ensureDemoSchedules(client, coachResult.rows, apply);
      const workoutHistory = await ensureDemoWorkoutHistory(client, apply);
      if (apply) await client.query("COMMIT");
      inTransaction = false;
      if (schedulesNeeded && !apply) {
        console.log("Dry run: member profiles are seeded; coach/member schedules still need to be configured.");
      }
      if (workoutHistory.needed) {
        console.log(`Dry run: would add ${workoutHistory.planCount} monthly workout plans and ${workoutHistory.sessionCount} dated exercises across January–December ${SEED_YEAR}.`);
        console.log("Only past workouts are marked complete; today's and future workouts remain scheduled.");
      } else if (workoutHistory.added) {
        console.log(`Added ${workoutHistory.planCount} monthly workout plans and ${workoutHistory.sessionCount} dated exercises across January–December ${SEED_YEAR}.`);
        console.log("Only past workouts are marked complete; today's and future workouts remain scheduled.");
      } else if (schedulesNeeded && !apply) {
        console.log("Coach test members and workout history are already seeded.");
      } else {
        console.log("Coach test members, schedules, and workout history are already seeded.");
      }
      return;
    }

    if (existingUsers.rowCount > 0) {
      throw new Error("Some reserved demo emails already exist; refusing to create a partial seed.");
    }

    for (const coach of coachResult.rows) {
      const count = Number(assignedCounts.get(Number(coach.trainer_id)) || 0);
      if (count !== 0) {
        throw new Error(`${coach.full_name} already has ${count} members; refusing to exceed or replace its roster.`);
      }
    }

    if (!apply) {
      console.log(`Dry run: would add ${MEMBER_CAPACITY} complete demo members to each of ${COACHES.length} coaches.`);
      console.log(`This creates ${MEMBER_CAPACITY * COACHES.length} active member profiles and ${MEMBER_CAPACITY * COACHES.length * PROGRESS_MONTHS.length} progress entries from January through November ${SEED_YEAR}.`);
      console.log(`Each member will also receive varied approved workout plans and dated sessions throughout January–December ${SEED_YEAR}; December workouts will remain scheduled until their dates.`);
      return;
    }

    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
    for (let memberIndex = 0; memberIndex < MEMBER_CAPACITY; memberIndex += 1) {
      for (let coachIndex = 0; coachIndex < COACHES.length; coachIndex += 1) {
        const coachRow = coachResult.rows.find((row) => row.full_name === COACHES[coachIndex].name);
        const coach = { ...COACHES[coachIndex], trainer_id: coachRow.trainer_id };
        await insertMember(client, coach, coachIndex, memberIndex, passwordHash);
      }
    }

    const workoutHistory = await ensureDemoWorkoutHistory(client, true);
    const seededCounts = await getAssignedCounts(client, coachIds);
    for (const coach of coachResult.rows) {
      if (Number(seededCounts.get(Number(coach.trainer_id)) || 0) !== MEMBER_CAPACITY) {
        throw new Error(`${coach.full_name} did not reach the expected member capacity.`);
      }
    }
    await ensureDemoSchedules(client, coachResult.rows, true);

    await client.query("COMMIT");
    inTransaction = false;
    console.log(`Seeded ${MEMBER_CAPACITY * COACHES.length} complete synthetic member profiles across all five test coaches.`);
    console.log(`Added ${MEMBER_CAPACITY * COACHES.length * PROGRESS_MONTHS.length} progress entries from January through November ${SEED_YEAR}.`);
    console.log(`Added ${workoutHistory.planCount} monthly workout plans and ${workoutHistory.sessionCount} dated exercises across January–December ${SEED_YEAR}.`);
    console.log("Only past workouts are marked complete; today's and future workouts remain scheduled.");
    console.log("Configured seven days of morning, afternoon, and evening availability for each coach.");
  } catch (error) {
    if (inTransaction) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

seed().catch((error) => {
  console.error(`Coach test member seed failed: ${error.message}`);
  process.exitCode = 1;
});
