const getWorkoutGoalRules = (goal) => {
  const normalized = String(goal || "").toLowerCase();
  if (normalized.includes("maintain")) {
    return { sets: [3, 4], reps: [10, 15], label: "Maintain Weight" };
  }
  if (normalized.includes("muscle") || normalized.includes("gain")) {
    return { sets: [3, 4], reps: [8, 12], label: "Gain Weight" };
  }
  if (normalized.includes("lose") || normalized.includes("loss")) {
    return { sets: [3, 4], reps: [12, 15], label: "Weight Loss" };
  }
  return null;
};

const isWorkoutDoseAllowed = (goal, sets, reps) => {
  const rules = getWorkoutGoalRules(goal);
  if (!rules) return true;
  return Number.isInteger(Number(sets))
    && Number(sets) >= rules.sets[0]
    && Number(sets) <= rules.sets[1]
    && Number.isInteger(Number(reps))
    && Number(reps) >= rules.reps[0]
    && Number(reps) <= rules.reps[1];
};

module.exports = { getWorkoutGoalRules, isWorkoutDoseAllowed };
