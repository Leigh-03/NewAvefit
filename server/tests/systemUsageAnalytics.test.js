const test = require("node:test");
const assert = require("node:assert/strict");
const pool = require("../db");
const { getSystemUsageMonitoring } = require("../controllers/analyticsController");

test("returns real attendance and member activity usage metrics for the last 30 days", async (t) => {
  const originalQuery = pool.query;
  let queryText = "";
  pool.query = async (text) => {
    queryText = text;
    return {
      rows: [{
        label: "Nov 24",
        activity_date: "2026-11-24",
        gym_check_ins: 8,
        workout_starts: 5,
        active_members: 7,
        total_gym_check_ins: 42,
        total_workout_starts: 26,
        total_active_members: 13,
      }],
    };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const result = await getSystemUsageMonitoring();

  assert.deepEqual(result.summary, {
    gymCheckIns: 42,
    workoutStarts: 26,
    activeMembers: 13,
  });
  assert.deepEqual(result.daily, [{
    date: "2026-11-24",
    label: "Nov 24",
    gymCheckIns: 8,
    workoutStarts: 5,
    activeMembers: 7,
  }]);
  assert.match(queryText, /GENERATE_SERIES/);
  assert.match(queryText, /FROM gym_attendance/);
  assert.match(queryText, /FROM workout_sessions/);
  assert.match(queryText, /AT TIME ZONE 'Asia\/Manila'/);
  assert.doesNotMatch(queryText, /gym_attendance_samples/);
});
