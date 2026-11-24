import { useEffect, useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { Users, TrendingUp, Dumbbell, Clock3, CalendarDays, Filter, BarChart3, ChevronDown, Sparkles, AlertTriangle, Target } from "lucide-react";
import api from "../services/api";
import TrainingPulse from "../components/TrainingPulse";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, Filler);

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { position: "top", labels: { color: "#737373", usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 20 } },
    tooltip: { backgroundColor: "#111827", titleColor: "#fff", bodyColor: "#e5e7eb", padding: 12, cornerRadius: 10, displayColors: true },
  },
  scales: {
    y: { beginAtZero: true, border: { display: false }, grid: { color: "rgba(148,163,184,0.15)" }, ticks: { color: "#737373", padding: 8 } },
    x: { grid: { display: false }, ticks: { color: "#737373" } },
  },
};

const countChartOptions = (axisTitle) => ({
  ...chartOptions,
  scales: {
    ...chartOptions.scales,
    y: {
      ...chartOptions.scales.y,
      title: { display: true, text: axisTitle, color: "#737373" },
    },
  },
});

const weightProgressChartOptions = {
  ...chartOptions,
  scales: {
    ...chartOptions.scales,
    y: { ...chartOptions.scales.y, beginAtZero: false },
  },
};

const monthlyWorkoutProgressChartOptions = {
  ...chartOptions,
  scales: {
    ...chartOptions.scales,
    x: { ...chartOptions.scales.x, stacked: true },
    y: { ...chartOptions.scales.y, stacked: true },
  },
};

const formatHour = (hour) => {
  const value = Number(hour);
  if (!Number.isInteger(value) || value < 0 || value > 23) return "";
  const suffix = value < 12 ? "AM" : "PM";
  const twelveHour = value % 12 || 12;
  return `${twelveHour} ${suffix}`;
};

const getPeakLabel = (rows, labelForRow) => {
  const highestCount = Math.max(0, ...rows.map((row) => Number(row.count) || 0));
  if (!highestCount) return "No data yet";
  return rows
    .filter((row) => Number(row.count) === highestCount)
    .map(labelForRow)
    .join(", ");
};

const getPeakCount = (rows) => Math.max(0, ...rows.map((row) => Number(row.count) || 0));
const formatCount = (count) => new Intl.NumberFormat().format(count);

const manilaDateString = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const linearForecast = (values, forecastCount = 3) => {
  const usable = values
    .map((value, index) => ({ index, value: Number(value) }))
    .filter((item, index) => values[index] != null && Number.isFinite(item.value));
  if (usable.length < 2) {
    const lastValue = usable.at(-1)?.value ?? null;
    return Array.from({ length: forecastCount }, () => lastValue == null ? null : Math.max(0, lastValue));
  }

  const averageIndex = usable.reduce((total, item) => total + item.index, 0) / usable.length;
  const averageValue = usable.reduce((total, item) => total + item.value, 0) / usable.length;
  const denominator = usable.reduce((total, item) => total + ((item.index - averageIndex) ** 2), 0);
  const slope = denominator
    ? usable.reduce((total, item) => total + ((item.index - averageIndex) * (item.value - averageValue)), 0) / denominator
    : 0;
  const intercept = averageValue - (slope * averageIndex);
  const lastIndex = usable.at(-1).index;

  return Array.from({ length: forecastCount }, (_, offset) =>
    Math.max(0, intercept + (slope * (lastIndex + offset + 1)))
  );
};

const getNextMonthLabels = (count) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  return Array.from({ length: count }, (_, offset) =>
    new Intl.DateTimeFormat("en", { month: "short", year: "numeric" })
      .format(new Date(year, month + offset + 1, 1))
  );
};

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [equipmentLoading, setEquipmentLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [equipmentDay, setEquipmentDay] = useState("");
  const [equipmentTimePeriod, setEquipmentTimePeriod] = useState("");
  const [equipmentPeriod, setEquipmentPeriod] = useState("today");
  const [showAllEquipment, setShowAllEquipment] = useState(false);
  const [appliedEquipmentFilters, setAppliedEquipmentFilters] = useState({ day: "", timePeriod: "", period: "today" });

  useEffect(() => {
    let active = true;
    const fetchAnalytics = () => {
      setEquipmentLoading(true);
      const params = {};
      if (appliedEquipmentFilters.day) params.equipment_day = appliedEquipmentFilters.day;
      if (appliedEquipmentFilters.timePeriod) params.equipment_time_period = appliedEquipmentFilters.timePeriod;
      params.equipment_period = appliedEquipmentFilters.period;
      api.get("/analytics", { params })
        .then((res) => {
          if (!active) return;
          setData(res.data.data);
          setFetchError("");
        })
        .catch((err) => {
          console.error(err);
          if (active) {
            setFetchError(err.response?.data?.message || err.message || "Couldn't load analytics.");
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
            setEquipmentLoading(false);
          }
        });
    };

    fetchAnalytics();
    const refreshTimer = window.setInterval(fetchAnalytics, 60 * 60 * 1000);
    return () => {
      active = false;
      window.clearInterval(refreshTimer);
    };
  }, [appliedEquipmentFilters]);

  if (loading) {
    return (
      <div className="space-y-8">
        <header className="ave-page-hero relative overflow-hidden rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
          <div className="absolute -right-10 -top-14 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <BarChart3 size={24} />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Gym performance</p>
              <h1 className="mt-1 text-3xl font-black text-slate-900 dark:text-white">Analytics</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">A clear view of member growth, training activity, and fitness trends.</p>
            </div>
          </div>
        </header>
        {fetchError && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            ⚠️ {fetchError}
          </div>
        )}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-md h-24 animate-pulse" />
          ))}
        </div>
        <div className="bg-white rounded-2xl shadow-md h-64 animate-pulse" />
      </div>
    );
  }

  const memberGrowthChart = {
    labels: data?.memberGrowth.map((g) => g.month) || [],
    datasets: [{
      label: "New Members",
      data: data?.memberGrowth.map((g) => parseInt(g.count)) || [],
      borderColor: "#3b82f6",
      backgroundColor: "rgba(59,130,246,0.08)",
      fill: true, tension: 0.4,
      pointBackgroundColor: "#3b82f6", pointRadius: 5,
    }],
  };

  const attendanceChart = {
    labels: data?.attendance.map((a) => a.day) || [],
    datasets: [{
      label: "Completed Sessions",
      data: data?.attendance.map((a) => parseInt(a.count)) || [],
      backgroundColor: "#10b981", borderRadius: 6,
    }],
  };

  const usageMonitoring = data?.usageMonitoring;
  const usageTrendChart = {
    labels: usageMonitoring?.daily.map((day) => day.label) || [],
    datasets: [
      {
        label: "Gym check-ins",
        data: usageMonitoring?.daily.map((day) => day.gymCheckIns) || [],
        borderColor: "#f97316",
        backgroundColor: "rgba(249,115,22,0.08)",
        tension: 0.35,
        pointRadius: 2,
      },
      {
        label: "Workout starts",
        data: usageMonitoring?.daily.map((day) => day.workoutStarts) || [],
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.08)",
        tension: 0.35,
        pointRadius: 2,
      },
      {
        label: "Members active",
        data: usageMonitoring?.daily.map((day) => day.activeMembers) || [],
        borderColor: "#10b981",
        backgroundColor: "rgba(16,185,129,0.08)",
        tension: 0.35,
        pointRadius: 2,
      },
    ],
  };

  const memberProgress = data?.memberProgress || [];
  const memberProgressChart = {
    labels: memberProgress.map((row) => row.label),
    datasets: [
      {
        label: "Average logged weight (kg)",
        data: memberProgress.map((row) => row.average_weight == null ? null : Number(row.average_weight)),
        borderColor: "#f97316",
        backgroundColor: "rgba(249,115,22,0.08)",
        fill: true,
        tension: 0.4,
        pointBackgroundColor: "#f97316",
        pointRadius: 4,
      },
      {
        label: "Average goal weight (kg)",
        data: memberProgress.map((row) => row.average_goal_weight == null ? null : Number(row.average_goal_weight)),
        borderColor: "#3b82f6",
        backgroundColor: "transparent",
        borderDash: [6, 4],
        tension: 0.4,
        pointBackgroundColor: "#3b82f6",
        pointRadius: 3,
      },
    ],
  };

  const monthlyWorkoutProgress = data?.monthlyWorkoutProgress || [];
  const monthlyWorkoutProgressChart = {
    labels: monthlyWorkoutProgress.map((row) => row.label),
    datasets: [
      {
        label: "Completed exercises",
        data: monthlyWorkoutProgress.map((row) => Number(row.completed_exercises)),
        backgroundColor: "#10b981",
        borderRadius: 5,
      },
      {
        label: "Not completed",
        data: monthlyWorkoutProgress.map((row) => Number(row.remaining_exercises)),
        backgroundColor: "#f97316",
        borderRadius: 5,
      },
    ],
  };

  const peakHours = data?.peakHours || [];
  const peakMonths = data?.peakMonths || [];
  const peakHourValue = getPeakLabel(peakHours, (row) => formatHour(row.hour));
  const peakHourCount = getPeakCount(peakHours);
  const dayAvailability = data?.dayAvailability || [];
  const mostUsedEquipment = data?.mostUsedEquipment || [];
  const peakDayValue = getPeakLabel(dayAvailability, (row) => row.day);
  const peakDayCount = getPeakCount(dayAvailability);
  const peakMonthValue = getPeakLabel(peakMonths, (row) => row.label);
  const peakMonthCount = getPeakCount(peakMonths);

  const peakHoursChart = {
    labels: peakHours.map((row) => formatHour(row.hour)),
    datasets: [{
      label: "Workout starts",
      data: peakHours.map((row) => Number(row.count)),
      backgroundColor: "#f97316",
      borderRadius: 5,
    }],
  };

  const dayAvailabilityChart = {
    labels: dayAvailability.map((row) => row.day),
    datasets: [{
      label: "Active members available",
      data: dayAvailability.map((row) => Number(row.count)),
      backgroundColor: "#10b981",
      borderRadius: 5,
    }],
  };

  const peakMonthsChart = {
    labels: peakMonths.map((row) => row.label),
    datasets: [{
      label: "New active members",
      data: peakMonths.map((row) => Number(row.count)),
      backgroundColor: "#fb923c",
      borderRadius: 5,
    }],
  };

  const bmiMap = Object.fromEntries((data?.bmiDistribution || []).map((b) => [b.category, parseInt(b.count)]));
  const maxEquipmentUsage = Math.max(0, ...mostUsedEquipment.map((item) => Number(item.count) || 0));

  const growthValues = (data?.memberGrowth || []).map((row) => Number(row.count) || 0);
  const signupForecast = linearForecast(growthValues);
  const forecastLabels = getNextMonthLabels(3);
  const actualGrowthLabels = (data?.memberGrowth || []).map((row) => row.label);
  const recentCompleteSignupMonths = growthValues.slice(0, -1).slice(-3);
  const recentSignupAverage = recentCompleteSignupMonths.length
    ? recentCompleteSignupMonths.reduce((total, value) => total + value, 0) / recentCompleteSignupMonths.length
    : null;
  const signupForecastChart = {
    labels: [...actualGrowthLabels, ...forecastLabels],
    datasets: [
      {
        label: "Actual active sign-ups",
        data: [...growthValues, null, null, null],
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59,130,246,0.08)",
        fill: true,
        tension: 0.35,
        pointRadius: 4,
      },
      {
        label: "Projected active sign-ups",
        data: [
          ...Array(Math.max(0, actualGrowthLabels.length - 1)).fill(null),
          growthValues.at(-1) ?? null,
          ...signupForecast,
        ],
        borderColor: "#f97316",
        backgroundColor: "rgba(249,115,22,0.08)",
        borderDash: [7, 5],
        fill: false,
        tension: 0.35,
        pointRadius: 4,
      },
    ],
  };
  const acquisitionScenarioLift = 0.1;
  const acquisitionScenarioForecast = signupForecast.map((value) =>
    value == null ? null : value * (1 + acquisitionScenarioLift)
  );
  const acquisitionScenarioChart = {
    labels: forecastLabels,
    datasets: [
      {
        label: "Current sign-up forecast",
        data: signupForecast,
        borderColor: "#f97316",
        backgroundColor: "rgba(249,115,22,0.08)",
        tension: 0.35,
        pointRadius: 4,
      },
      {
        label: "Forecast with promotion (+10% example)",
        data: acquisitionScenarioForecast,
        borderColor: "#10b981",
        backgroundColor: "rgba(16,185,129,0.08)",
        borderDash: [7, 5],
        tension: 0.35,
        pointRadius: 4,
      },
    ],
  };
  const predictiveChartOptions = {
    ...chartOptions,
    scales: {
      ...chartOptions.scales,
      y: {
        ...chartOptions.scales.y,
        beginAtZero: true,
        title: { display: true, text: "New sign-ups", color: "#737373" },
      },
    },
    plugins: {
      ...chartOptions.plugins,
      tooltip: {
        ...chartOptions.plugins.tooltip,
        callbacks: {
          label: (context) => `${context.dataset.label}: about ${Math.round(context.parsed.y)} sign-ups`,
        },
      },
    },
  };

  const latestSignupForecast = signupForecast[0] ?? 0;
  const signupForecastDifference = recentSignupAverage == null ? null : latestSignupForecast - recentSignupAverage;
  const prescriptiveSignupChart = {
    labels: ["Next month projection", "Recent monthly average"],
    datasets: [{
      label: "Active member sign-ups",
      data: [latestSignupForecast, recentSignupAverage],
      backgroundColor: ["#f97316", "#cbd5e1"],
      borderRadius: 6,
      barThickness: 22,
    }],
  };
  const prescriptiveSignupChartOptions = {
    ...chartOptions,
    indexAxis: "y",
    scales: {
      ...chartOptions.scales,
      x: {
        ...chartOptions.scales.x,
        beginAtZero: true,
        suggestedMax: Math.max(latestSignupForecast, recentSignupAverage || 0, 1) * 1.15,
        title: { display: true, text: "Members", color: "#737373" },
      },
      y: { ...chartOptions.scales.y, grid: { display: false } },
    },
  };
  const prescriptiveInsights = [
    {
      type: signupForecastDifference != null && signupForecastDifference < -1 ? "recommendation" : "positive",
      title: signupForecastDifference != null && signupForecastDifference < -1
        ? "Strengthen member acquisition"
        : signupForecastDifference != null && signupForecastDifference > 1
          ? "Prepare for member growth"
          : "Maintain the current growth pace",
      finding: recentSignupAverage == null
        ? `The forecast is about ${latestSignupForecast.toFixed(0)} new active members next month. There is not enough complete-month history to compare it with the recent pace.`
        : `The forecast is about ${latestSignupForecast.toFixed(0)} new active members next month, versus a recent average of ${recentSignupAverage.toFixed(0)} per month (${signupForecastDifference > 0 ? "+" : ""}${signupForecastDifference.toFixed(0)}).`,
      action: recentSignupAverage == null
        ? "Continue tracking new active members each month. Revisit acquisition plans after you have at least three complete months to compare."
        : signupForecastDifference < -1
          ? "Review where inquiries are coming from and where prospective members leave the sign-up process. Test referral or community outreach efforts, then compare next month's actual sign-ups with this forecast."
          : signupForecastDifference > 1
            ? "Run a time-limited joining offer or bring-a-friend promotion to build on the projected growth. Before launching, check trainer availability, onboarding schedules, and equipment capacity. Track promotion costs and new sign-ups to see whether it is working."
            : "Keep the acquisition channels that are working. Track sign-ups monthly and review the plan if actual growth starts to move away from this forecast.",
    },
    {
      type: "recommendation",
      title: "Check whether total membership is growing",
      finding: "This forecast counts people who sign up and become active. It does not subtract members who cancel or do not renew, so it cannot show whether the gym has more active members overall.",
      action: "At the end of each month, compare new sign-ups with the total number of active members, cancellations, and non-renewals. If sign-ups increase but active membership stays flat or falls, review why members are leaving and improve renewal follow-up.",
    },
  ];

  return (
    <div className="space-y-8">
      {fetchError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          ⚠️ {fetchError}
        </div>
      )}
      <header className="ave-page-hero relative overflow-hidden rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <div className="absolute -right-10 -top-14 h-48 w-48 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <BarChart3 size={24} />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Gym performance</p>
            <h1 className="mt-1 text-3xl font-black text-slate-900 dark:text-white">Analytics</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">A clear view of member growth, training activity, and fitness trends.</p>
          </div>
        </div>
      </header>
      <TrainingPulse audience="admin" />

      {/* Summary */}
      <section aria-label="Analytics summary" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Total members", value: data?.summary?.totalMembers, icon: <Users size={22} />, color: "text-orange-600 dark:text-orange-400", surface: "bg-orange-500/10" },
          { label: "Average BMI", value: data?.summary?.avgBmi, icon: <TrendingUp size={22} />, color: "text-green-600 dark:text-green-400", surface: "bg-green-500/10" },
          { label: "Workout plans", value: data?.summary?.totalWorkoutPlans, icon: <Dumbbell size={22} />, color: "text-violet-600 dark:text-violet-400", surface: "bg-violet-500/10" },
        ].map((s) => (
          <article key={s.label} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-white/10 dark:bg-[#111]">
            <div className={`mb-5 grid h-11 w-11 place-items-center rounded-xl ${s.surface} ${s.color}`}>{s.icon}</div>
            <div>
              <p className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">{s.value ?? "—"}</p>
              <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">{s.label}</p>
            </div>
            <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-orange-500/70 to-transparent opacity-0 transition group-hover:opacity-100" />
          </article>
        ))}
      </section>

      <section aria-labelledby="admin-system-usage-heading" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">Monitor gym attendance and workout activity</p>
          <h2 id="admin-system-usage-heading" className="mt-1 text-lg font-black text-slate-900 dark:text-white">Gym attendance and member activity</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Daily activity for the last 30 days. Active members are unique members with a real gym check-in or workout start; demo check-ins are excluded.
          </p>
        </div>
        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Gym check-ins", value: usageMonitoring?.summary.gymCheckIns, detail: "Recorded in the last 30 days", icon: <CalendarDays size={20} />, color: "text-orange-600 dark:text-orange-400", surface: "bg-orange-500/10" },
            { label: "Workout starts", value: usageMonitoring?.summary.workoutStarts, detail: "Recorded in the last 30 days", icon: <Dumbbell size={20} />, color: "text-blue-600 dark:text-blue-400", surface: "bg-blue-500/10" },
            { label: "Active members", value: usageMonitoring?.summary.activeMembers, detail: "Unique members with activity", icon: <Users size={20} />, color: "text-green-600 dark:text-green-400", surface: "bg-green-500/10" },
          ].map((item) => (
            <article key={item.label} className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
              <div className={`mb-3 grid h-10 w-10 place-items-center rounded-xl ${item.surface} ${item.color}`}>{item.icon}</div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{formatCount(item.value ?? 0)}</p>
              <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{item.label}</p>
              <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
            </article>
          ))}
        </div>
        <div role="img" aria-label="Daily gym check-ins, workout starts, and unique active members over the last 30 days" className="h-72">
          <Line data={usageTrendChart} options={chartOptions} />
        </div>
      </section>

      <section aria-labelledby="admin-predictive-analytics-heading" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><TrendingUp size={19} /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">Forward outlook</p>
            <h2 id="admin-predictive-analytics-heading" className="mt-1 text-lg font-black text-slate-900 dark:text-white">Predictive analytics</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Projects new active-member sign-ups for the next three months from the recent monthly sign-up trend.</p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">New active-member sign-up forecast</h3>
                <p className="mt-1 text-xs text-slate-500">Next month: about {latestSignupForecast.toFixed(0)} new active members</p>
              </div>
              <Target size={18} className="shrink-0 text-blue-500" />
            </div>
            {growthValues.length ? (
              <div className="h-72"><Line data={signupForecastChart} options={predictiveChartOptions} /></div>
            ) : (
              <p className="py-12 text-center text-sm text-slate-500">No member-growth history is available for forecasting.</p>
            )}
          </div>
        </div>

        <p className="mt-3 text-[10px] text-slate-500">This is a simple trend-based estimate of new sign-ups, not total net membership. Actual results may differ; compare it with future sign-up counts as new data is recorded.</p>
      </section>

      <section aria-labelledby="admin-prescriptive-analytics-heading" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400"><Sparkles size={19} /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">Recommended action</p>
            <h2 id="admin-prescriptive-analytics-heading" className="mt-1 text-lg font-black text-slate-900 dark:text-white">Prescriptive analytics</h2>
            <p className="mt-1 text-xs text-slate-500">Recommendations use projected new sign-ups compared with the recent monthly average.</p>
          </div>
        </div>
        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/50 sm:p-5">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">What could a promotion do?</h3>
            <p className="mt-1 text-xs text-slate-500">
              The predictive chart above estimates sign-ups from recent history. This example starts with that same forecast and shows what sign-ups might look like if a promotion brings in 10% more people: about {Math.round(acquisitionScenarioForecast[0] ?? 0)} next month instead of about {Math.round(latestSignupForecast)}.
            </p>
          </div>
          {growthValues.length ? (
            <div role="img" aria-label="Three-month new-member sign-up forecast compared with an example promotion scenario that adds ten percent" className="h-64 w-full">
              <Line data={acquisitionScenarioChart} options={predictiveChartOptions} />
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-white/10">
              Sign-up history is needed to show a growth scenario.
            </p>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            The 10% is only an example; the app does not yet track how promotions affect sign-ups. Compare actual campaign results with this scenario and update the estimate when you have promotion data.
          </p>
        </div>
        <div className="mb-5 grid gap-4">
          <div className="rounded-2xl border border-slate-200 p-4 dark:border-white/10">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Member growth: forecast vs recent sign-up average</h3>
            <p className="mt-1 text-xs text-slate-500">Recent average uses the previous three months, excluding the current partial month.</p>
            {recentSignupAverage != null ? (
              <div role="img" aria-label="Projected new active-member sign-ups compared with the recent monthly average" className="mt-3 h-48">
                <Bar data={prescriptiveSignupChart} options={prescriptiveSignupChartOptions} />
              </div>
            ) : (
              <p className="mt-3 py-8 text-center text-sm text-slate-500">More complete months of sign-up history are needed for a comparison.</p>
            )}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {prescriptiveInsights.map((insight) => (
            <article
              key={insight.title}
              className={`rounded-2xl border p-4 ${
                insight.type === "alert"
                  ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100"
                  : insight.type === "recommendation"
                    ? "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
              }`}
            >
              <h3 className="mb-2 flex items-center gap-2 font-bold">
                {insight.type === "alert" ? <AlertTriangle size={16} /> : <Sparkles size={16} />}
                {insight.title}
              </h3>
              <p className="text-sm leading-relaxed">{insight.finding}</p>
              <div className="mt-3 border-t border-current/15 pt-3">
                <p className="text-xs font-bold uppercase tracking-wide">Recommended next step</p>
                <p className="mt-1 text-sm leading-relaxed">{insight.action}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6" aria-labelledby="equipment-heading">
        <div className="mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">Equipment insights</p>
          <h2 id="equipment-heading" className="mt-1 text-lg font-black text-slate-900 dark:text-white">Most used equipment</h2>
          <p className="mt-1 text-xs text-slate-500">Equipment listed on exercises is ranked by its appearances in approved workout plans for the selected period.</p>
        </div>
        <form
          className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/[0.03]"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedEquipmentFilters({ day: equipmentDay, timePeriod: equipmentTimePeriod, period: equipmentPeriod });
          }}
        >
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Usage period
            <select
              value={equipmentPeriod}
              onChange={(event) => setEquipmentPeriod(event.target.value)}
              className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 dark:border-white/10 dark:bg-[#111] dark:text-slate-200"
            >
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Day
            <input
              type="date"
              value={equipmentDay}
              max={manilaDateString()}
              onChange={(event) => setEquipmentDay(event.target.value)}
              className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 dark:border-white/10 dark:bg-[#111] dark:text-slate-200"
            />
          </label>
          <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Workout time
            <select
              value={equipmentTimePeriod}
              onChange={(event) => setEquipmentTimePeriod(event.target.value)}
              className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 dark:border-white/10 dark:bg-[#111] dark:text-slate-200"
            >
              <option value="">All times</option>
              <option value="Morning">Morning (6:00 AM – 12:00 PM)</option>
              <option value="Afternoon">Afternoon (12:00 PM – 5:00 PM)</option>
              <option value="Evening">Evening (5:00 PM – 10:00 PM)</option>
              <option value="Flexible">Flexible (6:00 AM – 10:00 PM)</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={equipmentLoading}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-wait disabled:opacity-70"
          >
            <Filter size={15} /> {equipmentLoading ? "Applying..." : "Apply filters"}
          </button>
          {(equipmentDay || equipmentTimePeriod || equipmentPeriod !== "today") && (
            <button
              type="button"
              onClick={() => {
                setEquipmentDay("");
                setEquipmentTimePeriod("");
                setEquipmentPeriod("today");
                setAppliedEquipmentFilters({ day: "", timePeriod: "", period: "today" });
              }}
              className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10"
            >
              Clear
            </button>
          )}
        </form>
        {equipmentLoading && <p role="status" className="mb-4 text-xs text-slate-500">Updating equipment insights…</p>}
        {mostUsedEquipment.length ? (
          <>
            <div className="space-y-3" id="equipment-usage-list">
              {mostUsedEquipment.slice(0, showAllEquipment ? undefined : 5).map((item, index) => {
                const count = Number(item.count) || 0;
                return (
                  <div key={item.equipment} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-6 shrink-0 text-xs font-bold text-slate-400">{index + 1}.</span>
                      <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{item.equipment}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{count}</span>
                    <div className="col-span-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div
                        className="h-full rounded-full bg-orange-500"
                        style={{ width: `${maxEquipmentUsage > 0 ? (count / maxEquipmentUsage) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {mostUsedEquipment.length > 5 && (
              <button
                type="button"
                aria-expanded={showAllEquipment}
                aria-controls="equipment-usage-list"
                onClick={() => setShowAllEquipment((expanded) => !expanded)}
                className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 dark:border-white/10 dark:text-slate-200 dark:hover:border-orange-400/40 dark:hover:bg-orange-500/10 dark:hover:text-orange-300"
              >
                {showAllEquipment ? "Show top 5" : `See all ${mostUsedEquipment.length} equipment`}
                <ChevronDown size={16} className={`transition-transform ${showAllEquipment ? "rotate-180" : ""}`} />
              </button>
            )}
          </>
        ) : (
          <p className="py-8 text-center text-sm text-slate-500">No equipment has been added to the exercise catalog yet.</p>
        )}
      </section>

      <section aria-labelledby="gym-peak-heading" className="space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Activity insights</p>
          <h2 id="gym-peak-heading" className="mt-1 text-xl font-black text-slate-900 dark:text-white">Workout timing &amp; member trends</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            These are separate measures: recorded workout starts, active members&apos; preferred days, and new active-member sign-ups over the last six months. Start times use Philippines time.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            {
              label: "Most common start time",
              value: peakHourValue,
              detail: peakHourCount
                ? `${formatCount(peakHourCount)} recorded workout ${peakHourCount === 1 ? "start" : "starts"} · all time`
                : "No recorded workout starts yet",
              icon: Clock3,
            },
            {
              label: "Most selected workout day",
              value: peakDayValue,
              detail: peakDayCount
                ? `${formatCount(peakDayCount)} active ${peakDayCount === 1 ? "member prefers" : "members prefer"} this day`
                : "No active-member preferences yet",
              icon: CalendarDays,
            },
            {
              label: "Most sign-ups in a month",
              value: peakMonthValue,
              detail: peakMonthCount
                ? `${formatCount(peakMonthCount)} active ${peakMonthCount === 1 ? "member joined" : "members joined"}`
                : "No active-member sign-ups yet",
              icon: TrendingUp,
            },
          ].map(({ label, value, detail, icon: Icon }) => (
            <div key={label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111]">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400"><Icon size={20} /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 break-words text-lg font-black text-slate-900 dark:text-white">{value}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
            <h3 className="text-base font-black text-slate-900 dark:text-white">Recorded workout starts by hour</h3>
            <p className="mb-4 mt-1 text-xs text-slate-500">All recorded starts · Philippines time</p>
            {peakHours.some((row) => Number(row.count) > 0)
              ? <div className="h-72"><Bar data={peakHoursChart} options={countChartOptions("Workout starts")} /></div>
              : <p className="py-12 text-center text-sm text-slate-500">No workout starts have been recorded yet. Members can record time-in by starting a workout.</p>}
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
            <h3 className="text-base font-black text-slate-900 dark:text-white">Active-member sign-ups by month</h3>
            <p className="mb-4 mt-1 text-xs text-slate-500">New active members · latest six calendar months</p>
            {peakMonths.some((row) => Number(row.count) > 0)
              ? <div className="h-72"><Bar data={peakMonthsChart} options={countChartOptions("New active members")} /></div>
              : <p className="py-12 text-center text-sm text-slate-500">No new active-member sign-ups have been recorded in this period.</p>}
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
            <h3 className="text-base font-black text-slate-900 dark:text-white">Preferred workout days</h3>
            <p className="mb-4 mt-1 text-xs text-slate-500">Active members who selected each day · current preferences</p>
            {dayAvailability.some((row) => Number(row.count) > 0)
              ? <div className="h-72"><Bar data={dayAvailabilityChart} options={countChartOptions("Active members")} /></div>
              : <p className="py-12 text-center text-sm text-slate-500">No preferred workout-day availability has been recorded yet.</p>}
          </div>
        </div>
      </section>

      <section
        aria-labelledby="member-progress-heading"
        className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6"
      >
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">Member health</p>
        <h2 id="member-progress-heading" className="mt-1 text-lg font-black text-slate-900 dark:text-white">Member weight progress</h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">
          Monthly average of each active member&apos;s latest weight check-in compared with their goal weight, from January through the current month.
        </p>
        {memberProgress.some((row) => Number(row.member_count) > 0)
          ? <div className="h-72"><Line data={memberProgressChart} options={weightProgressChartOptions} /></div>
          : <p className="py-12 text-center text-sm text-slate-500">No member progress check-ins have been recorded this year.</p>}
      </section>

      <section
        aria-labelledby="monthly-workout-progress-heading"
        className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6"
      >
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">Training activity</p>
        <h2 id="monthly-workout-progress-heading" className="mt-1 text-lg font-black text-slate-900 dark:text-white">Workout progress by month</h2>
        <p className="mb-4 mt-1 text-xs text-slate-500">
          Approved exercise entries completed versus not completed from January through December. Future workout dates remain planned.
        </p>
        {monthlyWorkoutProgress.some((row) => Number(row.planned_exercises) > 0)
          ? <div className="h-72"><Bar data={monthlyWorkoutProgressChart} options={monthlyWorkoutProgressChartOptions} /></div>
          : <p className="py-12 text-center text-sm text-slate-500">No workout plans have been scheduled this year.</p>}
      </section>

      {/* Charts Row 1 */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
        <h3 className="mb-4 text-base font-black text-slate-900 dark:text-white">Member growth</h3>
        {memberGrowthChart.labels.length > 0
          ? <div className="h-72"><Line data={memberGrowthChart} options={chartOptions} /></div>
          : <p className="py-12 text-center text-sm text-slate-500">No member growth data available yet.</p>}
      </div>

      {/* Charts Row 2 */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
        <h3 className="mb-4 text-base font-black text-slate-900 dark:text-white">Completed sessions by weekday</h3>
        {attendanceChart.labels.length > 0
          ? <div className="h-72"><Bar data={attendanceChart} options={chartOptions} /></div>
          : <p className="py-12 text-center text-sm text-slate-500">No completed sessions yet.</p>}
      </div>

      {/* BMI Distribution */}
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">Member health</p>
        <h3 className="mb-4 mt-1 text-lg font-black text-slate-900 dark:text-white">BMI distribution</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Underweight", range: "< 18.5", color: "bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-400/20" },
            { label: "Normal", range: "18.5 – 24.9", color: "bg-green-50 text-green-800 ring-green-200 dark:bg-green-500/10 dark:text-green-300 dark:ring-green-400/20" },
            { label: "Overweight", range: "25 – 29.9", color: "bg-yellow-50 text-yellow-800 ring-yellow-200 dark:bg-yellow-500/10 dark:text-yellow-300 dark:ring-yellow-400/20" },
            { label: "Obese", range: "≥ 30", color: "bg-red-50 text-red-800 ring-red-200 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20" },
          ].map((item) => (
            <div key={item.label} className={`rounded-2xl p-4 text-center ring-1 ring-inset ${item.color}`}>
              <p className="text-3xl font-black tracking-tight">{bmiMap[item.label] ?? 0}</p>
              <p className="mt-1 text-sm font-bold">{item.label}</p>
              <p className="mt-0.5 text-xs opacity-70">BMI {item.range}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}