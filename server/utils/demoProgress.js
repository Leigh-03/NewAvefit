const SYNTHETIC_PROGRESS_NOTE_PREFIX = "Synthetic demo check-in:";
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const round = (value, places = 1) => Number(value.toFixed(places));

const parseDateKey = (dateKey) => {
  if (!DATE_KEY_PATTERN.test(dateKey)) {
    throw new Error(`Invalid date: ${dateKey}`);
  }
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (date.toISOString().slice(0, 10) !== dateKey) {
    throw new Error(`Invalid date: ${dateKey}`);
  }
  return date;
};

const getWeeklyDateKeys = (startDate, endDate) => {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (start > end) throw new Error("The start date must be on or before the end date.");

  const dates = [];
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 7)) {
    dates.push(date.toISOString().slice(0, 10));
  }
  if (dates[dates.length - 1] !== endDate) dates.push(endDate);
  return dates;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const buildSyntheticProgressEntries = ({ height, goal, endWeight, startDate, endDate }) => {
  const heightCm = Number(height);
  const finalWeight = Number(endWeight);
  if (!Number.isFinite(heightCm) || heightCm <= 0) {
    throw new Error("The account needs a valid height to generate BMI history.");
  }
  if (!Number.isFinite(finalWeight) || finalWeight < 20 || finalWeight > 200) {
    throw new Error("The account needs a valid weight between 20 kg and 200 kg.");
  }

  const dates = getWeeklyDateKeys(startDate, endDate);
  const normalizedGoal = String(goal || "").trim().toLowerCase();
  const weeklyChange = normalizedGoal === "weight loss"
    ? -0.3
    : ["gain weight", "muscle gain"].includes(normalizedGoal)
      ? 0.15
      : 0;
  const weekCount = dates.length - 1;
  const initialWeight = finalWeight - weeklyChange * weekCount;
  const finalBmi = finalWeight / ((heightCm / 100) ** 2);
  const finalBodyFat = clamp(10 + (finalBmi - 18.5) * 0.4, 12, 45);
  const finalWaist = heightCm * 0.72 + Math.max(finalBmi - 25, 0) * 0.35;
  const finalChest = heightCm * 0.58;
  const finalHips = heightCm * 0.63 + Math.max(finalBmi - 25, 0) * 0.25;
  const finalArm = heightCm * 0.18 + Math.max(finalBmi - 25, 0) * 0.04;
  const finalLeg = heightCm * 0.29 + Math.max(finalBmi - 25, 0) * 0.08;

  return dates.map((logDate, index) => {
    const fraction = weekCount ? index / weekCount : 1;
    const weight = index === dates.length - 1
      ? finalWeight
      : initialWeight + (finalWeight - initialWeight) * fraction
        + Math.sin((index + 1) * 1.7) * Math.sin(Math.PI * fraction) * 0.15;
    const bmi = weight / ((heightCm / 100) ** 2);
    const weightDifference = weight - finalWeight;

    return {
      log_date: logDate,
      weight: round(weight),
      bmi: round(bmi, 2),
      body_fat: round(clamp(finalBodyFat + (normalizedGoal === "weight loss" ? 3 : 0) * (1 - fraction), 8, 55)),
      waist: round(finalWaist + weightDifference * 0.55),
      chest: round(finalChest + weightDifference * 0.18),
      hips: round(finalHips + weightDifference * 0.38),
      left_arm: round(finalArm + weightDifference * 0.08),
      right_arm: round(finalArm + weightDifference * 0.08 + 0.4),
      left_leg: round(finalLeg + weightDifference * 0.1),
      right_leg: round(finalLeg + weightDifference * 0.1 + 0.5),
      notes: `${SYNTHETIC_PROGRESS_NOTE_PREFIX} sample values, not measured.`,
    };
  });
};

module.exports = {
  SYNTHETIC_PROGRESS_NOTE_PREFIX,
  getWeeklyDateKeys,
  buildSyntheticProgressEntries,
};
