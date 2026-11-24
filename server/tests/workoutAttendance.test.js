const test = require("node:test");
const assert = require("node:assert/strict");
const { syncWorkoutAttendance } = require("../utils/workoutAttendance");

test("workout activity adds one attendance entry per member and day, but absent sessions do not", async () => {
  let queryText = "";
  const inserted = await syncWorkoutAttendance({
    async query(text) {
      queryText = text;
      return { rowCount: 2 };
    },
  });

  assert.match(queryText, /wp\.approval_status = 'Approved'/);
  assert.match(queryText, /ws\.started_at IS NOT NULL[\s\S]*OR ws\.completed_at IS NOT NULL[\s\S]*OR ws\.completed IS TRUE/);
  assert.match(queryText, /GROUP BY wp\.user_id, attendance_date/);
  assert.match(queryText, /ON CONFLICT \(user_id, attendance_date\) DO NOTHING/);
  assert.doesNotMatch(queryText, /status\s*=\s*'Absent'/);
  assert.equal(inserted, 2);
});
