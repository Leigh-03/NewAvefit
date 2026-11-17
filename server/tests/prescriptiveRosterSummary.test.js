const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPrescriptiveRosterSummary, getStalledMembers } = require("../utils/prescriptiveRosterSummary");

test("summarizes the same active-roster signals used by prescriptive analytics", () => {
  const now = Date.UTC(2026, 10, 16);
  const summary = buildPrescriptiveRosterSummary([
    {
      fitness_goal: "Weight Loss",
      latest_weight: "80",
      previous_weight: "80.2",
      latest_log_date: new Date(now - 1 * 24 * 60 * 60 * 1000),
      previous_log_date: new Date(now - 20 * 24 * 60 * 60 * 1000),
      completed_last_two_weeks: 0,
      completed_previous_week: 4,
      completed_last_week: 3,
    },
    {
      fitness_goal: "Maintain Weight",
      latest_weight: "70",
      previous_weight: "71",
      latest_log_date: new Date(now - 2 * 24 * 60 * 60 * 1000),
      previous_log_date: new Date(now - 5 * 24 * 60 * 60 * 1000),
      completed_last_two_weeks: 2,
      completed_previous_week: 2,
      completed_last_week: 2,
    },
  ], now);

  assert.deepEqual(summary, {
    roster_size: 2,
    stalled_member_count: 1,
    inactive_member_count: 1,
    weight_loss_member_count: 1,
    previous_week_workout_count: 6,
    last_week_workout_count: 5,
  });
});

test("returns zeroed roster signal counts for an empty roster", () => {
  assert.deepEqual(buildPrescriptiveRosterSummary([], 0), {
    roster_size: 0,
    stalled_member_count: 0,
    inactive_member_count: 0,
    weight_loss_member_count: 0,
    previous_week_workout_count: 0,
    last_week_workout_count: 0,
  });
});

test("returns the exact members counted as possible progress stagnation", () => {
  const now = Date.UTC(2026, 10, 16);
  const stalledMember = {
    user_id: 7,
    latest_weight: "80",
    previous_weight: "80.2",
    latest_log_date: new Date(now - 1 * 24 * 60 * 60 * 1000),
    previous_log_date: new Date(now - 20 * 24 * 60 * 60 * 1000),
  };
  const notStalledMember = {
    user_id: 8,
    latest_weight: "70",
    previous_weight: "71",
    latest_log_date: new Date(now - 1 * 24 * 60 * 60 * 1000),
    previous_log_date: new Date(now - 20 * 24 * 60 * 60 * 1000),
  };

  assert.deepEqual(getStalledMembers([stalledMember, notStalledMember], now), [stalledMember]);
});
