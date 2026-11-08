import { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { Activity, CalendarDays, HeartPulse, Scale, TrendingUp } from "lucide-react";
import userApi from "../userApi";
import TrainingPulse from "../components/TrainingPulse";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const getBmiCategory = (bmi) => {
  if (!Number.isFinite(bmi) || bmi <= 0) return "Not available";
  if (bmi < 18.5) return "Underweight range";
  if (bmi < 25) return "Within the standard range";
  if (bmi < 30) return "Overweight range";
  return "Obesity range";
};

const parseList = (value) => Array.isArray(value) ? value.filter((item) => item && item !== "None") : [];

const formatDate = (date) => {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" }).format(new Date(date));
};

export default function UserAnalytics() {
  const [profile, setProfile] = useState(null);
  const [logs, setLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([userApi.get("/profile"), userApi.get("/progress"), userApi.get("/workouts")])
      .then(([profileResponse, progressResponse, workoutResponse]) => {
        if (!active) return;
        const nextProfile = profileResponse.data.data || {};
        setProfile(nextProfile);
        setLogs(Array.isArray(progressResponse.data.data) ? progressResponse.data.data : []);
        setSessions(Array.isArray(workoutResponse.data.data) ? workoutResponse.data.data : []);
      })
      .catch((requestError) => {
        console.error(requestError);
        if (active) setError(requestError.response?.data?.message || "Unable to load your analytics.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const metrics = useMemo(() => {
    const datedLogs = logs
      .filter((entry) => entry.log_date)
      .sort((left, right) => new Date(left.log_date) - new Date(right.log_date));
    const weightedLogs = datedLogs.filter((entry) => Number(entry.weight) > 0);
    const latestWeight = weightedLogs.length
      ? Number(weightedLogs[weightedLogs.length - 1].weight)
      : Number(profile?.weight) || null;
    const baselineWeight = weightedLogs.length ? Number(weightedLogs[0].weight) : Number(profile?.weight) || null;
    const heightMeters = Number(profile?.height) / 100;
    const currentBmi = latestWeight && heightMeters > 0
      ? latestWeight / (heightMeters ** 2)
      : Number(datedLogs.at(-1)?.bmi) || null;
    const baselineBmi = baselineWeight && heightMeters > 0
      ? baselineWeight / (heightMeters ** 2)
      : Number(datedLogs[0]?.bmi) || null;
    const completed = sessions.filter((session) => session.completed).length;
    const workoutCompletionRate = sessions.length ? Math.round((completed / sessions.length) * 100) : null;

    return {
      datedLogs,
      weightedLogs,
      latestWeight,
      baselineWeight,
      currentBmi,
      baselineBmi,
      workoutCompletionRate,
      completedWorkouts: completed,
    };
  }, [logs, profile, sessions]);

  const injuries = parseList(profile?.injuries);
  const healthConditions = parseList(profile?.health_conditions);
  const currentWeightChange = metrics.latestWeight != null && metrics.baselineWeight != null
    ? metrics.latestWeight - metrics.baselineWeight
    : null;
  const weightChart = {
    labels: metrics.datedLogs.map((entry) => formatDate(entry.log_date)),
    datasets: [
      {
        label: "Weight (kg)",
        data: metrics.datedLogs.map((entry) => entry.weight == null ? null : Number(entry.weight)),
        borderColor: "#f97316",
        backgroundColor: "rgba(249,115,22,0.12)",
        fill: true,
        tension: 0.3,
        spanGaps: true,
      },
      {
        label: "BMI",
        data: metrics.datedLogs.map((entry) => entry.bmi == null ? null : Number(entry.bmi)),
        borderColor: "#14b8a6",
        backgroundColor: "rgba(20,184,166,0.08)",
        fill: false,
        tension: 0.3,
        spanGaps: true,
        yAxisID: "bmi",
      },
    ],
  };
  const weightChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: { legend: { position: "top" } },
    scales: {
      x: { grid: { display: false } },
      y: { title: { display: true, text: "Weight (kg)" } },
      bmi: { position: "right", title: { display: true, text: "BMI" }, grid: { drawOnChartArea: false } },
    },
  };

  const recommendations = [
    profile?.fitness_goal
      ? `Keep logging progress and completed sessions to compare actual results with your ${profile.fitness_goal.toLowerCase()} goal.`
      : "Set a fitness goal in your profile to personalize progress comparisons.",
    injuries.length
      ? `You recorded ${injuries.join(", ")} as injury or pain areas. Use the beginner-level, reduced-volume options shown in workout requests and ask your coach to review any discomfort.`
      : "Increase training gradually and let your coach know if an exercise causes pain or unusual symptoms.",
    healthConditions.length
      ? `Your profile lists ${healthConditions.join(", ")}. Confirm exercise intensity and any health-related restrictions with your healthcare professional and coach.`
      : "Keep your profile health information current so your coach can make informed adjustments.",
  ];

  return (
    <main className="space-y-6 px-4 py-6 text-slate-900 dark:text-white sm:px-6 sm:py-8">
      <header className="ave-page-hero rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Your health and activity</p>
        <h1 className="mt-2 text-3xl font-black">Analytics</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">Review your recorded baseline, recent progress, and estimated goal timelines. Forecasts update as you log new results.</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      {loading ? <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500 dark:bg-[#111]">Loading your analytics...</p> : profile && (
        <>
          <TrainingPulse audience="user" />
          <section aria-labelledby="health-summary-title" className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111]">
            <div className="flex items-center gap-2"><HeartPulse className="text-orange-500" size={20} /><h2 id="health-summary-title" className="text-lg font-bold">Current health standing and baseline</h2></div>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {metrics.currentBmi
                ? `Your latest recorded BMI is ${metrics.currentBmi.toFixed(1)} (${getBmiCategory(metrics.currentBmi)}). `
                : "BMI is not available yet; add height and weight in Profile to calculate it. "}
              {metrics.baselineWeight != null
                ? `Your baseline weight was ${metrics.baselineWeight.toFixed(1)} kg${metrics.latestWeight != null ? ` and your latest recorded weight is ${metrics.latestWeight.toFixed(1)} kg` : ""}.`
                : "A baseline will appear after you save your first weight entry."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {injuries.map((injury) => <span key={injury} className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">Injury/pain area: {injury}</span>)}
              {healthConditions.map((condition) => <span key={condition} className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800 dark:bg-violet-500/15 dark:text-violet-200">{condition}</span>)}
              {!injuries.length && !healthConditions.length && <span className="text-xs text-slate-500">No injuries or health conditions recorded.</span>}
            </div>
            <p className="mt-3 text-xs text-slate-500">BMI is a screening measure and does not diagnose health conditions. Talk with a healthcare professional about health concerns.</p>
          </section>

          <section aria-label="Progress summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Current weight", value: metrics.latestWeight == null ? "—" : `${metrics.latestWeight.toFixed(1)} kg`, icon: Scale },
              { label: "Current BMI", value: metrics.currentBmi == null ? "—" : metrics.currentBmi.toFixed(1), icon: Activity },
              { label: "Change from baseline", value: currentWeightChange == null ? "—" : `${currentWeightChange > 0 ? "+" : ""}${currentWeightChange.toFixed(1)} kg`, icon: TrendingUp },
              { label: "Completed workouts", value: `${metrics.completedWorkouts}${metrics.workoutCompletionRate == null ? "" : ` · ${metrics.workoutCompletionRate}%`}`, icon: CalendarDays },
            ].map(({ label, value, icon: Icon }) => (
              <article key={label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111]">
                <Icon size={19} className="text-orange-500" />
                <p className="mt-3 text-xl font-black">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{label}</p>
              </article>
            ))}
          </section>

          <section aria-labelledby="history-chart-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111]">
            <h2 id="history-chart-title" className="text-lg font-bold">Historical and current trends</h2>
            <p className="mt-1 text-xs text-slate-500">Compare progress entries over time; logging BMI from Profile adds a new point to this chart.</p>
            {metrics.datedLogs.length ? <div className="mt-5 h-72"><Line data={weightChart} options={weightChartOptions} /></div> : <p className="py-12 text-center text-sm text-slate-500">No progress history yet. Record your weight in Profile to begin tracking trends.</p>}
            {metrics.baselineBmi != null && metrics.currentBmi != null && (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">BMI comparison: baseline {metrics.baselineBmi.toFixed(1)} → current {metrics.currentBmi.toFixed(1)}.</p>
            )}
          </section>

          <section aria-labelledby="recommendations-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111]">
            <h2 id="recommendations-title" className="text-lg font-bold">Personalized next steps</h2>
            <ul className="mt-3 space-y-2">
              {recommendations.map((recommendation) => <li key={recommendation} className="rounded-xl bg-slate-50 p-3 text-sm leading-relaxed text-slate-700 dark:bg-white/[0.04] dark:text-slate-300">{recommendation}</li>)}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
