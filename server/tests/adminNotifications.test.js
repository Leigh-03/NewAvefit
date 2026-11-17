const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db");
const { getNotifications, getUnreadCount } = require("../controllers/notificationController");

test("hides legacy membership-term notifications from admin notifications and unread counts", async (t) => {
  const originalQuery = pool.query;
  const queries = [];
  pool.query = async (text, values) => {
    queries.push({ text, values });
    return { rows: [{ count: "0" }] };
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
  const request = { notificationAudience: "admin", notificationRecipientId: 7 };

  await getNotifications(request, response);
  await getUnreadCount(request, response);

  assert.equal(queries.length, 2);
  for (const query of queries) {
    assert.match(query.text, /NOT \(audience_type = 'admin' AND notification_type = 'membership'\)/);
    assert.deepEqual(query.values, ["admin", 7]);
  }
});
