const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_NAME = process.env.DB_NAME || "avefit_test";
process.env.DB_USER = process.env.DB_USER || "avefit_test";

const pool = require("../db");
const { requestWorkoutPlan } = require("../controllers/userWorkoutController");
const { getExerciseLimitForExperience } = require("../utils/trainingPrograms");
const { createMyWorkoutPlan, updateMyWorkoutPlan } = require("../controllers/trainerController");

const requestWithExerciseCount = async (experienceLevel, exerciseCount) => {
  const originalConnect = pool.connect;
  const fakeClient = {
    async query(query) {
      if (query === "BEGIN" || query === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (query.includes("SELECT u.user_id")) {
        return {
          rows: [{
            activity_level: experienceLevel,
            trainer_id: null,
            trainer_email: null,
          }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected query in workout limit test: ${query}`);
    },
    release() {},
  };
  pool.connect = async () => fakeClient;

  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  try {
    await requestWorkoutPlan({
      body: {
        session_date: "2099-01-01",
        request_type: "keep_current_program",
        sessions: Array.from({ length: exerciseCount }, (_, index) => ({
          exercise_id: index + 1,
          sets: 1,
          reps: 6,
        })),
      },
      user: { user_id: 1 },
    }, response);
    return response;
  } finally {
    pool.connect = originalConnect;
  }
};

const createTrainerPlanWithExerciseCount = async (experienceLevel, exerciseCount) => {
  const originalConnect = pool.connect;
  const fakeClient = {
    async query(query) {
      if (query === "BEGIN" || query === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (query.includes("TO_CHAR((NOW() AT TIME ZONE")) {
        return { rows: [{ today: "2026-01-01" }], rowCount: 1 };
      }
      if (query.includes("FROM users")) {
        return {
          rows: [{
            activity_level: experienceLevel,
            membership_end_date: "2020-01-01",
          }],
          rowCount: 1,
        };
      }
      throw new Error(`Unexpected query in trainer workout limit test: ${query}`);
    },
    release() {},
  };
  pool.connect = async () => fakeClient;

  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  try {
    await createMyWorkoutPlan({
      trainer: { trainer_id: 1 },
      body: {
        user_id: 1,
        session_date: "2099-01-01",
        sessions: Array.from({ length: exerciseCount }, (_, index) => ({
          exercise_id: index + 1,
          sets: 1,
          reps: 6,
        })),
      },
    }, response);
    return response;
  } finally {
    pool.connect = originalConnect;
  }
};

const updateTrainerPlanWithExerciseCount = async (experienceLevel, exerciseCount) => {
  const originalConnect = pool.connect;
  const fakeClient = {
    async query(query) {
      if (query === "BEGIN" || query === "ROLLBACK") return { rows: [], rowCount: 0 };
      if (query.includes("SELECT wp.workout_plan_id, wp.user_id, wp.approval_status")) {
        return {
          rows: [{
            workout_plan_id: 1,
            user_id: 1,
            approval_status: "Approved",
            deletion_request_status: null,
            request_type: "coach_created",
            requested_session_date: "2099-01-01",
            training_program: "Legs",
          }],
          rowCount: 1,
        };
      }
      if (query.includes("SELECT session_id, session_date::text AS session_date")) {
        return { rows: [], rowCount: 0 };
      }
      if (query.includes("TO_CHAR((NOW() AT TIME ZONE")) {
        return { rows: [{ today: "2026-01-01" }], rowCount: 1 };
      }
      if (query.includes("SELECT user_id, first_name, last_name, email, activity_level")) {
        return {
          rows: [{
            activity_level: experienceLevel,
            workout_days_per_week: 0,
            injuries: [],
            health_conditions: [],
          }],
          rowCount: 1,
        };
      }
      if (query.includes("SELECT day_of_week, TO_CHAR(start_time")) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`Unexpected query in trainer workout update test: ${query}`);
    },
    release() {},
  };
  pool.connect = async () => fakeClient;

  const response = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  try {
    await updateMyWorkoutPlan({
      trainer: { trainer_id: 1 },
      params: { planId: "1" },
      body: {
        session_date: "2099-01-01",
        sessions: Array.from({ length: exerciseCount }, (_, index) => ({
          exercise_id: index + 1,
          sets: 1,
          reps: 6,
        })),
      },
    }, response);
    return response;
  } finally {
    pool.connect = originalConnect;
  }
};

test("workout requests enforce exercise limits by experience level", async () => {
  const limits = [
    { level: "Beginner", max: 6 },
    { level: "Intermediate", max: 8 },
    { level: "Advanced", max: 10 },
  ];

  for (const { level, max } of limits) {
    const atLimit = await requestWithExerciseCount(level, max);
    assert.equal(atLimit.body.message, "Choose an active coach before submitting a workout plan.");

    const overLimit = await requestWithExerciseCount(level, max + 1);
    assert.equal(overLimit.statusCode, 400);
    assert.equal(overLimit.body.message, `${level} workouts can include up to ${max} exercises.`);
  }
});

test("coach-created workout plans enforce the member's exercise limit", async () => {
  const limits = [
    { level: "Beginner", max: 6 },
    { level: "Intermediate", max: 8 },
    { level: "Advanced", max: 10 },
  ];

  for (const { level, max } of limits) {
    const atLimit = await createTrainerPlanWithExerciseCount(level, max);
    assert.equal(atLimit.body.message, "This member's membership has ended. Renew it before scheduling a workout plan.");

    const overLimit = await createTrainerPlanWithExerciseCount(level, max + 1);
    assert.equal(overLimit.statusCode, 400);
    assert.equal(overLimit.body.message, `${level} workouts can include up to ${max} exercises.`);
  }
});

test("updated coach workout plans enforce the member's exercise limit", async () => {
  const limits = [
    { level: "Beginner", max: 6 },
    { level: "Intermediate", max: 8 },
    { level: "Advanced", max: 10 },
  ];

  for (const { level, max } of limits) {
    const atLimit = await updateTrainerPlanWithExerciseCount(level, max);
    assert.match(atLimit.body.message, /users should select/);

    const overLimit = await updateTrainerPlanWithExerciseCount(level, max + 1);
    assert.equal(overLimit.statusCode, 400);
    assert.equal(overLimit.body.message, `${level} workouts can include up to ${max} exercises.`);
  }
});

test("exercise limits match the requested experience tiers", () => {
  assert.deepEqual(getExerciseLimitForExperience("Beginner"), { label: "Beginner", max: 6 });
  assert.deepEqual(getExerciseLimitForExperience("Intermediate"), { label: "Intermediate", max: 8 });
  assert.deepEqual(getExerciseLimitForExperience("Advanced"), { label: "Advanced", max: 10 });
  assert.deepEqual(getExerciseLimitForExperience("unknown"), { label: "Beginner", max: 6 });
});
