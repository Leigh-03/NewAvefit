const test = require("node:test");
const assert = require("node:assert/strict");
const serverRules = require("../utils/trainingPrograms");

test("cardio exercises are available in every workout program for member and coach flows", () => {
  const exercises = [
    { category_name: "Cardio", muscle_group: "Cardio" },
    { category_name: "Conditioning", muscle_group: "Cardio" },
  ];
  for (const exercise of exercises) {
    for (const program of ["Upper", "Lower", "Push", "Pull", "Legs", "Chest & Back", "Shoulders & Arms", "Full Body"]) {
      assert.equal(serverRules.exerciseMatchesProgram(exercise, program), true);
    }
  }
});
