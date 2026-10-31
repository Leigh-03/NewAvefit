import { useEffect, useState } from "react";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import { Line, Bar, Doughnut } from "react-chartjs-2";
import { Users, TrendingUp, Dumbbell, Clock3, CalendarDays, Filter } from "lucide-react";
import api from "../services/api";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Title, Tooltip, Legend, Filler);

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: { position: "top", labels: { color: "#737373", usePointStyle: true, padding: 20 } } },
  scales: {
    y: { beginAtZero: true, grid: { color: "rgba(148,163,184,0.15)" }, ticks: { color: "#737373" } },
    x: { grid: { display: false }, ticks: { color: "#737373" } },
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
  const [appliedEquipmentFilters, setAppliedEquipmentFilters] = useState({ day: "", timePeriod: "" });

  useEffect(() => {
    let active = true;
    const fetchAnalytics = () => {
      const params = {};
      if (appliedEquipmentFilters.day) params.equipment_day = appliedEquipmentFilters.day;
      if (appliedEquipmentFilters.timePeriod) params.equipment_time_period = appliedEquipmentFilters.timePeriod;
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
      <div className="space-y-6">
        <header className="ave-page-hero rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Gym performance</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Analytics</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">A clear view of member growth, training activity, and fitness trends.</p>
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

  const goalChart = {
    labels: data?.goalDistribution.map((g) => g.goal) || [],
    datasets: [{
      data: data?.goalDistribution.map((g) => parseInt(g.count)) || [],
      backgroundColor: COLORS, borderWidth: 0,
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
    <div className="space-y-6">
      {fetchError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          ⚠️ {fetchError}
        </div>
      )}
      <header className="ave-page-hero rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Gym performance</p>
        <h1 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Analytics</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">A clear view of member growth, training activity, and fitness trends.</p>
      </header>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Total members", value: data?.summary?.totalMembers, icon: <Users size={22} />, color: "text-orange-600 dark:text-orange-400", surface: "bg-orange-500/10" },
          { label: "Average BMI", value: data?.summary?.avgBmi, icon: <TrendingUp size={22} />, color: "text-green-600 dark:text-green-400", surface: "bg-green-500/10" },
          { label: "Workout plans", value: data?.summary?.totalWorkoutPlans, icon: <Dumbbell size={22} />, color: "text-violet-600 dark:text-violet-400", surface: "bg-violet-500/10" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111]">
            <div className={`${s.surface} ${s.color} flex-shrink-0 rounded-xl p-3`}>{s.icon}</div>
            <div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{s.value ?? "—"}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111]" aria-labelledby="equipment-heading">
        <div className="mb-4">
          <h2 id="equipment-heading" className="text-base font-bold text-slate-900 dark:text-white">Most used equipment</h2>
          <p className="mt-1 text-xs text-slate-500">Equipment from completed member workouts, ranked by use. Refreshes automatically every hour.</p>
        </div>
        <form
          className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedEquipmentFilters({ day: equipmentDay, timePeriod: equipmentTimePeriod });
          }}
        >
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
          {(equipmentDay || equipmentTimePeriod) && (
            <button
              type="button"
              onClick={() => {
                setEquipmentDay("");
                setEquipmentTimePeriod("");
                setAppliedEquipmentFilters({ day: "", timePeriod: "" });
              }}
              className="min-h-10 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-white/10"
            >
              Clear
            </button>
          )}
        </form>
        {mostUsedEquipment.length ? (
          <div className="space-y-3">
            {mostUsedEquipment.map((item, index) => {
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
        ) : (
          <p className="py-8 text-center text-sm text-slate-500">No equipment usage is recorded in assigned workout sessions yet.</p>
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
            <div key={label} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111]">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400"><Icon size={20} /></span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 break-words text-lg font-black text-slate-900 dark:text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111]">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Workout starts by hour</h3>
            <p className="mb-4 mt-1 text-xs text-slate-500">Member time-in / start time · Philippines time</p>
            {peakHours.some((row) => Number(row.count) > 0)
              ? <div className="h-72"><Bar data={peakHoursChart} options={chartOptions} /></div>
              : <p className="py-12 text-center text-sm text-slate-500">No workout starts have been recorded yet. Members can record time-in by starting a workout.</p>}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111]">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">New active members by month</h3>
            <p className="mb-4 mt-1 text-xs text-slate-500">Monthly member growth · latest six calendar months</p>
            {peakMonths.some((row) => Number(row.count) > 0)
              ? <div className="h-72"><Bar data={peakMonthsChart} options={chartOptions} /></div>
              : <p className="py-12 text-center text-sm text-slate-500">No new active-member sign-ups have been recorded in this period.</p>}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111]">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Member availability by weekday</h3>
            <p className="mb-4 mt-1 text-xs text-slate-500">Number of active members who selected each preferred workout day</p>
            {dayAvailability.some((row) => Number(row.count) > 0)
              ? <div className="h-72"><Bar data={dayAvailabilityChart} options={chartOptions} /></div>
              : <p className="py-12 text-center text-sm text-slate-500">No preferred workout-day availability has been recorded yet.</p>}
          </div>
        </div>
      </section>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] xl:col-span-2">
          <h3 className="mb-4 text-base font-bold text-slate-900 dark:text-white">Member growth</h3>
          {memberGrowthChart.labels.length > 0
            ? <div className="h-72"><Line data={memberGrowthChart} options={chartOptions} /></div>
            : <p className="py-12 text-center text-sm text-slate-500">No member growth data available yet.</p>}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111]">
          <h3 className="mb-4 text-base font-bold text-slate-900 dark:text-white">Goal distribution</h3>
          {goalChart.labels.length > 0
            ? <div className="h-72"><Doughnut data={goalChart} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { color: "#737373" } } } }} /></div>
            : <p className="py-12 text-center text-sm text-slate-500">No member goals recorded yet.</p>}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111]">
        <h3 className="mb-4 text-base font-bold text-slate-900 dark:text-white">Completed sessions by weekday</h3>
        {attendanceChart.labels.length > 0
          ? <div className="h-72"><Bar data={attendanceChart} options={chartOptions} /></div>
          : <p className="py-12 text-center text-sm text-slate-500">No completed sessions yet.</p>}
      </div>

      {/* BMI Distribution */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111]">
        <h3 className="mb-4 text-base font-bold text-slate-900 dark:text-white">BMI distribution</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Underweight", range: "< 18.5", color: "bg-orange-100 text-orange-700" },
            { label: "Normal", range: "18.5 – 24.9", color: "bg-green-100 text-green-700" },
            { label: "Overweight", range: "25 – 29.9", color: "bg-yellow-100 text-yellow-700" },
            { label: "Obese", range: "≥ 30", color: "bg-red-100 text-red-700" },
          ].map((item) => (
            <div key={item.label} className={`rounded-xl p-4 text-center ${item.color}`}>
              <p className="text-3xl font-bold">{bmiMap[item.label] ?? 0}</p>
              <p className="font-semibold text-sm mt-1">{item.label}</p>
              <p className="text-xs opacity-70 mt-0.5">BMI {item.range}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}