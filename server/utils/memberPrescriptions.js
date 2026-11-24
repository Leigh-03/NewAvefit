const { getWorkoutGoalRules } = require("./workoutGoalRules");

const getGoalWorkoutFocus = (member) => {
  const goal = String(member.fitness_goal || "").trim();
  if (!goal) {
    return "Set a fitness goal in your profile to tailor resistance-training volume and rep targets. Until then, follow your coach-approved balanced plan.";
  }

  const rules = getWorkoutGoalRules(goal);
  if (!rules) {
    return `For your ${goal} goal, keep a balanced full-body plan and progress gradually within your coach-approved schedule.`;
  }

  const focus = `For ${goal}, use ${rules.sets[0]}–${rules.sets[1]} sets and ${rules.reps[0]}–${rules.reps[1]} reps for resistance exercises in approved plans.`;
  const hasHealthRestrictions = [member.injuries, member.health_conditions]
    .some((items) => Array.isArray(items) ? items.length > 0 : Boolean(items));
  return hasHealthRestrictions
    ? `${focus} Recorded health or injury restrictions take priority; use conservative coach-approved options and review any concerns with a healthcare professional.`
    : `${focus} Choose suitable movements and progress gradually while maintaining good form.`;
};

const getPerformanceAdjustment = (member) => {
  const completedThisWeek = Number(member.completed_last_week) || 0;
  const completedPreviousWeek = Number(member.completed_previous_week) || 0;
  const latestWorkoutCompleted = Number(member.latest_completed_exercise_count) || 0;
  const latestWorkoutExercises = Number(member.latest_workout_exercise_count) || 0;

  if (completedPreviousWeek > 0 && completedThisWeek < completedPreviousWeek) {
    return `Approved session completions declined from ${completedPreviousWeek} to ${completedThisWeek} over the last two weeks. Keep the next plan manageable and check for schedule or recovery barriers before adding volume.`;
  }
  if (latestWorkoutExercises > 0 && latestWorkoutCompleted === latestWorkoutExercises) {
    return `The latest completed plan recorded ${latestWorkoutCompleted} of ${latestWorkoutExercises} exercises. Maintain the current plan or progress one variable gradually after confirming good form and recovery; completion history does not record load or effort.`;
  }
  if (latestWorkoutExercises > 0) {
    return `The latest completed plan recorded ${latestWorkoutCompleted} of ${latestWorkoutExercises} exercises. Keep the movement selection familiar and adjust session volume or scheduling to support consistent completion before progressing.`;
  }
  return "There is no completed approved workout to use as a performance baseline yet. Start with a manageable coach-approved plan and review the recorded results before progressing.";
};

const getConsistencyAlerts = (member) => {
  const alerts = [];
  const hasWorkoutActivityWindow = member.completed_last_two_weeks !== null
    && member.completed_last_two_weeks !== undefined;
  const hasAttendanceActivityWindow = member.gym_visits_last_14_days !== null
    && member.gym_visits_last_14_days !== undefined;

  if (hasWorkoutActivityWindow && Number(member.completed_last_two_weeks) === 0) {
    alerts.push("No completed approved workout has been recorded in the past 14 days.");
  } else if (
    Number(member.completed_previous_week) > 0
    && Number(member.completed_last_week) < Number(member.completed_previous_week)
  ) {
    alerts.push(`Workout completions declined from ${Number(member.completed_previous_week)} to ${Number(member.completed_last_week)} week over week.`);
  }

  if (hasAttendanceActivityWindow && Number(member.gym_visits_last_14_days) === 0) {
    alerts.push("No gym check-in has been recorded in the past 14 days.");
  }

  return alerts.length ? alerts : ["No immediate workout consistency or gym check-in concerns were detected in the recent activity records."];
};

const getEngagementRecommendation = (member) => {
  const noRecentWorkouts = member.completed_last_two_weeks !== null
    && member.completed_last_two_weeks !== undefined
    && Number(member.completed_last_two_weeks) === 0;
  const noRecentVisits = member.gym_visits_last_14_days !== null
    && member.gym_visits_last_14_days !== undefined
    && Number(member.gym_visits_last_14_days) === 0;

  if (noRecentWorkouts || noRecentVisits) {
    return "Check in supportively to learn about schedule, motivation, or recovery barriers. Agree on a small, repeatable weekly target using an approved plan, and remind the member to check in at the gym.";
  }
  if (
    Number(member.completed_previous_week) > 0
    && Number(member.completed_last_week) < Number(member.completed_previous_week)
  ) {
    return "Ask what made the routine harder to follow, then adjust session length or timing together before increasing training demands.";
  }
  return "Recognize recent participation and agree on a realistic weekly routine that fits the member’s preferred schedule.";
};

const buildMemberPrescriptions = (members) => members.map((member) => {
  const completedThisWeek = Number(member.completed_last_week) || 0;
  const completedPreviousWeek = Number(member.completed_previous_week) || 0;
  const latestWorkoutCompleted = Number(member.latest_completed_exercise_count) || 0;
  const latestWorkoutExercises = Number(member.latest_workout_exercise_count) || 0;
  const exercises = Array.isArray(member.today_workout_exercises)
    ? member.today_workout_exercises
    : [];

  let intensity;
  if (completedPreviousWeek > 0 && completedThisWeek < completedPreviousWeek) {
    intensity = `Reduce intensity or volume temporarily and check for fatigue, pain, or schedule barriers; completions declined from ${completedPreviousWeek} to ${completedThisWeek} week over week.`;
  } else if (latestWorkoutExercises > 0 && latestWorkoutCompleted === latestWorkoutExercises) {
    intensity = "A small, gradual progression may be appropriate after confirming good form, recovery, and no pain. The available data does not include load or effort, so avoid automatic increases.";
  } else {
    intensity = "Maintain a manageable intensity and prioritize completing the current plan; there is not enough recent performance evidence to justify an increase.";
  }

  const latestPerformance = member.latest_completed_plan_name
    ? `${member.latest_completed_plan_name}: ${latestWorkoutCompleted} of ${latestWorkoutExercises} exercises were marked complete${member.latest_completed_at ? ` (${new Date(member.latest_completed_at).toLocaleDateString()})` : ""}. Set-level load and repetition results are not recorded, so strength improvement cannot be quantified from this history alone.`
    : "No completed approved workout is available as a performance baseline yet.";

  return {
    ...member,
    today_workout_exercises: exercises,
    recommendations: {
      goal_focus: getGoalWorkoutFocus(member),
      intensity,
      performance_adjustment: getPerformanceAdjustment(member),
      consistency_alerts: getConsistencyAlerts(member),
      engagement_recommendation: getEngagementRecommendation(member),
      recovery: "Allow at least 48 hours before training the same muscle group. Use a rest or light-mobility day after demanding sessions, and adapt for soreness or reported injuries.",
      previous_performance: latestPerformance,
    },
  };
});

module.exports = { buildMemberPrescriptions };
