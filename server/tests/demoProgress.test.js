const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SYNTHETIC_PROGRESS_NOTE_PREFIX,
  getWeeklyDateKeys,
  buildSyntheticProgressEntries,
} = require("../utils/demoProgress");

test("weekly history starts in April, includes today, and stays within the requested range", () => {
  const dates = getWeeklyDateKeys("2026-04-01", "2026-11-16");

  assert.equal(dates[0], "2026-04-01");
  assert.equal(dates[dates.length - 1], "2026-11-16");
  assert.equal(dates.length, 34);
  assert.equal(dates.filter((date) => date === "2026-11-16").length, 1);
});

test("synthetic weight-loss history trends down and includes detailed measurements", () => {
  const entries = buildSyntheticProgressEntries({
    height: 175,
    goal: "Weight Loss",
    endWeight: 80,
    startDate: "2026-04-01",
    endDate: "2026-04-15",
  });

  assert.equal(entries.length, 3);
  assert.ok(entries[0].weight > entries[entries.length - 1].weight);
  assert.equal(entries[entries.length - 1].weight, 80);
  assert.ok(entries.every((entry) => Number.isFinite(entry.bmi)));
  assert.ok(entries.every((entry) => Number.isFinite(entry.body_fat)));
  assert.ok(entries.every((entry) => Number.isFinite(entry.waist)));
  assert.ok(entries.every((entry) => entry.notes.startsWith(SYNTHETIC_PROGRESS_NOTE_PREFIX)));
});

test("weekly history rejects invalid or reversed date ranges", () => {
  assert.throws(() => getWeeklyDateKeys("2026-02-30", "2026-03-01"), /Invalid date/);
  assert.throws(() => getWeeklyDateKeys("2026-04-02", "2026-04-01"), /on or before/);
});
