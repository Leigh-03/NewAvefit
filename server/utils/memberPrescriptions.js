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
      intensity,
      recovery: "Allow at least 48 hours before training the same muscle group. Use a rest or light-mobility day after demanding sessions, and adapt for soreness or reported injuries.",
      previous_performance: latestPerformance,
    },
  };
});

module.exports = { buildMemberPrescriptions };
