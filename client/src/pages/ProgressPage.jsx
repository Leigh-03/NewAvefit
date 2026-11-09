import { useCallback, useEffect, useRef, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from "chart.js";
import { Line } from "react-chartjs-2";
import { Activity, ArrowDownRight, ArrowUpRight, Calendar, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Scale, Target } from "lucide-react";
import userApi from "../userApi";
import GoalRenewalModal from "../components/progress/GoalRenewalModal";
import { useUserAuth } from "../context/UserAuthContext";
import { formatPhilippinesDate, philippinesDateKey, philippinesDateString, philippinesMondayString } from "../utils/philippinesDate";
import { getWorkoutDayGroups } from "../utils/workoutSessions";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const addDateDays = (dateKey, amount) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
};

const formatDateInput = (dateKey) => {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
};

const shiftMonth = (monthKey, amount) => {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + amount, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

function AnalyticsDatePicker({
  from,
  to,
  today,
  selectingEnd,
  month,
  onMonthChange,
  onSelect,
  onPreset,
}) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const leadingDays = firstDay.getUTCDay();
  const dates = [
    ...Array.from({ length: leadingDays }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => (
      `${month}-${String(index + 1).padStart(2, "0")}`
    )),
  ];
  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(firstDay);

  const isDisabled = (date) => (
    selectingEnd
      ? date <= from || date > today
      : date >= today
  );
  const choosePreset = (preset) => {
    let start;
    if (preset === "week") {
      const monday = philippinesMondayString();
      start = monday < today ? monday : addDateDays(today, -7);
    } else if (preset === "month") {
      const firstOfMonth = `${today.slice(0, 7)}-01`;
      start = firstOfMonth < today ? firstOfMonth : addDateDays(today, -1);
    } else {
      const firstOfYear = `${today.slice(0, 4)}-01-01`;
      start = firstOfYear < today ? firstOfYear : addDateDays(today, -1);
    }
    onPreset(start, today);
  };

  return (
    <div
      role="dialog"
      aria-label="Choose analytics date range"
      className="absolute right-0 top-full z-30 mt-2 w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-[#151515]"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-slate-900 dark:text-white">
          {selectingEnd ? "Select end date" : "Select start date"}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ChevronLeft size={17} />
          </button>
          <span className="min-w-28 text-center text-xs font-semibold text-slate-700 dark:text-slate-200">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            aria-label="Next month"
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-semibold uppercase text-slate-400">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <span key={day} className="py-1">{day}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dates.map((date, index) => {
          if (!date) return <span key={`empty-${index}`} />;
          const disabled = isDisabled(date);
          const isSelected = date === from || date === to;
          const isInRange = date >= from && date <= to;
          return (
            <button
              key={date}
              type="button"
              onClick={() => !disabled && onSelect(date)}
              disabled={disabled}
              aria-label={formatDateInput(date)}
              aria-pressed={isSelected}
              className={`grid aspect-square place-items-center rounded-lg text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                isSelected
                  ? "bg-orange-500 font-bold text-white"
                  : isInRange
                    ? "bg-orange-500/10 text-orange-700 dark:text-orange-300"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
              } disabled:cursor-not-allowed disabled:opacity-30`}
            >
              {Number(date.slice(-2))}
            </button>
          );
        })}
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3 dark:border-white/10">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Quick range</p>
        <div className="grid grid-cols-3 gap-2">
          {[
            ["week", "This week"],
            ["month", "This month"],
            ["year", "This year"],
          ].map(([preset, label]) => (
            <button
              key={preset}
              type="button"
              onClick={() => choosePreset(preset)}
              className="rounded-lg border border-slate-200 px-2 py-2 text-[11px] font-semibold text-slate-600 transition hover:border-orange-400 hover:text-orange-600 dark:border-white/10 dark:text-slate-300 dark:hover:text-orange-400"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const weightInput = (val, prev = "") => {
  const cleaned = String(val || "").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
  if (!cleaned) return "";
  const num = Number(cleaned);
  if (!(num > 0) || num > 200) return prev;
  return cleaned;
};

export default function ProgressPage() {
  const { user, updateUser } = useUserAuth();
  const [logs, setLogs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [analyticsFrom, setAnalyticsFrom] = useState(() => addDateDays(philippinesDateString(), -7));
  const [analyticsTo, setAnalyticsTo] = useState(() => philippinesDateString());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectingEnd, setSelectingEnd] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => philippinesDateString().slice(0, 7));
  const datePickerRef = useRef(null);

  // Log form
  const [logForm, setLogForm] = useState({ weight: "", bmi: "" });
  const [logging, setLogging] = useState(false);
  const [logMsg, setLogMsg] = useState("");
  const [logError, setLogError] = useState("");
  const [goalRenewalSaving, setGoalRenewalSaving] = useState(false);
  const [goalRenewalError, setGoalRenewalError] = useState("");

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [progressRes, workoutsRes, profileRes] = await Promise.all([
        userApi.get("/progress"),
        userApi.get("/workouts"),
        userApi.get("/profile"),
      ]);
      setLogs(progressRes.data.data || []);
      setSessions(workoutsRes.data.data || []);
      setProfile(profileRes.data.data || null);
    } catch (err) {
      console.error(err);
      setLoadError(err.response?.data?.message || "Unable to load your progress right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  useEffect(() => {
    if (!datePickerOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!datePickerRef.current?.contains(event.target)) setDatePickerOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setDatePickerOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [datePickerOpen]);

  // Auto-calc BMI when weight changes
  const handleWeightChange = (val) => {
    const cleaned = weightInput(val, logForm.weight);
    setLogForm((f) => {
      const h = parseFloat(user?.height);
      let bmi = "";
      if (h && cleaned) {
        const hm = h / 100;
        bmi = (parseFloat(cleaned) / (hm * hm)).toFixed(1);
      }
      return { ...f, weight: cleaned, bmi };
    });
  };

  const handleLogProgress = async () => {
    const w = Number(logForm.weight);
    if (!logForm.weight || !Number.isFinite(w) || w < 20 || w > 200) {
      setLogError("Weight must be between 20 kg and 200 kg.");
      return;
    }
    setLogError("");
    setLogging(true);
    try {
      await userApi.post("/progress", logForm);
      setLogMsg("Progress logged!");
      setLogForm({ weight: "", bmi: "" });
      await fetchProgress();
      setTimeout(() => setLogMsg(""), 3000);
    } catch (err) {
      console.error(err);
      setLoadError(err.response?.data?.message || "Unable to save your progress. Please try again.");
    } finally {
      setLogging(false);
    }
  };

  const handleGoalRenewalSave = async (fitnessGoal, nextTargetWeight) => {
    setGoalRenewalSaving(true);
    setGoalRenewalError("");
    try {
      const response = await userApi.put("/profile/goal", {
        fitness_goal: fitnessGoal,
        target_weight: nextTargetWeight,
      });
      const updatedGoal = response.data.data;
      setProfile((current) => ({ ...current, ...updatedGoal }));
      updateUser(updatedGoal);
    } catch (error) {
      console.error("Goal renewal save failed:", error);
      setGoalRenewalError(error.response?.data?.message || "Unable to save your new goal. Please try again.");
    } finally {
      setGoalRenewalSaving(false);
    }
  };

  const logWeightValue = logForm.weight;
  const logWeightError = logWeightValue !== "" && logWeightValue != null
    ? Number(logWeightValue) < 20 || Number(logWeightValue) > 200
      ? "Weight must be between 20 and 200 kg."
      : ""
    : "";

  const createTrendChartOptions = (values, unit, minimumPadding) => {
    const numericValues = values.filter((value) => Number.isFinite(value));
    const dataMin = numericValues.length ? Math.min(...numericValues) : 0;
    const dataMax = numericValues.length ? Math.max(...numericValues) : 1;
    const padding = Math.max((dataMax - dataMin) * 0.15, minimumPadding);
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: "index" },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#111827",
          titleColor: "#f8fafc",
          bodyColor: "#e2e8f0",
          padding: 10,
          displayColors: false,
          callbacks: {
            label: (context) => `${Number(context.parsed.y).toFixed(1)} ${unit}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: false,
          min: numericValues.length ? Math.max(0, dataMin - padding) : undefined,
          max: numericValues.length ? dataMax + padding : undefined,
          border: { display: false },
          grid: { color: "rgba(148,163,184,0.12)", drawTicks: false },
          ticks: {
            color: "#94a3b8",
            padding: 8,
            maxTicksLimit: 5,
            callback: (value) => Number(value).toFixed(1),
          },
        },
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: { color: "#94a3b8", padding: 8, maxTicksLimit: 7, autoSkip: true },
        },
      },
    };
  };

  const latestLog = logs[logs.length - 1];
  const latestWeightedLog = [...logs].reverse().find((log) => log.weight != null && Number.isFinite(Number(log.weight)));
  const firstWeightedLog = logs.find((log) => Number.isFinite(Number(log.weight)) && log.weight !== null);
  const latestWeight = latestWeightedLog?.weight == null ? null : Number(latestWeightedLog.weight);
  const firstWeight = firstWeightedLog?.weight == null ? null : Number(firstWeightedLog.weight);
  const weightChange = latestWeight !== null && firstWeight !== null
    ? Number((latestWeight - firstWeight).toFixed(1))
    : null;
  const targetWeight = profile?.target_weight == null ? null : Number(profile.target_weight);
  const goal = profile?.fitness_goal || "Your fitness goal";
  const goalWeight = latestWeight ?? (profile?.weight == null ? null : Number(profile.weight));
  const goalDirection = /lose|loss|reduce/i.test(goal) ? "loss" : /gain|muscle/i.test(goal) ? "gain" : "maintain";
  const goalAchieved = !loading && goalWeight !== null && targetWeight !== null &&
    Number.isFinite(goalWeight) && Number.isFinite(targetWeight) &&
    ((goal === "Weight Loss" && goalWeight <= targetWeight) ||
      (goal === "Gain Weight" && goalWeight >= targetWeight));
  const goalChange = weightChange === null ? null : goalDirection === "loss" ? -weightChange : weightChange;
  const goalProgress = goalDirection !== "maintain" && goalChange !== null && Number.isFinite(targetWeight) && targetWeight > 0 && firstWeight !== null && firstWeight !== targetWeight
    ? Math.max(0, Math.min(100, (goalChange / Math.abs(firstWeight - targetWeight)) * 100))
    : null;
  const formattedGoalProgress = goalProgress === null ? null : `${goalProgress.toFixed(1)}%`;

  const today = philippinesDateString();
  const analyticsRange = { start: analyticsFrom, end: analyticsTo };
  const periodLogs = logs.filter((log) => {
    const date = philippinesDateKey(log.log_date);
    return date && date >= analyticsRange.start && date <= analyticsRange.end;
  });
  const periodWeightedLogs = periodLogs.filter((log) => log.weight != null && Number.isFinite(Number(log.weight)));
  const periodWeightChange = periodWeightedLogs.length > 1
    ? Number((Number(periodWeightedLogs[periodWeightedLogs.length - 1].weight) - Number(periodWeightedLogs[0].weight)).toFixed(1))
    : null;
  const workoutDayGroups = getWorkoutDayGroups(sessions);
  const completedWorkoutDays = workoutDayGroups.filter((group) => group.isComplete);
  const periodScheduledWorkouts = sessions.filter((session) => {
    const date = philippinesDateKey(session.session_date);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      date >= analyticsRange.start &&
      date <= analyticsRange.end &&
      date <= today;
  });
  const periodCompletedScheduledWorkouts = periodScheduledWorkouts.filter((session) => session.completed).length;
  const periodWorkoutRate = periodScheduledWorkouts.length
    ? Math.round((periodCompletedScheduledWorkouts / periodScheduledWorkouts.length) * 100)
    : null;

  const chartData = {
    labels: periodLogs.map((l) => formatPhilippinesDate(l.log_date, { month: "short", day: "numeric" })),
    datasets: [
      {
        label: "Weight (kg)",
        data: periodLogs.map((l) => l.weight ? parseFloat(l.weight) : null),
        borderColor: "#f97316",
        backgroundColor: "rgba(249,115,22,0.1)",
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: "#f97316",
        pointBorderColor: "#111827",
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
    ],
  };

  const bmiChart = {
    labels: periodLogs.map((l) => formatPhilippinesDate(l.log_date, { month: "short", day: "numeric" })),
    datasets: [
      {
        label: "BMI",
        data: periodLogs.map((l) => l.bmi ? parseFloat(l.bmi) : null),
        borderColor: "#fb923c",
        backgroundColor: "rgba(251,146,60,0.1)",
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: "#fb923c",
        pointBorderColor: "#111827",
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
    ],
  };
  const weightChartOptions = createTrendChartOptions(
    chartData.datasets[0].data,
    "kg",
    2
  );
  const bmiChartOptions = createTrendChartOptions(
    bmiChart.datasets[0].data,
    "BMI",
    1
  );

  const weekStartString = philippinesMondayString();
  const scheduledThisWeek = workoutDayGroups.filter((group) => (
    group.scheduledDate >= weekStartString && group.scheduledDate <= today
  ));
  const completedThisWeek = completedWorkoutDays.filter((group) => (
    group.completionDate >= weekStartString && group.completionDate <= today
  ));
  const weeklyTarget = Number(profile?.workout_days_per_week) ||
    (Array.isArray(profile?.preferred_days) ? profile.preferred_days.length : 0);
  const workoutRate = scheduledThisWeek.length
    ? Math.round((completedThisWeek.length / scheduledThisWeek.length) * 100)
    : null;

  return (
    <div className="min-h-screen bg-[#fffaf5] text-slate-900 dark:bg-[#080808] dark:text-white">
      {/* Header */}
      <div className="mx-auto max-w-[1440px] px-4 pt-8 sm:px-6 sm:pt-10">
        <div className="ave-page-hero border-b border-orange-100 pb-6 dark:border-white/5 sm:pb-7">
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Your Progress</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your training, body metrics, and progress toward your goals in one place.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] space-y-6 px-4 py-5 sm:px-6 sm:py-6">
        {loadError && (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Loading progress analytics">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl bg-white dark:bg-[#111]" />
            ))}
          </div>
        ) : (
          <>
            <section aria-label="Progress analytics" className="rounded-3xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white">Progress analytics</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatPhilippinesDate(analyticsRange.start, { month: "short", day: "numeric", year: "numeric" })}
                    {" – "}
                    {formatPhilippinesDate(analyticsRange.end, { month: "short", day: "numeric", year: "numeric" })}
                    {" · Philippines time"}
                  </p>
                </div>
                <div ref={datePickerRef} className="relative sm:min-w-[360px]">
                  <span className="mb-1 block text-[11px] font-semibold text-slate-500">Date range</span>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-expanded={datePickerOpen}
                    onClick={() => {
                      setCalendarMonth(analyticsFrom.slice(0, 7));
                      setSelectingEnd(false);
                      setDatePickerOpen((current) => !current);
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-xs font-semibold text-slate-800 transition hover:border-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-white/10 dark:bg-[#111] dark:text-slate-200"
                  >
                    <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                      <span><span className="mr-2 text-slate-400">From</span>{formatDateInput(analyticsFrom)}</span>
                      <span aria-hidden="true" className="text-slate-400">–</span>
                      <span><span className="mr-2 text-slate-400">To</span>{formatDateInput(analyticsTo)}</span>
                    </span>
                    <CalendarDays size={16} className="shrink-0 text-slate-400" />
                  </button>
                  {datePickerOpen && (
                    <AnalyticsDatePicker
                      from={analyticsFrom}
                      to={analyticsTo}
                      today={today}
                      selectingEnd={selectingEnd}
                      month={calendarMonth}
                      onMonthChange={setCalendarMonth}
                      onSelect={(date) => {
                        if (!selectingEnd) {
                          setAnalyticsFrom(date);
                          if (analyticsTo <= date) setAnalyticsTo(today);
                          setSelectingEnd(true);
                        } else {
                          setAnalyticsTo(date);
                          setSelectingEnd(false);
                          setDatePickerOpen(false);
                        }
                      }}
                      onPreset={(start, end) => {
                        setAnalyticsFrom(start);
                        setAnalyticsTo(end);
                        setSelectingEnd(false);
                        setDatePickerOpen(false);
                      }}
                    />
                  )}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
                <div className="min-h-[92px] rounded-2xl bg-slate-50 p-4 dark:bg-[#151515]">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{periodLogs.length}</p>
                  <p className="text-[11px] leading-snug text-slate-500">Progress check-ins</p>
                </div>
                <div className="min-h-[92px] rounded-2xl bg-slate-50 p-4 dark:bg-[#151515]">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {periodWeightChange == null ? "—" : `${periodWeightChange > 0 ? "+" : ""}${periodWeightChange} kg`}
                  </p>
                  <p className="text-[11px] leading-snug text-slate-500">Weight change</p>
                </div>
                <div className="min-h-[92px] rounded-2xl bg-slate-50 p-4 dark:bg-[#151515]">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{periodWorkoutRate == null ? "—" : `${periodWorkoutRate}%`}</p>
                  <p className="text-[11px] leading-snug text-slate-500">Workout completion</p>
                  <p className="mt-1 text-[10px] leading-snug text-slate-500">
                    {periodScheduledWorkouts.length
                      ? `${periodCompletedScheduledWorkouts} of ${periodScheduledWorkouts.length} workouts completed`
                      : "No scheduled workouts in this date range"}
                  </p>
                </div>
              </div>

              {periodLogs.length > 0 ? (
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-[#151515] sm:p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Weight trend</h3>
                        <p className="mt-0.5 text-[11px] text-slate-500">Your recorded body weight</p>
                      </div>
                      <span className="rounded-lg bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-700 dark:text-orange-300">kg</span>
                    </div>
                    <div className="h-56 w-full sm:h-64">
                      <Line data={chartData} options={weightChartOptions} />
                    </div>
                    {periodWeightedLogs.length === 1 && (
                      <p className="mt-2 text-center text-[11px] text-slate-500">Log another check-in to see your weight trend.</p>
                    )}
                  </section>
                  {periodLogs.some((log) => log.bmi != null) && (
                    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-[#151515] sm:p-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">BMI trend</h3>
                          <p className="mt-0.5 text-[11px] text-slate-500">Your recorded body mass index</p>
                        </div>
                        <span className="rounded-lg bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-700 dark:text-orange-300">BMI</span>
                      </div>
                      <div className="h-56 w-full sm:h-64">
                        <Line data={bmiChart} options={bmiChartOptions} />
                      </div>
                      {periodLogs.filter((log) => log.bmi != null).length === 1 && (
                        <p className="mt-2 text-center text-[11px] text-slate-500">Log another check-in to see your BMI trend.</p>
                      )}
                    </section>
                  )}
                </div>
              ) : (
                <div className="mt-5 flex min-h-[164px] flex-col items-center justify-center rounded-2xl border border-dashed border-orange-200 px-4 py-8 text-center dark:border-white/10">
                  <Activity size={22} className="mx-auto mb-2 text-orange-500" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No check-ins in this period</p>
                  <p className="mt-1 text-xs text-slate-500">Log a measurement during this period to see your trends here.</p>
                </div>
              )}
            </section>

            <section aria-label="Progress overview" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-[#111]">
                <Scale size={19} className="mb-3 text-orange-500" />
                <p className="text-2xl font-black">{latestWeight !== null ? `${latestWeight} kg` : "—"}</p>
                <p className="mt-1 text-xs text-slate-500">Latest weight</p>
                {weightChange !== null && (
                  <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-slate-500">
                    {weightChange < 0 ? <ArrowDownRight size={14} /> : weightChange > 0 ? <ArrowUpRight size={14} /> : null}
                    {weightChange > 0 ? "+" : ""}{weightChange} kg since first log
                  </p>
                )}
              </div>
              <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-[#111]">
                <Activity size={19} className="mb-3 text-orange-500" />
                <p className="text-2xl font-black">{latestLog?.bmi ?? "—"}</p>
                <p className="mt-1 text-xs text-slate-500">Latest BMI</p>
                <p className="mt-2 text-xs text-slate-500">{logs.length} body {logs.length === 1 ? "measurement" : "measurements"} logged</p>
              </div>
              <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-[#111]">
                <CheckCircle2 size={19} className="mb-3 text-orange-500" />
                <p className="text-2xl font-black">{completedThisWeek.length}</p>
                <p className="mt-1 text-xs text-slate-500">Workout days completed this week</p>
                <p className="mt-2 text-xs text-slate-500">
                  {weeklyTarget ? `Goal: ${weeklyTarget} per week` : `${completedWorkoutDays.length} completed all time`}
                </p>
              </div>
              <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-[#111]">
                <Calendar size={19} className="mb-3 text-orange-500" />
                <p className="text-2xl font-black">{workoutRate === null ? "—" : `${workoutRate}%`}</p>
                <p className="mt-1 text-xs text-slate-500">Weekly workout completion</p>
                <p className="mt-2 text-xs text-slate-500">
                  {scheduledThisWeek.length ? `${completedThisWeek.length} of ${scheduledThisWeek.length} scheduled` : "No dated workouts scheduled this week"}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Target size={19} className="text-orange-500" />
                    <h2 className="font-bold">Goal progress</h2>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {goal}{Number.isFinite(targetWeight) && targetWeight > 0 ? ` · Target ${targetWeight} kg` : ""}
                  </p>
                </div>
                {formattedGoalProgress !== null && <span className="text-sm font-bold text-orange-500">{formattedGoalProgress}</span>}
              </div>
              {goalProgress !== null ? (
                <div className="mt-4">
                  <div
                    role="progressbar"
                    aria-label="Weight goal progress"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={goalProgress}
                    className="h-2 overflow-hidden rounded-full bg-orange-50 dark:bg-white/10"
                  >
                    <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${goalProgress}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {Math.abs(latestWeight - targetWeight).toFixed(1)} kg to target from your latest log
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-500">
                  {logs.length < 2
                    ? "Log at least two weights to see your trend toward your goal."
                    : "Add a target weight in your profile to track goal progress here."}
                </p>
              )}
            </section>
          </>
        )}

        {/* Log Progress */}
        <div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111]">
          <h2 className="font-bold text-slate-900 dark:text-white mb-1">Log today's progress</h2>
          <p className="mb-4 text-xs text-slate-500">Regular check-ins help you understand your progress over time.</p>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Weight (kg)</label>
              <input type="number" min="20" max="200" step="0.1" value={logForm.weight}
                onChange={(e) => handleWeightChange(e.target.value)}
                placeholder="e.g. 72.5"
                aria-invalid={!!logWeightError}
                className={`w-full bg-slate-50 border rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:ring-2 ${logWeightError ? "border-red-400 focus:ring-red-300" : "border-slate-200 focus:ring-orange-500"}`} />
              {logWeightError
                ? <p className="mt-1 text-xs text-red-500">{logWeightError}</p>
                : <p className="mt-1 text-[10px] text-slate-400">Numbers only · 20–200 kg</p>}
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">BMI (auto)</label>
              <input type="number" value={logForm.bmi} readOnly
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-500 text-sm cursor-not-allowed" />
            </div>
          </div>
          {logMsg && <p role="status" className="text-green-600 dark:text-green-400 text-sm mb-2">{logMsg}</p>}
          {logError && <p role="alert" className="text-red-500 text-sm mb-2">{logError}</p>}
          <button onClick={handleLogProgress} disabled={logging || !logForm.weight}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition text-sm">
            {logging ? "Logging..." : "Log Progress"}
          </button>
        </div>

        {/* History */}
        {logs.length > 0 && (
          <div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111]">
            <h2 className="font-bold text-slate-900 dark:text-white">All-time progress history</h2>
            <p className="mb-4 mt-1 text-xs text-slate-500">Every check-in is listed with all measurements recorded for it.</p>
            <div className="space-y-2">
              {logs.map((log) => {
                const measurements = [
                  log.weight != null && ["Weight", `${log.weight} kg`],
                  log.bmi != null && ["BMI", log.bmi],
                  log.body_fat != null && ["Body fat", `${log.body_fat}%`],
                  log.waist != null && ["Waist", log.waist],
                  log.chest != null && ["Chest", log.chest],
                  log.hips != null && ["Hips", log.hips],
                  log.left_arm != null && ["Left arm", log.left_arm],
                ].filter(Boolean);
                return (
                  <div key={log.progress_id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 py-3 last:border-0 dark:border-white/10">
                    <span className="text-sm text-slate-500">
                      {formatPhilippinesDate(log.log_date) || "—"}
                    </span>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                      {measurements.map(([label, value]) => (
                        <span key={label} className={label === "Weight" ? "font-medium text-slate-900 dark:text-white" : label === "BMI" ? "text-orange-600 dark:text-orange-400" : "text-slate-500 dark:text-slate-400"}>
                          {label} {value}
                        </span>
                      ))}
                      {!measurements.length && <span className="text-slate-400">No measurements recorded</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {!loading && logs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-orange-200 p-6 text-center dark:border-white/10">
            <Scale size={24} className="mx-auto mb-2 text-orange-500" />
            <p className="font-semibold">Your progress journey starts here</p>
            <p className="mt-1 text-sm text-slate-500">Log your first measurement above to start seeing your trends.</p>
          </div>
        )}
      </div>
      {goalAchieved && (
        <GoalRenewalModal
          currentWeight={goalWeight}
          height={profile?.height ?? user?.height}
          saving={goalRenewalSaving}
          error={goalRenewalError}
          onSave={handleGoalRenewalSave}
        />
      )}
    </div>
  );
}