import { useEffect, useMemo, useState } from "react";
import {
  GOALS,
  getAvailableGoals,
  getBmiCategory,
  getGoalRange,
  getNormalWeightRange,
  getRecommendedGoal,
} from "../../utils/goalRules";

export default function GoalRenewalModal({
  currentWeight,
  height,
  saving,
  error,
  onSave,
}) {
  const [goal, setGoal] = useState("");
  const [targetWeight, setTargetWeight] = useState(0);
  const normalRange = useMemo(() => getNormalWeightRange(height), [height]);
  const bmi = Number(currentWeight) / ((Number(height) / 100) ** 2);
  const bmiCategory = Number.isFinite(bmi) ? getBmiCategory(bmi) : "";
  const recommendedGoal = getRecommendedGoal(bmiCategory);
  const availableGoals = getAvailableGoals(bmiCategory);
  const range = normalRange && goal
    ? getGoalRange(goal, currentWeight, normalRange)
    : { min: 0, max: 0 };
  const isLocked = goal === "Maintain Weight";
  const goalOptions = useMemo(() => [...GOALS].sort((first, second) => (
    Number(second.key === recommendedGoal) - Number(first.key === recommendedGoal)
  )), [recommendedGoal]);

  useEffect(() => {
    if (!normalRange || !Number.isFinite(Number(currentWeight)) || !Number.isFinite(Number(height))) return;
    const initialGoal = recommendedGoal;
    const initialRange = getGoalRange(initialGoal, Number(currentWeight), normalRange);
    setGoal(initialGoal);
    setTargetWeight(initialRange.max);
  }, [currentWeight, height, normalRange, recommendedGoal]);

  const handleSelectGoal = (nextGoal) => {
    if (!availableGoals.has(nextGoal) || !normalRange) return;
    setGoal(nextGoal);
    const nextRange = getGoalRange(nextGoal, Number(currentWeight), normalRange);
    setTargetWeight((previous) => Math.min(Math.max(previous, nextRange.min), nextRange.max));
  };

  const handleSave = () => {
    if (!goal || !availableGoals.has(goal)) return;
    const finalTarget = isLocked
      ? range.min
      : Math.round(Math.min(Math.max(targetWeight, range.min), range.max));
    onSave(goal, finalTarget);
  };

  if (!normalRange || normalRange.min > normalRange.max || !Number.isFinite(Number(currentWeight))) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-renewal-title"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-[#151515] sm:p-7"
      >
        <h2 id="goal-renewal-title" className="text-xl font-bold text-slate-900 dark:text-white">
          You reached your target weight!
        </h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Choose your next goal. Your current BMI determines which goals are available, just like your assessment.
        </p>

        <div className="mt-5 space-y-3">
          {goalOptions.map((option) => {
            const isAvailable = availableGoals.has(option.key);
            return (
              <button
                key={option.key}
                type="button"
                disabled={!isAvailable || saving}
                onClick={() => handleSelectGoal(option.key)}
                aria-pressed={goal === option.key}
                className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition ${
                  goal === option.key
                    ? "border-orange-500 bg-orange-500/10 text-slate-900 dark:text-white"
                    : isAvailable
                      ? "border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300"
                      : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400 opacity-70 dark:border-slate-800 dark:bg-white/5"
                }`}
              >
                <span className="text-2xl">{option.icon}</span>
                <span className="flex-1">
                  <span className="flex flex-wrap items-center gap-2 font-semibold">
                    {option.key}
                    {option.key === recommendedGoal && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">
                        Recommended
                      </span>
                    )}
                    {!isAvailable && (
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">
                        Locked for your BMI
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block text-xs opacity-70">{option.desc}</span>
                </span>
                {goal === option.key && <span className="h-3 w-3 rounded-full bg-orange-500" />}
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <label htmlFor="renewed-target-weight" className="text-sm font-medium text-slate-600 dark:text-slate-300">
              New target weight
            </label>
            <span className="text-xl font-bold text-orange-500">
              {isLocked ? range.min : targetWeight} kg
            </span>
          </div>
          {isLocked ? (
            <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
              Your maintenance target is based on your current weight.
            </p>
          ) : (
            <>
              <input
                id="renewed-target-weight"
                type="range"
                min={range.min}
                max={range.max}
                step="1"
                value={targetWeight}
                disabled={saving}
                onChange={(event) => setTargetWeight(Number(event.target.value))}
                className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-100 accent-orange-500 disabled:opacity-50"
              />
              <div className="mt-1 flex justify-between text-xs text-slate-500">
                <span>{range.min} kg</span>
                <span>{range.max} kg</span>
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Target choices stay between BMI 18.5 and 24.9.
              </p>
            </>
          )}
        </div>

        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !goal || !availableGoals.has(goal)}
          className="mt-6 w-full rounded-xl bg-orange-500 py-3 font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save new goal"}
        </button>
      </section>
    </div>
  );
}
