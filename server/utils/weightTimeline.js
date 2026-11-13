const RATE_PER_BODY_WEIGHT = {
  "Weight Loss": { fraction: 0.005, max: 1 },
  "Gain Weight": { fraction: 0.0025, max: 0.45 },
  "Muscle Gain": { fraction: 0.0025, max: 0.45 },
};

const WEEKS_PER_MONTH = 4.345;

function calculateWeightTimeline({ goal, currentWeight, targetWeight, height }) {
  const rateRule = RATE_PER_BODY_WEIGHT[goal];
  const weightDifference = Math.abs(currentWeight - targetWeight);
  const weeklyRate = Number(Math.min(currentWeight * rateRule.fraction, rateRule.max).toFixed(2));
  const slowerWeeklyRate = weeklyRate / 2;
  const weeksForRate = (rate) => weightDifference === 0 ? 0 : Math.ceil(weightDifference / rate);
  const weeksConsistent = weeksForRate(weeklyRate);
  const weeksHalfPace = weeksForRate(slowerWeeklyRate);
  const heightMeters = Number(height) / 100;
  const predictedBmi = Number.isFinite(heightMeters) && heightMeters > 0
    ? (targetWeight / (heightMeters ** 2)).toFixed(2)
    : null;
  const rateDescription = goal === "Weight Loss"
    ? "0.5% of current body weight per week, capped at 1 kg/week"
    : "0.25% of current body weight per week, capped at 0.45 kg/week";

  return {
    mode: weightDifference === 0 ? "at-target" : "target-weight",
    goal,
    current_weight: currentWeight,
    target_weight: targetWeight,
    weight_diff_kg: +weightDifference.toFixed(1),
    weekly_rate_kg: weeklyRate,
    slower_weekly_rate_kg: +slowerWeeklyRate.toFixed(3),
    weeks_needed_consistent: weeksConsistent,
    months_needed_consistent: +(weeksConsistent / WEEKS_PER_MONTH).toFixed(1),
    weeks_needed_inconsistent: weeksHalfPace,
    months_needed_inconsistent: +(weeksHalfPace / WEEKS_PER_MONTH).toFixed(1),
    predicted_bmi: predictedBmi,
    note: weightDifference === 0
      ? "Your current weight already matches your target."
      : `Planning estimate, not a personal weight-history forecast: assumes ${rateDescription}; the slower scenario uses half that pace. Actual timelines vary.`,
  };
}

module.exports = { calculateWeightTimeline };
