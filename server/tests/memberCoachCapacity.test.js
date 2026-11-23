const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_NAME = process.env.DB_NAME || "avefit_test";
process.env.DB_USER = process.env.DB_USER || "avefit_test";

const pool = require("../db");
const { assignTrainer } = require("../controllers/memberController");

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

const stubConnection = ({ memberTrainerId, assignedCount }) => {
  const queries = [];
  return {
    queries,
    client: {
      async query(query) {
        const sql = String(query);
        queries.push(sql);
        if (sql.includes("FROM users u") && sql.includes("FOR UPDATE")) {
          return {
            rows: [{
              user_id: 101,
              trainer_id: memberTrainerId,
              first_name: "Test",
              last_name: "Member",
              email: null,
              preferred_days: [],
              preferred_workout_time: null,
              workout_days_per_week: 3,
              workout_duration: 60,
            }],
          };
        }
        if (sql.includes("FROM user_workout_availability")) return { rows: [] };
        if (sql.includes("FROM trainers")) {
          return {
            rows: [{
              trainer_id: 8,
              full_name: "Coach",
              email: null,
              status: "Active",
              max_members: 15,
            }],
          };
        }
        if (sql.includes("SELECT COUNT(*)::integer AS count FROM users WHERE trainer_id = $1")) {
          return { rows: [{ count: assignedCount }] };
        }
        if (sql.includes("UPDATE users")) {
          return { rows: [{ user_id: 101, trainer_id: 8 }] };
        }
        return { rows: [] };
      },
      release() {},
    },
  };
};

test("admin assignment rejects a new member when the coach has reached max capacity", async () => {
  const originalConnect = pool.connect;
  const connection = stubConnection({ memberTrainerId: null, assignedCount: 15 });
  pool.connect = async () => connection.client;
  const response = createResponse();

  try {
    await assignTrainer({ params: { id: "101" }, body: { trainer_id: "8" } }, response);

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.message, "This coach has reached their total member capacity. Choose another coach.");
    assert.ok(connection.queries.includes("ROLLBACK"));
    assert.equal(connection.queries.some((query) => query.includes("UPDATE users")), false);
  } finally {
    pool.connect = originalConnect;
  }
});

test("a member already assigned to a full coach can keep that assignment", async () => {
  const originalConnect = pool.connect;
  const connection = stubConnection({ memberTrainerId: 8, assignedCount: 15 });
  pool.connect = async () => connection.client;
  const response = createResponse();

  try {
    await assignTrainer({ params: { id: "101" }, body: { trainer_id: "8" } }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.message, "Trainer assigned successfully");
    assert.ok(connection.queries.includes("COMMIT"));
    assert.equal(connection.queries.some((query) => query.includes("SELECT COUNT(*)::integer AS count FROM users WHERE trainer_id = $1")), false);
  } finally {
    pool.connect = originalConnect;
  }
});
