import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import userApi from "../userApi";
import { formatPhilippinesDate, philippinesDateString } from "../utils/philippinesDate";

const FORECAST_WINDOW_DAYS = 56;
const MIN_FORECAST_SPAN_DAYS = 7;
const MAX_WEIGHT_LOSS_RATE = 1;
const MAX_WEIGHT_GAIN_RATE = 0.45;

const dateKeyToUtc = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

const getWeeklyTrend = (entries) => {
  if (entries.length < 2) return null;
  const firstDate = entries[0].dateKey;
  const lastDate = entries[entries.length - 1].dateKey;
  const spanDays = (dateKeyToUtc(lastDate) - dateKeyToUtc(firstDate)) / (24 * 60 * 60 * 1000);
  if (spanDays < MIN_FORECAST_SPAN_DAYS) return null;

  const meanDay = entries.reduce((total, entry) => (
    total + (dateKeyToUtc(entry.dateKey) - dateKeyToUtc(firstDate)) / (24 * 60 * 60 * 1000)
  ), 0) / entries.length;
  const meanWeight = entries.reduce((total, entry) => total + entry.weight, 0) / entries.length;
  const denominator = entries.reduce((total, entry) => {
    const day = (dateKeyToUtc(entry.dateKey) - dateKeyToUtc(firstDate)) / (24 * 60 * 60 * 1000);
    return total + (day - meanDay) ** 2;
  }, 0);
  if (!denominator) return null;

  const slopePerDay = entries.reduce((total, entry) => {
    const day = (dateKeyToUtc(entry.dateKey) - dateKeyToUtc(firstDate)) / (24 * 60 * 60 * 1000);
    return total + (day - meanDay) * (entry.weight - meanWeight);
  }, 0) / denominator;
  return slopePerDay * 7;
};

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
    const today = philippinesDateString();
    const todayUtc = dateKeyToUtc(today);
    const earliestForecastDate = new Date(todayUtc - FORECAST_WINDOW_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const weightedLogs = logs
      .map((entry) => ({
        ...entry,
        dateKey: String(entry.log_date || "").slice(0, 10),
        weight: Number(entry.weight),
      }))
      .filter((entry) => (
        /^\d{4}-\d{2}-\d{2}$/.test(entry.dateKey)
        && dateKeyToUtc(entry.dateKey) <= todayUtc
        && Number.isFinite(entry.weight)
        && entry.weight >= 20
        && entry.weight <= 200
      ))
      .sort((left, right) => (
        left.dateKey.localeCompare(right.dateKey)
        || Number(left.progress_id || 0) - Number(right.progress_id || 0)
      ));
    const latestLogByDate = new Map(weightedLogs.map((entry) => [entry.dateKey, entry]));
    const uniqueWeightedLogs = [...latestLogByDate.values()];
    const recentLogs = uniqueWeightedLogs.filter((entry) => entry.dateKey >= earliestForecastDate);
    const profileWeight = Number(profile?.weight);
    const latestWeight = uniqueWeightedLogs.length
      ? uniqueWeightedLogs[uniqueWeightedLogs.length - 1].weight
      : Number.isFinite(profileWeight) && profileWeight >= 20 && profileWeight <= 200
        ? profileWeight
        : null;
    const target = Number(targetWeight);
    const hasTarget = Number.isFinite(target) && target >= 20 && target <= 200;
    const difference = latestWeight && hasTarget ? Math.abs(latestWeight - target) : 0;
    const recentRate = getWeeklyTrend(recentLogs);
    const historicalRate = getWeeklyTrend(uniqueWeightedLogs);
    const measuredRate = recentRate ?? historicalRate;
    const rateSource = recentRate !== null
      ? "recent"
      : historicalRate !== null
        ? "historical"
        : "planning";
    const goalDirection = latestWeight != null && hasTarget
      ? Math.sign(target - latestWeight)
      : 0;
    const rawRateTowardTarget = measuredRate == null ? null : measuredRate * goalDirection;
    const isProgressing = rawRateTowardTarget > 0;
    const rateLimit = goalDirection < 0 ? MAX_WEIGHT_LOSS_RATE : MAX_WEIGHT_GAIN_RATE;
    const baselineRate = goalDirection < 0
      ? Math.min(MAX_WEIGHT_LOSS_RATE, Math.max(0.25, latestWeight * 0.005))
      : Math.min(MAX_WEIGHT_GAIN_RATE, Math.max(0.1, latestWeight * 0.001));
    const weeklyRate = isProgressing
      ? Math.min(rawRateTowardTarget, rateLimit)
      : baselineRate;
    const rateWasCapped = isProgressing && rawRateTowardTarget > rateLimit;
    const weeksFor = (rate) => difference === 0 ? 0 : Math.ceil(difference / rate);
    return {
      latestWeight,
      weeklyRate,
      rawRateTowardTarget,
      target: hasTarget ? target : null,
      rateSource,
      isProgressing,
      rateWasCapped,
      consistentWeeks: latestWeight != null && hasTarget ? weeksFor(weeklyRate) : null,
      irregularWeeks: latestWeight != null && hasTarget ? weeksFor(weeklyRate * 0.65) : null,
    };
  }, [logs, profile, targetWeight]);

  const getTargetDate = (weeks) => {
    const targetDate = new Date(dateKeyToUtc(philippinesDateString()) + weeks * 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    return formatPhilippinesDate(targetDate, { dateStyle: "medium" });
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
                Latest recorded weight (kg)
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
              {forecast.target && forecast.latestWeight != null && forecast.latestWeight === forecast.target && (
                <p role="status" className="text-sm text-green-700 dark:text-green-300">You have reached your target weight.</p>
              )}
              {forecast.rateSource === "recent" && forecast.isProgressing && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Recent measured trend: {forecast.weeklyRate.toFixed(2)} kg/week toward your target, based on weight logs from the last 8 weeks.
                  {forecast.rateWasCapped ? " The projection is capped at a safer planning rate." : ""}
                </p>
              )}
              {forecast.rateSource === "historical" && forecast.isProgressing && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Estimated rate: {forecast.weeklyRate.toFixed(2)} kg/week toward your target, based on your available weight history.
                  {forecast.rateWasCapped ? " The projection is capped at a safer planning rate." : ""}
                </p>
              )}
              {!forecast.latestWeight && <p className="text-sm text-amber-700 dark:text-amber-300">Add a current weight in your profile to estimate your goal timeline.</p>}
              {forecast.latestWeight && forecast.target && forecast.latestWeight !== forecast.target && forecast.rateSource === "planning" && (
                <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
                  Not enough dated weight logs to calculate your personal pace yet. The timelines below use a conservative planning rate; they will update as you log progress.
                </p>
              )}
              {forecast.latestWeight && forecast.target && forecast.rateSource !== "planning" && !forecast.isProgressing && (
                <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
                  Your measured weight trend is not moving toward this target. The timelines below use a conservative planning rate instead; continue logging to update the estimate.
                </p>
              )}
              {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
              {forecast.latestWeight && forecast.target && forecast.latestWeight !== forecast.target && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    {
                      label: forecast.isProgressing ? "Current progress continues" : "Steady progress",
                      weeks: forecast.consistentWeeks,
                      rate: forecast.weeklyRate,
                      note: forecast.isProgressing
                        ? forecast.rateSource === "recent"
                          ? "Based on your measured trend from the last 8 weeks."
                            : "Based on your historical weight trend, which may not reflect your current pace."
                        : "Planning scenario until your logs show a trend toward your target.",
                    },
                    {
                      label: "Slower progress",
                      weeks: forecast.irregularWeeks,
                      rate: forecast.weeklyRate * 0.65,
                      note: "Assumes progress continues at 65% of the first scenario.",
                    },
                  ].map((scenario) => (
                    <article key={scenario.label} className="rounded-2xl bg-slate-50 p-5 dark:bg-white/[0.04]">
                      <p className="font-bold text-slate-900 dark:text-white">{scenario.label}</p>
                      <p className="mt-2 text-2xl font-black text-orange-600 dark:text-orange-400">{scenario.weeks} {scenario.weeks === 1 ? "week" : "weeks"}</p>
                      <p className="mt-1 text-xs text-slate-500">Assumed pace: {scenario.rate.toFixed(2)} kg/week</p>
                      <p className="mt-1 text-xs text-slate-500">Estimated target date: {getTargetDate(scenario.weeks)}</p>
                      <p className="mt-2 text-xs text-slate-500">{scenario.note}</p>
                    </article>
                  ))}
                </div>
              )}
              <p className="text-xs leading-relaxed text-slate-500">
                These are rough, non-medical estimates. Measured rates are capped at 1 kg/week for weight loss and 0.45 kg/week for weight gain; when there is not enough progress history, conservative planning rates are used. Weight changes are not linear, so dates can vary substantially. Ask your coach or healthcare professional about a safe target and pace.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
