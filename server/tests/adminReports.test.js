const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db");
const { getAdminReports } = require("../controllers/adminReportsController");

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

test("rejects malformed, reversed, and overlong report ranges without querying the database", async (t) => {
  const originalQuery = pool.query;
  let queryCount = 0;
  pool.query = async () => {
    queryCount += 1;
    return { rows: [] };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const invalidRanges = [
    ["2026-02-30", "2026-03-01"],
    ["2026-03-02", "2026-03-01"],
    ["2025-01-01", "2026-01-02"],
  ];
  for (const [start_date, end_date] of invalidRanges) {
    const response = createResponse();
    await getAdminReports({ query: { type: "operational", start_date, end_date } }, response);
    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /valid date range/);
  }
  assert.equal(queryCount, 0);
});

test("returns operational report sections using the selected date range", async (t) => {
  const originalQuery = pool.query;
  const queryCalls = [];
  pool.query = async (text, values) => {
    queryCalls.push({ text, values });
    if (text.includes("AS active_accounts")) {
      return { rows: [{ active_accounts: 5, pending_accounts: 2, memberships_ending: 1, completed_workouts: 8 }] };
    }
    if (text.includes("AS joined_date")) return { rows: [{ user_id: 3, member_name: "A Member" }] };
    if (text.includes("u.membership_start_date")) return { rows: [{ user_id: 4, member_name: "B Member" }] };
    if (text.includes("AS completed_date")) return { rows: [{ session_id: 9, member_name: "C Member" }] };
    throw new Error("Unexpected operational report query");
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await getAdminReports({
    query: { type: "operational", start_date: "2026-11-01", end_date: "2026-11-18" },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.type, "operational");
  assert.deepEqual(response.body.data.period, { start_date: "2026-11-01", end_date: "2026-11-18" });
  assert.equal(response.body.data.summary.active_accounts, 5);
  assert.equal(response.body.data.registrations.length, 1);
  assert.equal(response.body.data.memberships_ending.length, 1);
  assert.equal(response.body.data.completed_workouts.length, 1);
  assert.equal(queryCalls.length, 4);
  assert.ok(queryCalls.every(({ values }) => values[0] === "2026-11-01" && values[1] === "2026-11-18"));
  assert.match(queryCalls[0].text, /membership_end_date BETWEEN \$1::date AND \$2::date/);
  assert.match(queryCalls[3].text, /ws\.completed IS TRUE/);
});

test("returns statistical trends and trainer workload with date-filtered completion counts", async (t) => {
  const originalQuery = pool.query;
  const queryCalls = [];
  pool.query = async (text, values) => {
    queryCalls.push({ text, values });
    if (text.includes("WITH periods")) {
      return { rows: [{ period: "Nov 2026", registrations: 4, completed_workouts: 12 }] };
    }
    if (text.includes("FROM trainers t")) {
      return { rows: [{ trainer_id: 2, trainer_name: "Trainer One", active_members: 6, completed_workouts: 5 }] };
    }
    throw new Error("Unexpected statistical report query");
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await getAdminReports({
    query: { type: "statistical", start_date: "2026-11-01", end_date: "2026-11-18" },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.type, "statistical");
  assert.equal(response.body.data.monthly_trends[0].registrations, 4);
  assert.equal(response.body.data.trainer_workload[0].active_members, 6);
  assert.equal(queryCalls.length, 2);
  assert.ok(queryCalls.every(({ values }) => values[0] === "2026-11-01" && values[1] === "2026-11-18"));
  assert.match(queryCalls[0].text, /GENERATE_SERIES/);
  assert.match(queryCalls[1].text, /COUNT\(DISTINCT ws\.session_id\)/);
});

test("rejects unsupported report types", async () => {
  const response = createResponse();
  await getAdminReports({
    query: { type: "private", start_date: "2026-11-01", end_date: "2026-11-18" },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /operational or statistical/);
});
