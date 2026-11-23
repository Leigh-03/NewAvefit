const test = require("node:test");
const assert = require("node:assert/strict");
const { isCoachAtCapacity } = require("../utils/coachAssignment");

test("coach can accept members while assigned count is below the max", () => {
  assert.equal(isCoachAtCapacity(14, 15), false);
});

test("coach cannot accept members when assigned count reaches or exceeds the max", () => {
  assert.equal(isCoachAtCapacity(15, 15), true);
  assert.equal(isCoachAtCapacity(16, 15), true);
});

test("a missing or zero max capacity remains uncapped", () => {
  assert.equal(isCoachAtCapacity(15, 0), false);
});
