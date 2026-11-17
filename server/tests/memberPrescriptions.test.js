const test = require("node:test");
const assert = require("node:assert/strict");
const { buildMemberPrescriptions } = require("../utils/memberPrescriptions");

test("recommends today's scheduled exercises and a cautious progression from completed workout data", () => {
  const [member] = buildMemberPrescriptions([{
    fitness_goal: "Muscle Gain",
    today_workout_exercises: [{ exercise_name: "Squat", sets: 3, reps: 8 }],
    latest_completed_plan_name: "Lower Body",
    latest_completed_exercise_count: 4,
    latest_workout_exercise_count: 4,
    completed_last_week: 3,
    completed_previous_week: 2,
    latest_completed_at: null,
  }]);

  assert.deepEqual(member.today_workout_exercises, [{ exercise_name: "Squat", sets: 3, reps: 8 }]);
  assert.match(member.recommendations.intensity, /gradual progression/);
  assert.match(member.recommendations.recovery, /48 hours/);
  assert.equal("nutrition" in member.recommendations, false);
  assert.match(member.recommendations.previous_performance, /4 of 4 exercises/);
  assert.match(member.recommendations.previous_performance, /cannot be quantified/);
});

test("recommends reducing workload after a completion decline and does not invent an unscheduled workout", () => {
  const [member] = buildMemberPrescriptions([{
    fitness_goal: "Weight Loss",
    completed_last_week: 1,
    completed_previous_week: 3,
  }]);

  assert.deepEqual(member.today_workout_exercises, []);
  assert.match(member.recommendations.intensity, /Reduce intensity or volume/);
  assert.equal("nutrition" in member.recommendations, false);
  assert.match(member.recommendations.previous_performance, /No completed approved workout/);
});
