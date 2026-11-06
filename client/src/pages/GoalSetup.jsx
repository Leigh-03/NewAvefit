import { useEffect, useMemo, useState } from "react";
import OnboardingShell from "../components/layout/OnboardingShell";
import { useNavigate } from "react-router-dom";
import userApi from "../userApi";

const GOALS = [
  { key: "Weight Loss", icon: "⬇️", desc: "Lose weight while staying within the healthy BMI range." },
  { key: "Maintain Weight", icon: "⚖️", desc: "Stay close to your current weight." },
  { key: "Gain Weight", icon: "💪", desc: "Gain weight while staying within the healthy BMI range." },
];

const getNormalWeightRange = (heightCm) => {
  const heightMeters = Number(heightCm) / 100;
  if (!Number.isFinite(heightMeters) || heightMeters <= 0) return null;
  const minimum = 18.5 * heightMeters ** 2;
  const maximum = 24.9 * heightMeters ** 2;
  return {
    min: Math.ceil(minimum),
    max: Math.floor(maximum),
  };
};

const getRange = (goal, currentWeight, normalRange) => {
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

const getBmiCategory = (bmi) => {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Normal";
  if (bmi < 30) return "Overweight";
  return "Obese";
};

export default function GoalSetup() {
  const navigate = useNavigate();
  const [goal, setGoal] = useState("");
  const [currentWeight, setCurrentWeight] = useState(null);
  const [height, setHeight] = useState(null);
  const [targetWeight, setTargetWeight] = useState(0);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    userApi.get("/profile")
      .then((response) => {
        const profile = response.data.data;
        const weight = Number(profile?.weight);
        const heightCm = Number(profile?.height);
        if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(heightCm) || heightCm <= 0) {
          setProfileError("Complete your weight and height in the body assessment before choosing a goal.");
          return;
        }

        const bmi = weight / ((heightCm / 100) ** 2);
        const recommendedGoal = bmi < 18.5
          ? "Gain Weight"
          : bmi >= 25
            ? "Weight Loss"
            : "Maintain Weight";
        const normalRange = getNormalWeightRange(heightCm);
        if (!normalRange || normalRange.min > normalRange.max) {
          setProfileError("Your height does not allow us to calculate a healthy target-weight range.");
          return;
        }
        const range = getRange(recommendedGoal, weight, normalRange);
        setCurrentWeight(weight);
        setHeight(heightCm);
        setGoal(recommendedGoal);
        setTargetWeight(range.max);
      })
      .catch((error) => {
        console.error("Goal setup profile load failed:", error);
        setProfileError(error.response?.data?.message || "Unable to load your body assessment.");
      })
      .finally(() => setLoading(false));
  }, []);

  const bmi = useMemo(() => (
    currentWeight && height
      ? currentWeight / ((height / 100) ** 2)
      : null
  ), [currentWeight, height]);
  const targetBmi = useMemo(() => (
    targetWeight && height
      ? targetWeight / ((height / 100) ** 2)
      : null
  ), [targetWeight, height]);
  const bmiCategory = bmi === null ? "" : getBmiCategory(bmi);
  const targetBmiCategory = targetBmi === null ? "" : getBmiCategory(targetBmi);
  const recommendedGoal = bmiCategory === "Underweight"
    ? "Gain Weight"
    : bmiCategory === "Overweight" || bmiCategory === "Obese"
      ? "Weight Loss"
      : "";
  const normalRange = height ? getNormalWeightRange(height) : null;
  const availableGoals = bmiCategory === "Underweight"
    ? new Set(["Gain Weight", "Maintain Weight"])
    : bmiCategory === "Overweight" || bmiCategory === "Obese"
      ? new Set(["Weight Loss"])
      : new Set(GOALS.map(({ key }) => key));
  const range = normalRange && currentWeight
    ? getRange(goal, currentWeight, normalRange)
    : { min: 0, max: 0 };
  const isLocked = goal === "Maintain Weight";
  const goalOptions = [...GOALS].sort((a, b) => (
    Number(b.key === recommendedGoal) - Number(a.key === recommendedGoal)
  ));

  const handleSelectGoal = (nextGoal) => {
    if (!availableGoals.has(nextGoal) || !normalRange || !currentWeight) return;
    setGoal(nextGoal);
    const nextRange = getRange(nextGoal, currentWeight, normalRange);
    setTargetWeight((previous) => Math.min(Math.max(previous, nextRange.min), nextRange.max));
  };

  const handleContinue = () => {
    if (!goal || !availableGoals.has(goal)) return;
    const finalTarget = isLocked
      ? range.min
      : Math.round(Math.min(Math.max(targetWeight, range.min), range.max));
    sessionStorage.setItem("avefit_goal", JSON.stringify({ goal, targetWeight: finalTarget }));
    navigate("/user/health");
  };

  return (
    <OnboardingShell step={2}>
      <button onClick={() => navigate("/user/assessment")} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        ← Back
      </button>

      <h2 className="mb-1 text-2xl font-bold text-slate-900">Set Your Goal</h2>
      <p className="mb-6 text-sm text-slate-500">Your BMI helps us recommend an appropriate weight goal.</p>

      {profileError ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{profileError}</p>
      ) : (
        <>
          <div className="mb-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <div className="text-center">
              <p className="text-sm text-slate-500">Current BMI</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{bmi === null ? "—" : bmi.toFixed(2)}</p>
              <p className={`text-sm font-semibold ${bmiCategory === "Normal" ? "text-green-600" : "text-orange-600"}`}>{bmiCategory}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-slate-500">Target BMI</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{targetBmi === null ? "—" : targetBmi.toFixed(2)}</p>
              <p className={`text-sm font-semibold ${targetBmiCategory === "Normal" ? "text-green-600" : "text-orange-600"}`}>{targetBmiCategory}</p>
            </div>
          </div>

          <div className="mb-8 space-y-3">
            {goalOptions.map((option) => {
              const isAvailable = availableGoals.has(option.key);
              const isRecommended = option.key === recommendedGoal;
              return (
                <button
                  key={option.key}
                  type="button"
                  disabled={!isAvailable || loading}
                  onClick={() => handleSelectGoal(option.key)}
                  aria-pressed={goal === option.key}
                  className={`flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left transition ${
                    goal === option.key
                      ? "border-orange-500 bg-orange-500/10 text-slate-900"
                      : isAvailable
                        ? "border-slate-200 text-slate-600 hover:border-slate-300"
                        : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400 opacity-70"
                  }`}
                >
                  <span className="text-2xl">{option.icon}</span>
                  <span className="flex-1">
                    <span className="flex flex-wrap items-center gap-2 font-semibold">
                      {option.key}
                      {isRecommended && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">Recommend for you</span>}
                      {!isAvailable && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">Locked for your BMI</span>}
                    </span>
                    <span className="mt-1 block text-xs opacity-70">{option.desc}</span>
                  </span>
                  {goal === option.key && (
                    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-orange-500">
                      <span className="h-2 w-2 rounded-full bg-white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mb-8">
            <div className="mb-3 flex items-center justify-between">
              <label htmlFor="target-weight" className="text-sm font-medium text-slate-600">Target Weight</label>
              <span className="text-2xl font-bold text-orange-500">
                {loading || !currentWeight ? "—" : `${isLocked ? range.min : targetWeight} kg`}
              </span>
            </div>
            {isLocked ? (
              <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                Your target stays at your current weight ({range.min} kg).
              </p>
            ) : (
              <>
                <input
                  id="target-weight"
                  type="range"
                  min={range.min}
                  max={range.max}
                  step="1"
                  value={targetWeight}
                  disabled={loading || !currentWeight}
                  onChange={(event) => setTargetWeight(Number(event.target.value))}
                  className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-100 accent-orange-500 disabled:opacity-50"
                />
                <div className="mt-1 flex justify-between text-xs text-slate-500">
                  <span>{range.min} kg</span>
                  <span>{range.max} kg</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Target choices stay between BMI 18.5 and 24.9.
                </p>
              </>
            )}
          </div>
        </>
      )}

      <button
        type="button"
        onClick={handleContinue}
        disabled={loading || Boolean(profileError) || !goal || !availableGoals.has(goal)}
        className="w-full rounded-xl bg-orange-500 py-3 font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
      >
        Continue to Health Assessment →
      </button>
    </OnboardingShell>
  );
}
