import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import userApi from "../userApi";

const isValidWeight = (value) => {
  const weight = Number(value);
  return Number.isFinite(weight) && weight >= 20 && weight <= 200;
};

export default function WeightPredictionPage() {
  const [profile, setProfile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [targetWeight, setTargetWeight] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([userApi.get("/profile"), userApi.get("/progress")])
      .then(([profileResponse, progressResponse]) => {
        if (!active) return;
        const nextProfile = profileResponse.data.data || {};
        setProfile(nextProfile);
        setLogs(Array.isArray(progressResponse.data.data) ? progressResponse.data.data : []);
        setTargetWeight(nextProfile.target_weight == null ? "" : String(nextProfile.target_weight));
      })
      .catch((loadError) => {
        console.error(loadError);
        if (active) setError(loadError.response?.data?.message || "Unable to load your weight details.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    const refreshProgress = async () => {
      try {
        const response = await userApi.get("/progress");
        if (active) setLogs(Array.isArray(response.data.data) ? response.data.data : []);
      } catch (refreshError) {
        console.error(refreshError);
        if (active) setError(refreshError.response?.data?.message || "Unable to refresh your current weight.");
      }
    };
    const intervalId = window.setInterval(refreshProgress, 15000);
    window.addEventListener("focus", refreshProgress);
    document.addEventListener("visibilitychange", refreshProgress);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshProgress);
      document.removeEventListener("visibilitychange", refreshProgress);
    };
  }, []);

  const forecast = useMemo(() => {
    const weightedLogs = logs
      .filter((entry) => entry.log_date && Number(entry.weight) > 0)
      .sort((left, right) => new Date(left.log_date) - new Date(right.log_date));
    const latestWeight = weightedLogs.length
      ? Number(weightedLogs[weightedLogs.length - 1].weight)
      : Number(profile?.weight) || null;
    const firstWeight = weightedLogs.length ? Number(weightedLogs[0].weight) : latestWeight;
    const firstDate = weightedLogs[0]?.log_date;
    const lastDate = weightedLogs[weightedLogs.length - 1]?.log_date;
    const elapsedWeeks = firstDate && lastDate
      ? (new Date(lastDate) - new Date(firstDate)) / (7 * 24 * 60 * 60 * 1000)
      : 0;
    const fitnessGoal = String(profile?.fitness_goal || "").toLowerCase();
    const lossGoal = fitnessGoal.includes("loss");
    const gainGoal = fitnessGoal.includes("gain");
    const observedRate = elapsedWeeks >= 1 && weightedLogs.length >= 2
      ? (lossGoal
        ? (firstWeight - latestWeight) / elapsedWeeks
        : (latestWeight - firstWeight) / elapsedWeeks)
      : 0;
    const fallbackRate = lossGoal ? 0.4 : gainGoal ? 0.2 : 0.25;
    const weeklyRate = Math.min(1, Math.max(0.1, observedRate > 0 ? observedRate : fallbackRate));
    const target = Number(targetWeight);
    const hasTarget = Number.isFinite(target) && target >= 20 && target <= 200;
    const directionMatches = lossGoal ? latestWeight > target : gainGoal ? latestWeight < target : true;
    const difference = latestWeight && hasTarget && directionMatches ? Math.abs(latestWeight - target) : 0;
    const weeksFor = (rate) => difference <= 0 ? 0 : Math.max(1, Math.ceil(difference / rate));
    return {
      latestWeight,
      weeklyRate,
      observedRate,
      target: hasTarget && directionMatches ? target : null,
      consistentWeeks: weeksFor(weeklyRate),
      irregularWeeks: weeksFor(weeklyRate * 0.45),
    };
  }, [logs, profile, targetWeight]);

  const getTargetDate = (weeks) => {
    const date = new Date();
    date.setDate(date.getDate() + weeks * 7);
    return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(date);
  };

  return (
    <main className="min-h-screen bg-[#fffaf5] px-4 py-6 text-slate-900 dark:bg-[#080808] dark:text-white sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Link to="/user/progress" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 transition hover:text-orange-600 dark:text-slate-300 dark:hover:text-orange-400">
          <ArrowLeft size={17} /> Back to progress
        </Link>

        <header className="ave-page-hero rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <TrendingUp size={23} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Weight goals</p>
              <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">Goal forecast scenarios</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                See estimated timelines based on your recent progress and target weight.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111] sm:p-7">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading your weight details...</p>
          ) : (
            <div className="space-y-4">
              <label htmlFor="prediction-current-weight" className="block max-w-md text-sm font-semibold text-slate-700 dark:text-slate-200">
                Your Current Weight (kg)
                <input
                  id="prediction-current-weight"
                  type="text"
                  value={forecast.latestWeight == null ? "" : forecast.latestWeight.toFixed(2)}
                  placeholder="No weight logged yet"
                  readOnly
                  className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-300 bg-slate-100 px-3 text-sm text-slate-900 outline-none dark:border-slate-700 dark:bg-white/[0.03] dark:text-white"
                />
              </label>
              <label htmlFor="prediction-target-weight" className="block max-w-md text-sm font-semibold text-slate-700 dark:text-slate-200">
                Target weight (kg)
                <input
                  id="prediction-target-weight"
                  type="number"
                  min="20"
                  max="200"
                  step="1"
                  value={targetWeight}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "" || Number.isInteger(Number(value))) {
                      setTargetWeight(value);
                      setError("");
                    }
                  }}
                  aria-invalid={Boolean(targetWeight && !isValidWeight(targetWeight))}
                  className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-white/5 dark:text-white"
                />
              </label>
              {targetWeight && !isValidWeight(targetWeight) && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-300">Target weight must be between 20 kg and 200 kg.</p>
              )}
              {forecast.observedRate > 0
                ? <p className="text-sm text-slate-600 dark:text-slate-300">Estimated progress rate: {forecast.weeklyRate.toFixed(2)} kg/week based on your records.</p>
                : <p className="text-sm text-slate-600 dark:text-slate-300">Estimated progress rate: {forecast.weeklyRate.toFixed(2)} kg/week planning assumption until more records are available.</p>}
              {!forecast.latestWeight && <p className="text-sm text-amber-700 dark:text-amber-300">Add a current weight in your profile to estimate your goal timeline.</p>}
              {forecast.latestWeight && !forecast.target && (
                <p className="text-sm text-slate-500">Enter a target in the correct direction for your goal to view an estimate.</p>
              )}
              {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
              {forecast.latestWeight && forecast.target && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: "Consistent progress", weeks: forecast.consistentWeeks, note: "Assumes your recent or baseline pace continues." },
                    { label: "Irregular updates", weeks: forecast.irregularWeeks, note: "Assumes approximately 45% of that pace." },
                  ].map((scenario) => (
                    <article key={scenario.label} className="rounded-2xl bg-slate-50 p-5 dark:bg-white/[0.04]">
                      <p className="font-bold text-slate-900 dark:text-white">{scenario.label}</p>
                      <p className="mt-2 text-2xl font-black text-orange-600 dark:text-orange-400">{scenario.weeks} {scenario.weeks === 1 ? "week" : "weeks"}</p>
                      <p className="mt-1 text-xs text-slate-500">Estimated target date: {getTargetDate(scenario.weeks)}</p>
                      <p className="mt-2 text-xs text-slate-500">{scenario.note}</p>
                    </article>
                  ))}
                </div>
              )}
              <p className="text-xs leading-relaxed text-slate-500">
                These are rough, non-medical estimates. Weight changes vary; the estimate recalculates from actual logged progress. Ask your coach or healthcare professional about a safe target and pace.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
