import test from "node:test";
import assert from "node:assert/strict";
import { getCardioSessionValues } from "./trainingPrograms.js";

test("cardio session values remain stable for blocked and stopped recommendations", () => {
  assert.deepEqual(
    getCardioSessionValues({ status: "blocked", recommended: 0 }),
    { sets: "", reps: "", duration_minutes: "" }
  );
  assert.deepEqual(
    getCardioSessionValues({ status: "stop", recommended: 0 }),
    { sets: "", reps: "", duration_minutes: "" }
  );
});

test("cardio session values use the recommended duration when exercise is allowed", () => {
  assert.deepEqual(
    getCardioSessionValues({ status: "modified", recommended: 13 }),
    { sets: "", reps: "", duration_minutes: "13" }
  );
});
