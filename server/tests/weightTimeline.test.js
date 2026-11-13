const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateWeightTimeline } = require("../utils/weightTimeline");

test("weight-loss timeline uses body-weight rate and half-pace scenario", () => {
  const result = calculateWeightTimeline({
    goal: "Weight Loss",
    currentWeight: 80,
    targetWeight: 70,
    height: 175,
  });

  assert.equal(result.weekly_rate_kg, 0.4);
  assert.equal(result.weeks_needed_consistent, 25);
  assert.equal(result.weeks_needed_inconsistent, 50);
  assert.equal(result.months_needed_consistent, 5.8);
  assert.equal(result.months_needed_inconsistent, 11.5);
  assert.equal(result.predicted_bmi, (70 / (1.75 ** 2)).toFixed(2));
});

test("weight-gain timeline rounds its rate before calculating weeks", () => {
  const result = calculateWeightTimeline({
    goal: "Gain Weight",
    currentWeight: 60,
    targetWeight: 65,
    height: 170,
  });

  assert.equal(result.weekly_rate_kg, 0.15);
  assert.equal(result.slower_weekly_rate_kg, 0.075);
  assert.equal(result.weeks_needed_consistent, 34);
  assert.equal(result.weeks_needed_inconsistent, 67);
});

test("timeline respects the weight-loss and weight-gain rate caps", () => {
  const loss = calculateWeightTimeline({
    goal: "Weight Loss",
    currentWeight: 200,
    targetWeight: 190,
  });
  const gain = calculateWeightTimeline({
    goal: "Gain Weight",
    currentWeight: 200,
    targetWeight: 201,
  });

  assert.equal(loss.weekly_rate_kg, 1);
  assert.equal(gain.weekly_rate_kg, 0.45);
});

test("an already-reached target has a zero-week timeline", () => {
  const result = calculateWeightTimeline({
    goal: "Weight Loss",
    currentWeight: 70,
    targetWeight: 70,
  });

  assert.equal(result.mode, "at-target");
  assert.equal(result.weeks_needed_consistent, 0);
  assert.equal(result.weeks_needed_inconsistent, 0);
});
