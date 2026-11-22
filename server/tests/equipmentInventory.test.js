const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db");
const { createEquipment } = require("../controllers/workoutController");

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

test("rejects equipment status counts that do not equal the total quantity", async (t) => {
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
  await createEquipment({
    body: {
      equipment_name: "Elliptical Machine",
      quantity: 2,
      in_service_count: 1,
      under_maintenance_count: 0,
      needs_replacement_count: 0,
      needs_inspection_count: 0,
    },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.message, /add up to the total quantity/);
  assert.equal(queryCount, 0);
});

test("persists separate equipment-unit counts for each status", async (t) => {
  const originalQuery = pool.query;
  let savedValues;
  pool.query = async (text, values) => {
    assert.match(text, /in_service_count, under_maintenance_count, needs_replacement_count, needs_inspection_count/);
    savedValues = values;
    return {
      rowCount: 1,
      rows: [{
        equipment_id: 1,
        equipment_name: "Elliptical Machine",
        quantity: 2,
        status: "Needs replacement",
        in_service_count: 1,
        under_maintenance_count: 0,
        needs_replacement_count: 1,
        needs_inspection_count: 0,
      }],
    };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const response = createResponse();
  await createEquipment({
    body: {
      equipment_name: "Elliptical Machine",
      quantity: 2,
      in_service_count: 1,
      under_maintenance_count: 0,
      needs_replacement_count: 1,
      needs_inspection_count: 0,
    },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.deepEqual(savedValues.slice(5), [1, 0, 1, 0]);
  assert.equal(response.body.data.needs_replacement_count, 1);
  assert.equal(response.body.data.in_service_count, 1);
});
