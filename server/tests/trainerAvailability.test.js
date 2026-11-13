const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_NAME = process.env.DB_NAME || "avefit_test";
process.env.DB_USER = process.env.DB_USER || "avefit_test";

const pool = require("../db");
const { getForAdmin } = require("../controllers/trainerAvailabilityController");

test("admin availability includes assigned members whose schedule overlaps each trainer slot", async () => {
  const originalQuery = pool.query;
  const availabilitySlots = [{
    availability_id: 3,
    trainer_id: 8,
    day_of_week: 1,
    start_time: "06:00",
    end_time: "12:00",
    member_limit: 5,
    assigned_member_count: 1,
    assigned_members: [{ user_id: 12, full_name: "Alex Member" }],
  }];
  let availabilityQuery = "";

  pool.query = async (query) => {
    if (query.includes("SELECT trainer_id FROM trainers")) {
      return { rows: [{ trainer_id: 8 }], rowCount: 1 };
    }
    availabilityQuery = query;
    return { rows: availabilitySlots, rowCount: availabilitySlots.length };
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
    await getForAdmin({ params: { id: "8" } }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.data[0].assigned_members, availabilitySlots[0].assigned_members);
    assert.match(availabilityQuery, /JOIN user_workout_availability member_slot/);
    assert.match(availabilityQuery, /member_slot\.start_time < ta\.end_time/);
    assert.match(availabilityQuery, /member_slot\.end_time > ta\.start_time/);
  } finally {
    pool.query = originalQuery;
  }
});
