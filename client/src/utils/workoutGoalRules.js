export function getWorkoutGoalRules(goal) {
  const normalized = String(goal || "").toLowerCase();
  if (normalized.includes("maintain")) return { sets: [3, 4], reps: [10, 15] };
  if (normalized.includes("muscle") || normalized.includes("gain")) return { sets: [3, 4], reps: [8, 12] };
  if (normalized.includes("lose") || normalized.includes("loss")) return { sets: [3, 4], reps: [12, 15] };
  return { sets: [1, 6], reps: [3, 16] };
}

export function formatWorkoutGoalRules(goal) {
  const rules = getWorkoutGoalRules(goal);
  return `Sets ${rules.sets[0]}–${rules.sets[1]} · reps ${rules.reps[0]}–${rules.reps[1]}`;
}
