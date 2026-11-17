const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../db");
const { getAdminSidebarCounts } = require("../controllers/adminController");

test("returns admin attention counts from the authenticated admin's records", async (t) => {
  const originalQuery = db.query;
  let queryText;
  let queryValues;
  db.query = async (text, values) => {
    queryText = text;
    queryValues = values;
    return {
      rows: [{
        members: "7",
        trainers: "2",
        equipment: "4",
        notifications: "3",
      }],
    };
  };
  t.after(() => {
    db.query = originalQuery;
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
  await getAdminSidebarCounts({ admin: { admin_id: 19 } }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    success: true,
    data: {
      members: 7,
      trainers: 2,
      equipment: 4,
      notifications: 3,
    },
  });
  assert.match(queryText, /user_profile_change_requests/);
  assert.match(queryText, /user_membership_term_requests/);
  assert.match(queryText, /equipment_inventory/);
  assert.match(queryText, /app_notifications/);
  assert.deepEqual(queryValues, [19]);
});
