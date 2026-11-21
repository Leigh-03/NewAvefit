const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getCardioDurationRecommendation,
  getHighestInjuryPainLevel,
  isCardioExercise,
} = require("../utils/trainingPrograms");

test("returns standard cardio durations for experience and fitness goals", () => {
  assert.deepEqual(
    getCardioDurationRecommendation({
      experienceLevel: "Beginner",
      fitnessGoal: "Weight Loss",
      painLevel: 1,
    }),
    {
      status: "standard",
      min: 15,
      max: 20,
      recommended: 18,
      note: "Standard cardio duration for this experience level and fitness goal.",
    },
  );

  assert.deepEqual(
    getCardioDurationRecommendation({
      experienceLevel: "Advanced",
      fitnessGoal: "Gain Weight",
    }),
    {
      status: "standard",
      min: 10,
      max: 20,
      recommended: 15,
      note: "Standard cardio duration for this experience level and fitness goal.",
    },
  );
});

test("reduces duration for mild pain or recorded health restrictions", () => {
  const painModified = getCardioDurationRecommendation({
    experienceLevel: "Intermediate",
    fitnessGoal: "Weight Loss",
    painLevel: 4,
  });
  assert.equal(painModified.status, "modified");
  assert.equal(painModified.min, 15);
  assert.equal(painModified.max, 22);

  const healthModified = getCardioDurationRecommendation({
    experienceLevel: "Beginner",
    fitnessGoal: "Maintain Weight",
    hasHealthCondition: true,
  });
  assert.equal(healthModified.status, "modified");
  assert.equal(healthModified.min, 8);
  assert.equal(healthModified.max, 11);
});

test("blocks moderate-to-severe pain and identifies the highest pain level", () => {
  assert.equal(getHighestInjuryPainLevel({ knee: 3, back: 6 }), 6);

  const blocked = getCardioDurationRecommendation({
    experienceLevel: "Beginner",
    fitnessGoal: "Weight Loss",
    painLevel: 6,
  });
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.max, 0);

  const severe = getCardioDurationRecommendation({
    experienceLevel: "Advanced",
    fitnessGoal: "Maintain Weight",
    painLevel: 9,
  });
  assert.equal(severe.status, "stop");

  assert.equal(isCardioExercise({ category_name: "Cardio", muscle_group: "Cardio" }), true);
  assert.equal(isCardioExercise({ category_name: "Legs", muscle_group: "Legs" }), false);
});
