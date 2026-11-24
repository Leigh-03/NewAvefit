const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db");
const { startWorkoutSession } = require("../controllers/userWorkoutController");

const createResponse = () => ({
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
});

test("a workout that is already started cannot start again", async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({
    rowCount: 1,
    rows: [{
      session_id: 9,
      workout_plan_id: 3,
      started_at: "2026-11-21T06:00:00.000Z",
      completed: false,
      deletion_request_status: null,
      scheduled_today: true,
    }],
  });
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await startWorkoutSession({
    params: { id: "9" },
    user: { user_id: 14 },
  }, response);

  assert.equal(response.statusCode, 409);
  assert.match(response.body.message, /already started|already active/i);
});

test("a completed workout cannot be started again", async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({
    rowCount: 1,
    rows: [{
      session_id: 9,
      workout_plan_id: 3,
      started_at: "2026-11-21T06:00:00.000Z",
      completed: true,
      deletion_request_status: null,
      scheduled_today: true,
    }],
  });
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await startWorkoutSession({
    params: { id: "9" },
    user: { user_id: 14 },
  }, response);

  assert.equal(response.statusCode, 409);
  assert.match(response.body.message, /already complete/i);
});

test("starting a session is blocked when another session in the plan is active", async (t) => {
  const originalQuery = pool.query;
  let updateQueryCount = 0;
  pool.query = async (text) => {
    if (text.includes("SELECT ws.session_id, ws.session_date")) {
      return {
        rowCount: 1,
        rows: [{
          session_id: 10,
          workout_plan_id: 3,
          started_at: null,
          completed: false,
          deletion_request_status: null,
          scheduled_today: true,
        }],
      };
    }
    if (text.includes("UPDATE workout_sessions ws")) {
      updateQueryCount += 1;
      assert.match(text, /NOT EXISTS/);
      assert.match(text, /EXISTS[\s\S]*FROM gym_attendance/);
      return { rowCount: 0, rows: [] };
    }
    if (text.includes("FROM gym_attendance")) {
      return { rowCount: 1, rows: [{}] };
    }
    throw new Error("Unexpected workout-start query");
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await startWorkoutSession({
    params: { id: "10" },
    user: { user_id: 14 },
  }, response);

  assert.equal(updateQueryCount, 1);
  assert.equal(response.statusCode, 409);
  assert.match(response.body.message, /Another workout is already active/i);
});

test("a workout cannot start until the member checks in for the day", async (t) => {
  const originalQuery = pool.query;
  let updateQueryCount = 0;
  pool.query = async (text) => {
    if (text.includes("SELECT ws.session_id, ws.session_date")) {
      return {
        rowCount: 1,
        rows: [{
          session_id: 11,
          workout_plan_id: 3,
          started_at: null,
          completed: false,
          deletion_request_status: null,
          scheduled_today: true,
        }],
      };
    }
    if (text.includes("FROM gym_attendance")) {
      return { rowCount: 0, rows: [] };
    }
    if (text.includes("UPDATE workout_sessions ws")) {
      updateQueryCount += 1;
    }
    throw new Error("Unexpected workout-start query");
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await startWorkoutSession({
    params: { id: "11" },
    user: { user_id: 14 },
  }, response);

  assert.equal(updateQueryCount, 0);
  assert.equal(response.statusCode, 409);
  assert.match(response.body.message, /check in at the gym/i);
});
