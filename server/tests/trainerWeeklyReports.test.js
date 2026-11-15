const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_NAME = process.env.DB_NAME || "avefit_test";
process.env.DB_USER = process.env.DB_USER || "avefit_test";
process.env.SMTP_HOST = "smtp.example.test";
process.env.SMTP_USER = "trainer-reports@example.test";
process.env.SMTP_PASS = "test-password";

const pool = require("../db");
const { sendWeeklyProgressReport } = require("../controllers/analyticsController");

const runReportRequest = async (params, expectedValues) => {
  const originalQuery = pool.query;
  let queryText = "";
  let queryValues = [];
  pool.query = async (query, values) => {
    queryText = query;
    queryValues = values;
    return { rows: [], rowCount: 0 };
  };

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
    await sendWeeklyProgressReport({
      params,
      trainer: { trainer_id: 7 },
    }, response);

    assert.match(queryText, /u\.trainer_id = \$2/);
    assert.deepEqual(queryValues, expectedValues);
    return response;
  } finally {
    pool.query = originalQuery;
  }
};

test("trainer cannot send a report to a member outside their assigned roster", async () => {
  const response = await runReportRequest({ userId: "42" }, [42, 7]);

  assert.equal(response.statusCode, 404);
});

test("bulk trainer reports query only members assigned to the authenticated trainer", async () => {
  const response = await runReportRequest({}, [null, 7]);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.member_count, 0);
});
