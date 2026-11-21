const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const db = require("../db");
const auditAdminActivity = require("../middleware/adminAuditMiddleware");

const runAuditMiddleware = (request, statusCode = 200) => new Promise((resolve) => {
  const response = new EventEmitter();
  response.statusCode = statusCode;
  auditAdminActivity(request, response, () => {
    response.emit("finish");
    setImmediate(resolve);
  });
});

test("records authenticated admin changes without request query data", async (t) => {
  const originalQuery = db.query;
  const queries = [];
  db.query = async (text, values) => {
    queries.push({ text, values });
    return { rows: [] };
  };
  t.after(() => {
    db.query = originalQuery;
  });

  await runAuditMiddleware({
    method: "PUT",
    originalUrl: "/api/members/23/deactivate?secret=ignored",
    admin: { admin_id: 7 },
  }, 200);

  assert.equal(queries.length, 1);
  assert.match(queries[0].text, /INSERT INTO admin_audit_logs/);
  assert.deepEqual(queries[0].values, [
    7,
    "admin_action",
    "PUT",
    "/api/members/23/deactivate",
    200,
  ]);
});

test("records failed admin sign-ins without retaining submitted credentials", async (t) => {
  const originalQuery = db.query;
  const queries = [];
  db.query = async (text, values) => {
    queries.push({ text, values });
    return { rows: [] };
  };
  t.after(() => {
    db.query = originalQuery;
  });

  await runAuditMiddleware({
    method: "POST",
    originalUrl: "/api/admin/login",
    body: { email: "admin@example.test", password: "not-stored" },
  }, 401);

  assert.equal(queries.length, 1);
  assert.equal(queries[0].values[1], "admin_login");
  assert.equal(queries[0].values[4], 401);
  assert.equal(queries[0].values.includes("not-stored"), false);
  assert.equal(queries[0].values.includes("admin@example.test"), false);
});

test("does not record read-only admin requests", async (t) => {
  const originalQuery = db.query;
  let queryCount = 0;
  db.query = async () => {
    queryCount += 1;
    return { rows: [] };
  };
  t.after(() => {
    db.query = originalQuery;
  });

  await runAuditMiddleware({
    method: "GET",
    originalUrl: "/api/members",
    admin: { admin_id: 7 },
  });

  assert.equal(queryCount, 0);
});
