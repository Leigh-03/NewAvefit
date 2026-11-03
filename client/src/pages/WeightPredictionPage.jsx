import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Scale, Target, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import userApi from "../userApi";

const isValidWeight = (value) => {
  const weight = Number(value);
  return Number.isFinite(weight) && weight >= 20 && weight <= 200;
};

export default function WeightPredictionPage() {
  const [form, setForm] = useState({ current_weight: "", goal_weight: "" });
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([userApi.get("/profile"), userApi.get("/progress")])
      .then(([profileResponse, progressResponse]) => {
        if (!active) return;
        const profile = profileResponse.data.data || {};
        const logs = progressResponse.data.data || [];
        const latestWeight = [...logs].reverse().find((log) => log.weight != null)?.weight;
        setForm({
          current_weight: latestWeight ?? profile.weight ?? "",
          goal_weight: profile.target_weight ?? "",
        });
      })
      .catch((loadError) => {
        console.error(loadError);
        if (active) setError(loadError.response?.data?.message || "Unable to load your weight details.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const calculatePrediction = async (event) => {
    event.preventDefault();
    setError("");
    if (!isValidWeight(form.current_weight)) {
      setError("Current weight must be between 20 kg and 200 kg.");
      return;
    }
    if (!isValidWeight(form.goal_weight)) {
      setError("Goal weight must be between 20 kg and 200 kg.");
      return;
    }

    setCalculating(true);
    try {
      const response = await userApi.post("/progress/predict", {
        current_weight: Number(form.current_weight),
        goal_weight: Number(form.goal_weight),
      });
      setResult(response.data.data);
    } catch (requestError) {
      console.error(requestError);
      setError(requestError.response?.data?.message || "Unable to calculate your prediction. Please try again.");
    } finally {
      setCalculating(false);
    }
  };

  const resultItems = result ? [
    { label: "Estimated time", value: `${result.weeks_needed} ${result.weeks_needed === 1 ? "week" : "weeks"}`, icon: CalendarDays },
    { label: "Estimated target date", value: result.target_date, icon: Target },
    { label: "Goal weight", value: `${result.goal_weight} kg`, icon: Scale },
    { label: "Predicted BMI", value: result.predicted_bmi || "Not available", icon: TrendingUp },
  ] : [];

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
              <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">Weight prediction</h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Estimate how long it may take to reach your goal weight.
              </p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111] sm:p-7">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading your weight details...</p>
          ) : (
            <form onSubmit={calculatePrediction} className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {[
                  { label: "Current weight (kg)", key: "current_weight" },
                  { label: "Goal weight (kg)", key: "goal_weight" },
                ].map((field) => (
                  <label key={field.key} htmlFor={`prediction-${field.key}`} className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {field.label}
                    <input
                      id={`prediction-${field.key}`}
                      type="number"
                      min="20"
                      max="200"
                      step="0.1"
                      value={form[field.key]}
                      onChange={(event) => {
                        setForm((current) => ({ ...current, [field.key]: event.target.value }));
                        setResult(null);
                      }}
                      required
                      aria-invalid={Boolean(form[field.key] && !isValidWeight(form[field.key]))}
                      className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-white/5 dark:text-white"
                    />
                    <span className="mt-1 block text-xs font-normal text-slate-500">Enter a value from 20 to 200 kg.</span>
                  </label>
                ))}
              </div>

              {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</p>}

              <button type="submit" disabled={calculating || loading} className="min-h-12 w-full rounded-xl bg-orange-600 px-5 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
                {calculating ? "Calculating..." : "Calculate prediction"}
              </button>
            </form>
          )}
        </section>

        {result && (
          <section aria-label="Weight prediction results" className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111] sm:p-7">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your estimated results</h2>
            <p className="mt-1 text-sm text-slate-500">
              From {result.current_weight} kg to {result.goal_weight} kg
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {resultItems.map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-xl bg-slate-50 p-4 text-center dark:bg-white/5">
                  <Icon size={20} className="mx-auto mb-2 text-orange-500" />
                  <p className="font-bold text-slate-900 dark:text-white">{value}</p>
                  <p className="mt-1 text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-500">
              This is an estimate based on the app&apos;s current prediction model, not a medical assessment. Actual results vary; consult your coach or a health professional about a safe target and pace.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
