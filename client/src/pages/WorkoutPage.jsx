import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle, Dumbbell, Moon, Play, RotateCcw, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { useUserAuth } from "../context/UserAuthContext";
import userApi from "../userApi";
import { formatPhilippinesDate, philippinesDateKey, philippinesDateString, philippinesMondayString } from "../utils/philippinesDate";
import { getWorkoutDayGroups } from "../utils/workoutSessions";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WORKOUT_STATUS_STYLES = {
  Active: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300",
  Complete: "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300",
  Incomplete: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300",
  Absent: "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
};

const formatWorkoutDate = (date) =>
  formatPhilippinesDate(date, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

const formatWorkoutTime = (date) =>
  new Intl.DateTimeFormat("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(date));

const addDays = (dateKey, days) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
};

const getWeekday = (dateKey) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return DAYS[(new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7];
};

const isSessionScheduledForDate = (session, date) => {
  const scheduledDate = philippinesDateKey(session.session_date);
  if (/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) return scheduledDate === date;
  const scheduledWeekday = String(session.day_of_week || session.session_date || "").trim().toLowerCase();
  return scheduledWeekday === getWeekday(date).toLowerCase();
};

export default function WorkoutPage() {
  const { user } = useUserAuth();
  const initializedSchedule = useRef(false);
  const [sessions, setSessions] = useState([]);
  const [workoutDays, setWorkoutDays] = useState([]); // days the user picked as their availability
  const [fitnessGoal, setFitnessGoal] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weekStart, setWeekStart] = useState(() => philippinesMondayString());
  const [activeDay, setActiveDay] = useState(() => philippinesDateString());
  const [startingSessionId, setStartingSessionId] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sessionsRes, profileRes] = await Promise.all([
        userApi.get("/workouts"),
        userApi.get("/profile"),
      ]);
      const loadedSessions = sessionsRes.data.data || [];
      setSessions(loadedSessions);
      const profile = profileRes.data.data || {};
      const days = profile.preferred_days || [];
      setWorkoutDays(days);
      setFitnessGoal(profile.fitness_goal || "");
      const today = philippinesDateString();
      if (!initializedSchedule.current) {
        const nextScheduledDate = [...new Set(
          loadedSessions
            .map((session) => philippinesDateKey(session.session_date))
            .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= today)
        )].sort()[0];
        const initialDate = nextScheduledDate || today;
        const initialWeekStart = philippinesMondayString(new Date(`${initialDate}T12:00:00+08:00`));
        setWeekStart(initialWeekStart);
        setActiveDay(initialDate);
        initializedSchedule.current = true;
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Unable to load your workouts. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isWorkoutDay = (day) => {
    const weekday = getWeekday(day);
    return sessions.some((session) => (
      philippinesDateKey(session.session_date) === day || session.day_of_week === weekday
    )) || workoutDays.length === 0 || workoutDays.includes(weekday);
  };

  const handleComplete = async (id) => {
    setError("");
    try {
      await userApi.put(`/workouts/${id}/complete`);
      await fetchData();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Unable to update this workout. Please try again.");
    }
  };

  const handleStart = async (id) => {
    setError("");
    setStartingSessionId(id);
    try {
      await userApi.put(`/workouts/${id}/start`);
      await fetchData();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Unable to start this workout. Please try again.");
    } finally {
      setStartingSessionId(null);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset all workouts for this week?")) return;
    setError("");
    try {
      await userApi.delete("/workouts/reset/week");
      await fetchData();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Unable to reset this week's workouts. Please try again.");
    }
  };

  const today = philippinesDateString();
  const daySessions = sessions.filter((session) => (
    philippinesDateKey(session.session_date) === activeDay ||
    (!/^\d{4}-\d{2}-\d{2}$/.test(philippinesDateKey(session.session_date)) && session.day_of_week === getWeekday(activeDay))
  ));
  const dayCompletedCount = daySessions.filter((session) => session.completed).length;
  const dayWorkoutStatus = daySessions.length === 0
    ? ""
    : activeDay > today
      ? "Active"
      : dayCompletedCount === daySessions.length
        ? "Complete"
        : activeDay < today && dayCompletedCount === 0
          ? "Absent"
          : dayCompletedCount > 0
            ? "Incomplete"
            : "Active";
  const workoutDayGroups = getWorkoutDayGroups(sessions);
  const completedWorkoutDays = workoutDayGroups.filter((group) => group.isComplete);
  const completedCount = completedWorkoutDays.length;
  const weekStartDate = philippinesMondayString();
  const completedThisWeek = completedWorkoutDays.filter(
    (group) => group.completionDate >= weekStartDate && group.completionDate <= today
  ).length;
  const weeklyGoal = workoutDays.length;
  const weeklyProgress = weeklyGoal ? Math.min(100, Math.round((completedThisWeek / weeklyGoal) * 100)) : 0;
  const nextSession = sessions
    .filter((session) => {
      const date = philippinesDateKey(session.session_date);
      return !session.completed && date && date >= today;
    })
    .sort((a, b) => philippinesDateKey(a.session_date).localeCompare(philippinesDateKey(b.session_date)))[0];
  const weekDates = DAYS.map((_, index) => addDays(weekStart, index));
  const activeDayLabel = formatWorkoutDate(activeDay);
  const weekEnd = weekDates[6];
  const weekLabel = `${formatPhilippinesDate(weekStart, { month: "short", day: "numeric" })} – ${formatPhilippinesDate(weekEnd, { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="min-h-screen bg-[#fffaf5] dark:bg-[#080808] text-slate-900 dark:text-white">
      {/* Header */}
      <div className="ave-page-hero border-b border-orange-100 px-5 pb-6 pt-8 dark:border-white/5 sm:px-8 sm:pb-8">
        <div className="mx-auto max-w-5xl">
          <p className="hero-muted text-sm">Your training dashboard</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
            Welcome back, {user?.first_name || "Athlete"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
            {fitnessGoal && (
              <span className="inline-flex items-center gap-1.5">
                <Target size={15} className="text-orange-500" /> {fitnessGoal}
              </span>
            )}
            {nextSession && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={15} className="text-orange-500" />
                Next workout {formatWorkoutDate(nextSession.session_date)}
              </span>
            )}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm dark:border-white/5 dark:bg-[#111]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">This week</span>
                <span className="text-sm font-bold text-orange-600 dark:text-orange-400">
                  {weeklyGoal ? `${completedThisWeek}/${weeklyGoal} workout days` : `${completedCount} workout days completed`}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label="Weekly workout goal"
                aria-valuemin="0"
                aria-valuemax={weeklyGoal || 100}
                aria-valuenow={weeklyGoal ? Math.min(weeklyGoal, completedThisWeek) : 0}
                className="h-2 overflow-hidden rounded-full bg-orange-50 dark:bg-white/10"
              >
                <div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${weeklyProgress}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {weeklyGoal ? "Keep showing up for your weekly training goal." : "Set your preferred workout days in your profile to track a weekly goal."}
              </p>
            </div>
            <Link
              to="/user/progress"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-orange-200 px-4 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-orange-500/30 dark:text-orange-300 dark:hover:bg-orange-500/10"
            >
              View progress <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="mx-5 mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300 sm:mx-8">
          {error}
        </div>
      )}

      {/* Day Selector */}
      <div className="overflow-x-auto px-5 py-4 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                const previousWeekStart = addDays(weekStart, -7);
                setWeekStart(previousWeekStart);
                setActiveDay(addDays(previousWeekStart, Math.max(0, weekDates.indexOf(activeDay))));
              }}
              aria-label="Previous week"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-orange-300 hover:text-orange-600 dark:border-white/10 dark:bg-[#111] dark:text-slate-300"
            >
              <ArrowLeft size={17} />
            </button>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{weekLabel}</p>
            <button
              type="button"
              onClick={() => {
                const nextWeekStart = addDays(weekStart, 7);
                setWeekStart(nextWeekStart);
                setActiveDay(addDays(nextWeekStart, Math.max(0, weekDates.indexOf(activeDay))));
              }}
              aria-label="Next week"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-orange-300 hover:text-orange-600 dark:border-white/10 dark:bg-[#111] dark:text-slate-300"
            >
              <ArrowRight size={17} />
            </button>
          </div>
          <div className="flex w-max gap-2 lg:w-full">
            {weekDates.map((day) => {
              const hasWorkout = sessions.some((session) => (
                philippinesDateKey(session.session_date) === day ||
                (!/^\d{4}-\d{2}-\d{2}$/.test(philippinesDateKey(session.session_date)) && session.day_of_week === getWeekday(day))
              ));
              const restDay = !isWorkoutDay(day);
              const label = getWeekday(day).slice(0, 3);
              return (
                <button
                  key={day}
                  onClick={() => setActiveDay(day)}
                  aria-pressed={activeDay === day}
                  aria-label={`${getWeekday(day)}, ${formatWorkoutDate(day)} workout plan`}
                  className={`flex min-w-[62px] flex-col items-center rounded-2xl px-3 py-3 text-sm font-medium transition sm:flex-1 ${
                    activeDay === day
                      ? "bg-orange-500 text-white"
                      : restDay
                        ? "bg-slate-50 text-slate-600"
                        : "bg-white text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  <span>{label}</span>
                  <span className={`mt-0.5 text-[10px] ${activeDay === day ? "text-orange-100" : "text-slate-400"}`}>
                    {formatPhilippinesDate(day, { month: "numeric", day: "numeric" })}
                  </span>
                  {restDay ? (
                    <Moon size={10} className={`mt-1 ${activeDay === day ? "text-orange-400" : "text-slate-600"}`} />
                  ) : hasWorkout ? (
                    <div className={`mt-1 h-1.5 w-1.5 rounded-full ${activeDay === day ? "bg-white" : "bg-orange-500"}`} />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Workout List */}
      <div className="mx-auto max-w-5xl space-y-3 px-5 py-3 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Training plan</p>
            <h2 className="mt-0.5 font-bold text-slate-900 dark:text-white">{activeDayLabel}&apos;s workouts</h2>
          </div>
          {dayWorkoutStatus && (
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${WORKOUT_STATUS_STYLES[dayWorkoutStatus]}`}>
              {dayWorkoutStatus}
            </span>
          )}
          {!daySessions.some((session) => /^\d{4}-\d{2}-\d{2}$/.test(philippinesDateKey(session.session_date))) && isWorkoutDay(activeDay) && daySessions.length > 0 && (
            <button onClick={handleReset} className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition">
              <RotateCcw size={14} /> Reset
            </button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-white animate-pulse dark:bg-[#111]" />)}
          </div>
        ) : !isWorkoutDay(activeDay) ? (
          <div className="rounded-2xl border border-orange-100 bg-white px-5 py-12 text-center dark:border-white/5 dark:bg-[#111]">
            <Moon size={36} className="mx-auto mb-3 text-orange-500" />
            <p className="font-semibold text-slate-900 dark:text-white">Rest and recover</p>
            <p className="mt-1 text-sm text-slate-500">You didn&apos;t set {activeDay} as a workout day. Recovery is part of your training.</p>
          </div>
        ) : daySessions.length === 0 ? (
          <div className="rounded-2xl border border-orange-100 bg-white px-5 py-12 text-center dark:border-white/5 dark:bg-[#111]">
            <Dumbbell size={36} className="mx-auto mb-3 text-orange-500" />
            <p className="font-semibold text-slate-900 dark:text-white">No workouts assigned yet</p>
            <p className="mt-1 text-sm text-slate-500">Your coach&apos;s plan for {activeDayLabel} will appear here.</p>
          </div>
        ) : (
          daySessions.map((session) => (
            <div key={session.session_id}
              className={`rounded-2xl border bg-white p-4 shadow-sm dark:bg-[#111] ${session.completed ? "border-green-500/30" : "border-orange-100 dark:border-white/5"}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className={`font-semibold ${session.completed ? "text-slate-500" : "text-slate-900 dark:text-white"}`}>
                    {session.exercise_name || "Workout"}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{session.muscle_group || ""}</p>
                  <div className="flex gap-3 mt-2 text-xs text-slate-500">
                    {session.sets && <span>💪 {session.sets} sets</span>}
                    {session.reps && <span>🔁 {session.reps} reps</span>}
                    {session.duration_minutes && <span>⏱ {session.duration_minutes} min</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${WORKOUT_STATUS_STYLES[session.completed ? "Complete" : dayWorkoutStatus]}`}>
                    {session.completed ? "Complete" : dayWorkoutStatus}
                  </span>
                  {!session.completed && (
                    isSessionScheduledForDate(session, today) ? (
                    session.started_at ? (
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[11px] font-medium text-slate-500">
                          Started {formatWorkoutTime(session.started_at)} PH time
                        </span>
                        <button type="button" onClick={() => handleComplete(session.session_id)}
                          aria-label={`Mark ${session.exercise_name || "workout"} complete`}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-xs font-semibold text-white transition hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500">
                          <CheckCircle size={16} /> Complete
                        </button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => handleStart(session.session_id)}
                        disabled={startingSessionId === session.session_id}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                      >
                        <Play size={16} fill="currentColor" />
                        {startingSessionId === session.session_id ? "Starting..." : "Start workout"}
                      </button>
                    )
                    ) : (
                      <span className="text-right text-xs font-medium text-slate-500">
                        Available {formatWorkoutDate(session.session_date)}
                      </span>
                    )
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
