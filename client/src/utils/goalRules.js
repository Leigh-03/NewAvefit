export const GOALS = [
  { key: "Weight Loss", icon: "⬇️", desc: "Lose weight while staying within the healthy BMI range." },
  { key: "Maintain Weight", icon: "⚖️", desc: "Stay close to your current weight." },
  { key: "Gain Weight", icon: "💪", desc: "Gain weight while staying within the healthy BMI range." },
];

export const getNormalWeightRange = (heightCm) => {
  const heightMeters = Number(heightCm) / 100;
  if (!Number.isFinite(heightMeters) || heightMeters <= 0) return null;
  return {
    min: Math.ceil(18.5 * heightMeters ** 2),
    max: Math.floor(24.9 * heightMeters ** 2),
  };
};

export const getGoalRange = (goal, currentWeight, normalRange) => {
  if (goal === "Weight Loss") {
    const max = Math.min(normalRange.max, Math.ceil(currentWeight) - 1);
    return { min: normalRange.min, max: Math.max(normalRange.min, max) };
  }
  if (goal === "Gain Weight") {
    const min = Math.max(normalRange.min, Math.floor(currentWeight) + 1);
    return { min: Math.min(min, normalRange.max), max: normalRange.max };
  }
  const maintenanceWeight = Math.min(
    Math.max(Math.round(currentWeight), normalRange.min),
    normalRange.max
  );
  return { min: maintenanceWeight, max: maintenanceWeight };
};

export const getBmiCategory = (bmi) => {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
};

export const getRecommendedGoal = (bmiCategory) => (
  bmiCategory === "Underweight"
    ? "Gain Weight"
    : bmiCategory === "Overweight" || bmiCategory === "Obese"
      ? "Weight Loss"
      : "Maintain Weight"
);

export const getAvailableGoals = (bmiCategory) => (
  bmiCategory === "Underweight"
    ? new Set(["Gain Weight"])
    : bmiCategory === "Overweight" || bmiCategory === "Obese"
      ? new Set(["Weight Loss"])
      : new Set(GOALS.map(({ key }) => key))
);
