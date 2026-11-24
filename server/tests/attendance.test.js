const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db");
const {
  getUserAttendance,
  checkInUser,
  getTrainerMemberAttendance,
} = require("../controllers/attendanceController");

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

test("member attendance summary qualifies date columns and scopes visits to the member", async (t) => {
  const originalQuery = pool.query;
  let queryText = "";
  let queryValues = [];
  pool.query = async (text, values) => {
    queryText = text;
    queryValues = values;
    return {
      rows: [{
        total_visits: 0,
        visits_this_week: 0,
        visits_this_month: 0,
        checked_in_today: false,
        recent_visits: [],
      }],
    };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await getUserAttendance({ user: { user_id: 14 } }, response);

  assert.match(queryText, /LEFT JOIN gym_attendance ga ON ga\.user_id = \$1/);
  assert.match(queryText, /ga\.attendance_date >= DATE_TRUNC/);
  assert.match(queryText, /FROM gym_attendance_samples samples/);
  assert.match(queryText, /'is_simulated', recent\.is_simulated/);
  assert.match(queryText, /LIMIT 365/);
  assert.match(queryText, /GROUP BY manila_today\.attendance_date/);
  assert.deepEqual(queryValues, [14]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.checked_in_today, false);
});

test("gym check-in records a member once per Philippines calendar day", async (t) => {
  const originalQuery = pool.query;
  let queryText = "";
  let queryValues = [];
  pool.query = async (text, values) => {
    queryText = text;
    queryValues = values;
    return {
      rowCount: 1,
      rows: [{ attendance_date: "2026-11-24", checked_in_at: "2026-11-23T16:00:00.000Z" }],
    };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await checkInUser({ user: { user_id: 14 } }, response);

  assert.match(queryText, /ON CONFLICT \(user_id, attendance_date\)/);
  assert.match(queryText, /NOW\(\) AT TIME ZONE 'Asia\/Manila'/);
  assert.deepEqual(queryValues, [14]);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.attendance_date, "2026-11-24");
});

test("trainer cannot read attendance for a member outside their roster", async (t) => {
  const originalQuery = pool.query;
  let queryText = "";
  let queryValues = [];
  pool.query = async (text, values) => {
    queryText = text;
    queryValues = values;
    return { rowCount: 0, rows: [] };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await getTrainerMemberAttendance({
    params: { userId: "42" },
    trainer: { trainer_id: 7 },
  }, response);

  assert.match(queryText, /trainer_id = \$2/);
  assert.deepEqual(queryValues, [42, 7]);
  assert.equal(response.statusCode, 404);
});
