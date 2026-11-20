const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db");
const { deactivateMember } = require("../controllers/memberController");

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

test("deactivates an active member, invalidates their sessions, and notifies them", async (t) => {
  const originalQuery = pool.query;
  const queries = [];
  pool.query = async (text, values) => {
    queries.push({ text, values });
    if (text.includes("UPDATE users")) {
      return {
        rows: [{
          user_id: 23,
          account_status: "Inactive",
          first_name: "Casey",
          last_name: "Member",
          email: "casey@example.test",
        }],
      };
    }
    return { rows: [] };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await deactivateMember({ params: { id: "23" } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.member.account_status, "Inactive");
  assert.match(queries[0].text, /token_version = token_version \+ 1/);
  assert.match(queries[0].text, /account_status, 'pending'\)\) = 'active'/);
  assert.ok(queries.some(({ text }) => text.includes("UPDATE members SET status = 'Inactive'")));
  const notification = queries.find(({ text }) => text.includes("INSERT INTO app_notifications"));
  assert.ok(notification);
  assert.equal(notification.values[1], 23);
  assert.match(notification.values[2], /deactivated/);
});

test("does not change a member whose account is not active", async (t) => {
  const originalQuery = pool.query;
  let updateCount = 0;
  pool.query = async (text) => {
    if (text.includes("UPDATE users")) {
      updateCount += 1;
      return { rows: [] };
    }
    return { rows: [{ account_status: "Pending" }] };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await deactivateMember({ params: { id: "23" } }, response);

  assert.equal(response.statusCode, 409);
  assert.equal(updateCount, 1);
  assert.match(response.body.message, /Only an active member account/);
});

test("returns 404 when the member does not exist", async (t) => {
  const originalQuery = pool.query;
  pool.query = async () => ({ rows: [] });
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await deactivateMember({ params: { id: "23" } }, response);

  assert.equal(response.statusCode, 404);
  assert.match(response.body.message, /Member not found/);
});

test("rejects an invalid member ID without querying the database", async (t) => {
  const originalQuery = pool.query;
  let queryCount = 0;
  pool.query = async () => {
    queryCount += 1;
    return { rows: [] };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await deactivateMember({ params: { id: "invalid" } }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(queryCount, 0);
});
