import { useCallback, useEffect, useRef, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler } from "chart.js";
import { Line } from "react-chartjs-2";
import { Activity, ArrowDownRight, ArrowUpRight, Calendar, CalendarCheck, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Scale, Target } from "lucide-react";
import userApi from "../userApi";
import GoalRenewalModal from "../components/progress/GoalRenewalModal";
import { useUserAuth } from "../context/UserAuthContext";
import { formatPhilippinesDate, philippinesDateKey, philippinesDateString, philippinesMondayString } from "../utils/philippinesDate";
import { formatWeightDifference, formatWeightToTarget } from "../utils/progressHistory";
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

function ProgressHistorySort({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const options = [
    { value: "newest", label: "Newest First" },
    { value: "oldest", label: "Oldest First" },
  ];
  const selectedIndex = options.findIndex((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[selectedIndex]?.focus();
  }, [open, selectedIndex]);

  const focusOption = (index) => {
    const nextIndex = (index + options.length) % options.length;
    optionRefs.current[nextIndex]?.focus();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Sort by: ${options[selectedIndex]?.label ?? "Newest First"}`}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
        className="flex min-h-10 min-w-40 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-orange-400 hover:bg-orange-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30 dark:border-white/10 dark:bg-[#181818] dark:text-slate-200 dark:hover:border-orange-500/50 dark:hover:bg-white/5"
      >
        <span>{options[selectedIndex]?.label ?? "Newest First"}</span>
        <ChevronDown size={16} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Sort progress history"
          onKeyDown={(event) => {
            const optionIndex = optionRefs.current.indexOf(document.activeElement);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              focusOption(optionIndex + (event.key === "ArrowDown" ? 1 : -1));
            } else if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              focusOption(event.key === "Home" ? 0 : options.length - 1);
            } else if (event.key === "Tab") {
              setOpen(false);
            }
          }}
          className="absolute right-0 top-full z-30 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10 dark:border-white/10 dark:bg-[#181818] dark:shadow-black/40"
        >
          {options.map((option, index) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                ref={(element) => { optionRefs.current[index] = element; }}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                tabIndex={-1}
                onClick={() => {
                  if (!selected) onChange(option.value);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40 ${
                  selected
                    ? "bg-orange-500/10 font-semibold text-orange-700 dark:text-orange-300"
                    : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/5"
                }`}
              >
                {option.label}
                {selected && <Check size={15} aria-hidden="true" className="text-orange-500" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function ProgressPage() {
  const { user, updateUser } = useUserAuth();
  const [logs, setLogs] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historySortOrder, setHistorySortOrder] = useState("newest");
  const [sessions, setSessions] = useState([]);
  const [profile, setProfile] = useState(null);
  const [attendanceVisits, setAttendanceVisits] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceError, setAttendanceError] = useState("");
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
  const [dismissedGoalRenewalKey, setDismissedGoalRenewalKey] = useState("");

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
      setHistoryPage(1);
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
    let active = true;
    userApi.get("/attendance")
      .then((response) => {
        const visits = response.data?.data?.recent_visits;
        if (!Array.isArray(visits)) throw new Error("Attendance response did not include visit history.");
        if (active) setAttendanceVisits(visits);
      })
      .catch((error) => {
        console.error("Unable to load gym attendance history:", error);
        if (active) {
          setAttendanceError(error.response?.data?.message || "Unable to load gym attendance history.");
        }
      })
      .finally(() => {
        if (active) setAttendanceLoading(false);
      });
    return () => { active = false; };
  }, []);

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

  const todayDateKey = philippinesDateString();
  const hasWorkoutToday = sessions.some((session) => {
    const sessionDate = philippinesDateKey(session.session_date);
    if (!sessionDate || sessionDate !== todayDateKey) return false;
    return true;
  });

  const handleLogProgress = async () => {
    const w = Number(logForm.weight);
    if (!logForm.weight || !Number.isFinite(w) || w < 20 || w > 200) {
      setLogError("Weight must be between 20 kg and 200 kg.");
      return;
    }
    setLogError("");
    setLogging(true);
    try {
      await userApi.post("/progress", {
        ...logForm,
        entry_context: hasWorkoutToday ? "workout" : "rest_day",
      });
      setLogMsg(hasWorkoutToday ? "Progress logged and paired with a workout." : "Progress logged as a rest-day check-in.");
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

  const latestWeightedLog = [...logs].reverse().find((log) => log.weight != null && Number.isFinite(Number(log.weight)));
  const latestBmiLog = [...logs].reverse().find((log) => log.bmi != null && Number.isFinite(Number(log.bmi)));
  const firstWeightedLog = logs.find((log) => Number.isFinite(Number(log.weight)) && log.weight !== null);
  const latestWeight = latestWeightedLog?.weight == null ? null : Number(latestWeightedLog.weight);
  const firstWeight = firstWeightedLog?.weight == null ? null : Number(firstWeightedLog.weight);
  const weightChange = latestWeight !== null && firstWeight !== null
    ? Number((latestWeight - firstWeight).toFixed(1))
    : null;
  const targetWeight = profile?.target_weight == null ? null : Number(profile.target_weight);
  const historyPageSize = 10;
  const totalHistoryPages = Math.ceil(logs.length / historyPageSize);
  const displayedHistoryPage = Math.min(historyPage, Math.max(totalHistoryPages, 1));
  const firstHistoryIndex = logs.length ? (displayedHistoryPage - 1) * historyPageSize + 1 : 0;
  const lastHistoryIndex = Math.min(displayedHistoryPage * historyPageSize, logs.length);
  const firstVisibleHistoryPage = Math.max(1, Math.min(displayedHistoryPage - 1, totalHistoryPages - 2));
  const visibleHistoryPages = Array.from(
    { length: Math.min(totalHistoryPages, firstVisibleHistoryPage + 2) - firstVisibleHistoryPage + 1 },
    (_, index) => firstVisibleHistoryPage + index
  );
  const sortedHistoryLogs = historySortOrder === "newest" ? [...logs].reverse() : [...logs];
  const paginatedHistoryLogs = sortedHistoryLogs
    .slice((displayedHistoryPage - 1) * historyPageSize, displayedHistoryPage * historyPageSize);
  const goal = profile?.fitness_goal || "Your fitness goal";
  const goalRenewalKey = `${goal}:${targetWeight ?? ""}`;
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
  const attendanceStartDate = `${today.slice(0, 4)}-04-01`;
  const firstAttendanceWeek = philippinesMondayString(new Date(`${attendanceStartDate}T12:00:00Z`));
  const currentAttendanceWeek = philippinesMondayString();
  const attendanceWeekCount = Math.max(
    1,
    Math.floor((Date.parse(`${currentAttendanceWeek}T00:00:00Z`) - Date.parse(`${firstAttendanceWeek}T00:00:00Z`)) / (7 * 24 * 60 * 60 * 1000)) + 1
  );
  const attendanceWeekStarts = Array.from(
    { length: attendanceWeekCount },
    (_, index) => addDateDays(firstAttendanceWeek, index * 7)
  );
  const attendanceWeekCounts = new Map(
    attendanceWeekStarts.map((weekStart) => [weekStart, { recorded: 0, simulated: 0 }])
  );
  attendanceVisits.forEach((visit) => {
    const date = String(visit.attendance_date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < attendanceStartDate || date > today) return;
    const visitWeekStart = philippinesMondayString(new Date(`${date}T12:00:00Z`));
    if (attendanceWeekCounts.has(visitWeekStart)) {
      const currentCount = attendanceWeekCounts.get(visitWeekStart);
      const visitType = visit.is_simulated ? "simulated" : "recorded";
      attendanceWeekCounts.set(visitWeekStart, {
        ...currentCount,
        [visitType]: currentCount[visitType] + 1,
      });
    }
  });
  const recordedAttendanceCounts = attendanceWeekStarts.map((weekStart) => attendanceWeekCounts.get(weekStart).recorded);
  const simulatedAttendanceCounts = attendanceWeekStarts.map((weekStart) => attendanceWeekCounts.get(weekStart).simulated);
  const combinedAttendanceCounts = attendanceWeekStarts.map((weekStart) => (
    attendanceWeekCounts.get(weekStart).recorded + attendanceWeekCounts.get(weekStart).simulated
  ));
  const recordedAttendanceTotal = recordedAttendanceCounts.reduce((total, count) => total + count, 0);
  const simulatedAttendanceTotal = simulatedAttendanceCounts.reduce((total, count) => total + count, 0);
  const isDemoAttendanceView = simulatedAttendanceTotal > 0
    && /^coach-test-[a-z0-9]+-member-\d{2}@example\.test$/i.test(String(user?.email || ""));
  const attendanceChartData = {
    labels: attendanceWeekStarts.map((weekStart, index) => formatPhilippinesDate(
      index === 0 ? attendanceStartDate : weekStart,
      { month: "short", day: "numeric" }
    )),
    datasets: [
      {
        label: isDemoAttendanceView || simulatedAttendanceTotal === 0
          ? "Recorded check-ins"
          : "Total visits (includes demo)",
        data: combinedAttendanceCounts,
        borderColor: "#f97316",
        backgroundColor: "rgba(249,115,22,0.12)",
        fill: true,
        tension: 0.3,
        borderWidth: 2.5,
        pointBackgroundColor: "#f97316",
        pointBorderColor: "#111827",
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
      },
    ],
  };
  const attendanceChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: { color: "#94a3b8", usePointStyle: true, padding: 18 },
      },
      tooltip: {
        backgroundColor: "#111827",
        titleColor: "#f8fafc",
        bodyColor: "#e2e8f0",
        padding: 10,
        callbacks: {
          label: (context) => `${context.dataset.label}: ${context.parsed.y} visit${context.parsed.y === 1 ? "" : "s"}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        border: { display: false },
        grid: { color: "rgba(148,163,184,0.12)", drawTicks: false },
        ticks: { color: "#94a3b8", padding: 8, precision: 0, stepSize: 1 },
      },
      x: {
        border: { display: false },
        grid: { display: false },
        ticks: { color: "#94a3b8", padding: 8, maxTicksLimit: 9, autoSkip: true },
      },
    },
  };
  const analyticsRange = { start: analyticsFrom, end: analyticsTo };
  const allTimeWeightedLogs = logs.filter((log) => log.weight != null && Number.isFinite(Number(log.weight)));
  const allTimeBmiLogs = logs.filter((log) => log.bmi != null && Number.isFinite(Number(log.bmi)));
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
    labels: logs.map((l) => formatPhilippinesDate(l.log_date, { month: "short", day: "numeric" })),
    datasets: [
      {
        label: "Weight (kg)",
        data: logs.map((l) => l.weight == null || !Number.isFinite(Number(l.weight)) ? null : Number(l.weight)),
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
    labels: logs.map((l) => formatPhilippinesDate(l.log_date, { month: "short", day: "numeric" })),
    datasets: [
      {
        label: "BMI",
        data: logs.map((l) => l.bmi == null || !Number.isFinite(Number(l.bmi)) ? null : Number(l.bmi)),
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
                    {" · Philippines time. Body trends use all check-ins; workout completion uses this range."}
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
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{logs.length}</p>
                  <p className="text-[11px] leading-snug text-slate-500">All-time progress check-ins</p>
                </div>
                <div className="min-h-[92px] rounded-2xl bg-slate-50 p-4 dark:bg-[#151515]">
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {weightChange == null ? "—" : `${weightChange > 0 ? "+" : ""}${weightChange} kg`}
                  </p>
                  <p className="text-[11px] leading-snug text-slate-500">Weight change since first check-in</p>
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

              {logs.length > 0 ? (
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-[#151515] sm:p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Weight trend</h3>
                        <p className="mt-0.5 text-[11px] text-slate-500">All-time recorded body weight</p>
                      </div>
                      <span className="rounded-lg bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-700 dark:text-orange-300">kg</span>
                    </div>
                    <div className="h-56 w-full sm:h-64">
                      <Line data={chartData} options={weightChartOptions} />
                    </div>
                    {allTimeWeightedLogs.length === 1 && (
                      <p className="mt-2 text-center text-[11px] text-slate-500">Log another check-in to see your weight trend.</p>
                    )}
                  </section>
                  {allTimeBmiLogs.length > 0 && (
                    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-[#151515] sm:p-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">BMI trend</h3>
                          <p className="mt-0.5 text-[11px] text-slate-500">All-time recorded body mass index</p>
                        </div>
                        <span className="rounded-lg bg-orange-500/10 px-2.5 py-1 text-xs font-bold text-orange-700 dark:text-orange-300">BMI</span>
                      </div>
                      <div className="h-56 w-full sm:h-64">
                        <Line data={bmiChart} options={bmiChartOptions} />
                      </div>
                      {allTimeBmiLogs.length === 1 && (
                        <p className="mt-2 text-center text-[11px] text-slate-500">Log another check-in to see your BMI trend.</p>
                      )}
                    </section>
                  )}
                </div>
              ) : (
                <div className="mt-5 flex min-h-[164px] flex-col items-center justify-center rounded-2xl border border-dashed border-orange-200 px-4 py-8 text-center dark:border-white/10">
                  <Activity size={22} className="mx-auto mb-2 text-orange-500" />
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No progress history yet</p>
                  <p className="mt-1 text-xs text-slate-500">Log a measurement to start your all-time trends.</p>
                </div>
              )}

              <section aria-labelledby="gym-attendance-trend-heading" className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-[#151515] sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 id="gym-attendance-trend-heading" className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                      <CalendarCheck size={17} className="text-orange-500" /> Gym attendance
                    </h3>
                    <p className="mt-0.5 text-[11px] text-slate-500">Weekly attendance · Apr 1–today</p>
                  </div>
                  {!attendanceLoading && !attendanceError && (
                    <div className="flex flex-wrap gap-2 text-xs font-bold">
                      {isDemoAttendanceView ? (
                        <span className="rounded-lg bg-orange-500/10 px-2.5 py-1 text-orange-700 dark:text-orange-300">
                          {recordedAttendanceTotal + simulatedAttendanceTotal} recorded
                        </span>
                      ) : (
                        <>
                          <span className="rounded-lg bg-orange-500/10 px-2.5 py-1 text-orange-700 dark:text-orange-300">
                            {recordedAttendanceTotal} recorded
                          </span>
                          {simulatedAttendanceTotal > 0 && (
                            <span className="rounded-lg bg-sky-500/10 px-2.5 py-1 text-sky-700 dark:text-sky-300">
                              {simulatedAttendanceTotal} demo
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
                {!isDemoAttendanceView && simulatedAttendanceTotal > 0 && (
                  <p className="mb-3 text-[11px] text-slate-500">Demo attendance is fictional and separate from real gym check-ins.</p>
                )}
                {attendanceError ? (
                  <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{attendanceError}</p>
                ) : attendanceLoading ? (
                  <div role="status" aria-label="Loading gym attendance chart" className="h-56 animate-pulse rounded-xl bg-slate-200/70 dark:bg-white/5 sm:h-64" />
                ) : attendanceVisits.length ? (
                  <div className="h-56 w-full sm:h-64">
                    <Line data={attendanceChartData} options={attendanceChartOptions} />
                  </div>
                ) : (
                  <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-orange-200 px-4 py-8 text-center dark:border-white/10">
                    <CalendarCheck size={22} className="mb-2 text-orange-500" />
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No gym check-ins recorded yet</p>
                    <p className="mt-1 text-xs text-slate-500">Check in at the gym to start building your attendance trend.</p>
                  </div>
                )}
              </section>
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
                <p className="text-2xl font-black">{latestBmiLog?.bmi ?? "—"}</p>
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

          <div className={`mb-4 rounded-xl border px-3 py-2 text-sm ${hasWorkoutToday ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"}`}>
            {hasWorkoutToday
              ? "A workout is scheduled or recorded for today. Pairing your body metrics with an exercise session gives the strongest progress signal."
              : "No workout was detected for today. This is still a valid rest-day check-in, but pairing your progress with a completed session will give the clearest trend data."}
          </div>

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
            {logging ? "Logging..." : hasWorkoutToday ? "Log workout-linked progress" : "Log rest-day progress"}
          </button>
        </div>

        {/* History */}
        {logs.length > 0 && (
          <div className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111]">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">All-time progress history</h2>
                <p className="mt-1 text-xs text-slate-500">
                  All check-ins are shown {historySortOrder === "newest" ? "newest" : "oldest"} first, including your change toward the current target.
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                <span>Sort by</span>
                <ProgressHistorySort
                  value={historySortOrder}
                  onChange={(sortOrder) => {
                    setHistorySortOrder(sortOrder);
                    setHistoryPage(1);
                  }}
                />
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-white/5">
                  <tr>
                    {["Date", "Weight", "BMI", "Weight difference", "Weight to target", "Target weight"].map((label) => (
                      <th key={label} scope="col" className="whitespace-nowrap px-4 py-3">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {paginatedHistoryLogs.map((log) => {
                    const chronologicalIndex = logs.indexOf(log);
                    const weight = log.weight == null || !Number.isFinite(Number(log.weight))
                      ? null
                      : Number(log.weight);
                    const bmi = log.bmi == null || !Number.isFinite(Number(log.bmi))
                      ? null
                      : Number(log.bmi);
                    return (
                      <tr key={log.progress_id || `${log.log_date}-${index}`} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                        <td className="whitespace-nowrap px-4 py-4">{formatPhilippinesDate(log.log_date) || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-4">{weight === null ? "—" : `${weight.toFixed(2)} kg`}</td>
                        <td className="whitespace-nowrap px-4 py-4">{bmi === null ? "—" : bmi.toFixed(2)}</td>
                        <td className="whitespace-nowrap px-4 py-4">{formatWeightDifference(logs, chronologicalIndex)}</td>
                        <td className="whitespace-nowrap px-4 py-4">{formatWeightToTarget(weight, targetWeight)}</td>
                        <td className="whitespace-nowrap px-4 py-4">{Number.isFinite(targetWeight) ? `${targetWeight.toFixed(2)} kg` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Showing {firstHistoryIndex}–{lastHistoryIndex} of {logs.length} entries
              </p>
              {totalHistoryPages > 1 && (
                <nav aria-label="Progress history pagination" className="flex flex-wrap items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setHistoryPage(displayedHistoryPage - 1)}
                    disabled={displayedHistoryPage === 1}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    <ChevronLeft size={16} />
                    Previous
                  </button>
                  {visibleHistoryPages.map((page) => (
                    <button
                      key={page}
                      type="button"
                      onClick={() => setHistoryPage(page)}
                      aria-current={displayedHistoryPage === page ? "page" : undefined}
                      aria-label={`Page ${page}`}
                      className={`grid h-9 min-w-9 place-items-center rounded-lg border px-2 text-sm font-semibold transition ${
                        displayedHistoryPage === page
                          ? "border-orange-500 bg-orange-500 text-white"
                          : "border-slate-200 text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setHistoryPage(displayedHistoryPage + 1)}
                    disabled={displayedHistoryPage === totalHistoryPages}
                    className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/10"
                  >
                    Next
                    <ChevronRight size={16} />
                  </button>
                </nav>
              )}
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
      {goalAchieved && dismissedGoalRenewalKey !== goalRenewalKey && (
        <GoalRenewalModal
          currentWeight={goalWeight}
          height={profile?.height ?? user?.height}
          saving={goalRenewalSaving}
          error={goalRenewalError}
          onSave={handleGoalRenewalSave}
          onClose={() => setDismissedGoalRenewalKey(goalRenewalKey)}
        />
      )}
    </div>
  );
}