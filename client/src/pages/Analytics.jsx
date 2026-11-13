import { useEffect, useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import { Line, Bar } from "react-chartjs-2";
import { Users, TrendingUp, Dumbbell, Clock3, CalendarDays, Filter, BarChart3, ChevronDown } from "lucide-react";
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

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [equipmentDay, setEquipmentDay] = useState("");
  const [equipmentTimePeriod, setEquipmentTimePeriod] = useState("");
  const [equipmentPeriod, setEquipmentPeriod] = useState("today");
  const [showAllEquipment, setShowAllEquipment] = useState(false);
  const [appliedEquipmentFilters, setAppliedEquipmentFilters] = useState({ day: "", timePeriod: "", period: "today" });

  useEffect(() => {
    let active = true;
    const fetchAnalytics = () => {
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
          if (active) setLoading(false);
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
  const dayAvailability = data?.dayAvailability || [];
  const mostUsedEquipment = data?.mostUsedEquipment || [];
  const peakDayValue = getPeakLabel(dayAvailability, (row) => row.day);
  const peakMonthValue = getPeakLabel(peakMonths, (row) => row.label);

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
          <button type="submit" className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-orange-500 px-4 text-sm font-bold text-white transition hover:bg-orange-600">
            <Filter size={15} /> Apply filters
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
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">When members train</p>
          <h2 id="gym-peak-heading" className="mt-1 text-xl font-black text-slate-900 dark:text-white">Gym peak activity</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Workout start times use Philippines time. Weekdays count active members&apos; preferred workout days, and monthly peaks reflect new active-member sign-ups over the latest six calendar months.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[
            { label: "Busiest hour", value: peakHourValue, icon: Clock3 },
            { label: "Busiest day", value: peakDayValue, icon: CalendarDays },
            { label: "Busiest month", value: peakMonthValue, icon: TrendingUp },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111]">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400"><Icon size={20} /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 break-words text-lg font-black text-slate-900 dark:text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
            <h3 className="text-base font-black text-slate-900 dark:text-white">Workout starts by hour</h3>
            <p className="mb-4 mt-1 text-xs text-slate-500">Member time-in / start time · Philippines time</p>
            {peakHours.some((row) => Number(row.count) > 0)
              ? <div className="h-72"><Bar data={peakHoursChart} options={chartOptions} /></div>
              : <p className="py-12 text-center text-sm text-slate-500">No workout starts have been recorded yet. Members can record time-in by starting a workout.</p>}
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
            <h3 className="text-base font-black text-slate-900 dark:text-white">New active members by month</h3>
            <p className="mb-4 mt-1 text-xs text-slate-500">Monthly member growth · latest six calendar months</p>
            {peakMonths.some((row) => Number(row.count) > 0)
              ? <div className="h-72"><Bar data={peakMonthsChart} options={chartOptions} /></div>
              : <p className="py-12 text-center text-sm text-slate-500">No new active-member sign-ups have been recorded in this period.</p>}
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
            <h3 className="text-base font-black text-slate-900 dark:text-white">Member availability by weekday</h3>
            <p className="mb-4 mt-1 text-xs text-slate-500">Number of active members who selected each preferred workout day</p>
            {dayAvailability.some((row) => Number(row.count) > 0)
              ? <div className="h-72"><Bar data={dayAvailabilityChart} options={chartOptions} /></div>
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