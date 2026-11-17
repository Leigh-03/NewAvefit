const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db");
const { getTrainerPrescriptiveAnalytics } = require("../controllers/analyticsController");

test("selects BMI from the latest progress log for trainer prescriptive analytics", async (t) => {
  const originalQuery = pool.query;
  let queryText = "";
  pool.query = async (text) => {
    queryText = text;
    return { rows: [] };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

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

  await getTrainerPrescriptiveAnalytics({ trainer: { trainer_id: 1 } }, response);

  assert.equal(response.statusCode, 200);
  assert.match(queryText, /SELECT weight, bmi, log_date\s+FROM progress_logs/);
  assert.doesNotMatch(queryText, /u\.bmi/);
  assert.match(queryText, /latest_progress\.bmi[\s\S]*POWER\(u\.height \/ 100\.0, 2\)/);
});

test("includes affected member names and reasons in roster attention insights", async (t) => {
  const originalQuery = pool.query;
  const now = Date.now();
  pool.query = async () => ({
    rows: [
      {
        user_id: 7,
        first_name: "Casey",
        last_name: "Inactive",
        completed_last_two_weeks: 0,
        completed_previous_week: 0,
        completed_last_week: 0,
        latest_weight: null,
        previous_weight: null,
        latest_log_date: null,
        previous_log_date: null,
      },
      {
        user_id: 8,
        first_name: "Jordan",
        last_name: "Plateau",
        completed_last_two_weeks: 2,
        completed_previous_week: 2,
        completed_last_week: 2,
        latest_weight: "80",
        previous_weight: "80.2",
        latest_log_date: new Date(now - 1 * 24 * 60 * 60 * 1000),
        previous_log_date: new Date(now - 20 * 24 * 60 * 60 * 1000),
      },
    ],
  });
  t.after(() => {
    pool.query = originalQuery;
  });

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

  await getTrainerPrescriptiveAnalytics({ trainer: { trainer_id: 1 } }, response);

  assert.equal(response.statusCode, 200);
  const inactivity = response.body.data.insights.find((insight) => insight.title === "Consistency check-in needed");
  const stagnation = response.body.data.insights.find((insight) => insight.title === "Possible progress stagnation");
  assert.deepEqual(inactivity.members.map(({ user_id, first_name, last_name }) => ({ user_id, first_name, last_name })), [
    { user_id: 7, first_name: "Casey", last_name: "Inactive" },
  ]);
  assert.match(inactivity.members[0].detail, /past 14 days/);
  assert.deepEqual(stagnation.members.map(({ user_id, first_name, last_name }) => ({ user_id, first_name, last_name })), [
    { user_id: 8, first_name: "Jordan", last_name: "Plateau" },
  ]);
  assert.match(stagnation.members[0].detail, /0\.2 kg/);
});
