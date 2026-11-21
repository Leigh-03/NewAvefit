const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../db");
const { getAdminSystemHealth } = require("../controllers/adminSystemHealthController");

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

test("returns live service/database status, explicit backup state, and recent audit events", async (t) => {
  const originalQuery = db.query;
  db.query = async (text) => {
    if (text.includes("CURRENT_TIMESTAMP")) {
      return { rows: [{ checked_at: "2026-11-21T02:00:00.000Z" }] };
    }
    if (text.includes("FROM admin_audit_logs")) {
      return {
        rows: [{
          audit_id: 5,
          admin_id: 2,
          admin_name: "Administrator",
          event_type: "admin_action",
          request_method: "PUT",
          request_path: "/api/members/23/deactivate",
          status_code: 200,
          created_at: "2026-11-21T01:59:00.000Z",
        }],
      };
    }
    throw new Error("Unexpected system health query");
  };
  t.after(() => {
    db.query = originalQuery;
  });

  const response = createResponse();
  await getAdminSystemHealth({}, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.service.status, "healthy");
  assert.equal(response.body.data.database.status, "connected");
  assert.ok(Number.isInteger(response.body.data.database.pool.open));
  assert.ok(Number.isInteger(response.body.data.database.pool.idle));
  assert.ok(Number.isInteger(response.body.data.database.pool.waiting));
  assert.equal(response.body.data.backup.status, "not_configured");
  assert.equal(response.body.data.audit.events[0].request_path, "/api/members/23/deactivate");
});
