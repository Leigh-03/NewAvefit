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
    completed_last_two_weeks: 5,
    gym_visits_last_14_days: 4,
  }]);

  assert.deepEqual(member.today_workout_exercises, [{ exercise_name: "Squat", sets: 3, reps: 8 }]);
  assert.match(member.recommendations.intensity, /gradual progression/);
  assert.match(member.recommendations.goal_focus, /Muscle Gain.*3–4 sets and 8–12 reps/);
  assert.match(member.recommendations.performance_adjustment, /4 of 4 exercises/);
  assert.match(member.recommendations.performance_adjustment, /does not record load or effort/);
  assert.match(member.recommendations.recovery, /48 hours/);
  assert.match(member.recommendations.consistency_alerts[0], /No immediate workout consistency/);
  assert.match(member.recommendations.engagement_recommendation, /Recognize recent participation/);
  assert.equal("nutrition" in member.recommendations, false);
  assert.match(member.recommendations.previous_performance, /4 of 4 exercises/);
  assert.match(member.recommendations.previous_performance, /cannot be quantified/);
});

test("recommends reducing workload after a completion decline and does not invent an unscheduled workout", () => {
  const [member] = buildMemberPrescriptions([{
    fitness_goal: "Weight Loss",
    completed_last_week: 1,
    completed_previous_week: 3,
    completed_last_two_weeks: 4,
    gym_visits_last_14_days: 2,
  }]);

  assert.deepEqual(member.today_workout_exercises, []);
  assert.match(member.recommendations.intensity, /Reduce intensity or volume/);
  assert.match(member.recommendations.goal_focus, /Weight Loss.*3–4 sets and 12–15 reps/);
  assert.match(member.recommendations.performance_adjustment, /declined from 3 to 1/);
  assert.match(member.recommendations.consistency_alerts[0], /declined from 3 to 1/);
  assert.match(member.recommendations.engagement_recommendation, /Ask what made the routine harder/);
  assert.equal("nutrition" in member.recommendations, false);
  assert.match(member.recommendations.previous_performance, /No completed approved workout/);
});

test("recorded health restrictions take priority over general goal-based workout ranges", () => {
  const [member] = buildMemberPrescriptions([{
    fitness_goal: "Weight Loss",
    injuries: ["Knee"],
    health_conditions: [],
  }]);

  assert.match(member.recommendations.goal_focus, /Recorded health or injury restrictions take priority/);
});

test("flags low workout and gym attendance and suggests a manageable engagement plan", () => {
  const [member] = buildMemberPrescriptions([{
    completed_last_week: 0,
    completed_previous_week: 0,
    completed_last_two_weeks: 0,
    gym_visits_last_14_days: 0,
  }]);

  assert.match(member.recommendations.consistency_alerts[0], /No completed approved workout/);
  assert.match(member.recommendations.consistency_alerts[1], /No gym check-in/);
  assert.match(member.recommendations.engagement_recommendation, /small, repeatable weekly target/);
});
