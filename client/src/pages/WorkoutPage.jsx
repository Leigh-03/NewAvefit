import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle, Dumbbell, Moon, Play, Plus, RotateCcw, Target } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useUserAuth } from "../context/UserAuthContext";
import userApi from "../userApi";
import MemberWorkoutPlanRequestModal from "../components/workout/MemberWorkoutPlanRequestModal";
import TrainingPulse from "../components/TrainingPulse";
import { formatPhilippinesDate, philippinesDateKey, philippinesDateString, philippinesMondayString } from "../utils/philippinesDate";
import { getWorkoutDayGroups } from "../utils/workoutSessions";
import { getProgramForDate } from "../utils/trainingPrograms";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WORKOUT_STATUS_STYLES = {
  Active: "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300",
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
  const [searchParams] = useSearchParams();
  const initializedSchedule = useRef(false);
  const [sessions, setSessions] = useState([]);
  const [workoutDays, setWorkoutDays] = useState([]); // days the user picked as their availability
  const [workoutFrequency, setWorkoutFrequency] = useState(0);
  const [fitnessGoal, setFitnessGoal] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("Beginner");
  const [targetWeight, setTargetWeight] = useState(null);
  const [membershipStartDate, setMembershipStartDate] = useState("");
  const [membershipEndDate, setMembershipEndDate] = useState("");
  const [injuries, setInjuries] = useState([]);
  const [healthConditions, setHealthConditions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [weekStart, setWeekStart] = useState(() => philippinesMondayString());
  const [activeDay, setActiveDay] = useState(() => philippinesDateString());
  const [startingSessionId, setStartingSessionId] = useState(null);
  const [userPlans, setUserPlans] = useState([]);
  const [hasAssignedCoach, setHasAssignedCoach] = useState(false);
  const [showPlanRequest, setShowPlanRequest] = useState(false);
  const [planRequestNotice, setPlanRequestNotice] = useState("");
  const [showPlanStatusNotices, setShowPlanStatusNotices] = useState(true);

  useEffect(() => {
    if (!planRequestNotice) return undefined;
    const timer = window.setTimeout(() => setPlanRequestNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [planRequestNotice]);

  useEffect(() => {
    if (loading) return undefined;
    setShowPlanStatusNotices(true);
    const timer = window.setTimeout(() => setShowPlanStatusNotices(false), 10000);
    return () => window.clearTimeout(timer);
  }, [loading, userPlans]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sessionsRes, profileRes, plansRes] = await Promise.all([
        userApi.get("/workouts"),
        userApi.get("/profile"),
        userApi.get("/plans"),
      ]);
      const loadedSessions = sessionsRes.data.data || [];
      setSessions(loadedSessions);
      setUserPlans(plansRes.data.data || []);
      const profile = profileRes.data.data || {};
      const days = profile.preferred_days || [];
      setWorkoutDays(days);
      setWorkoutFrequency(Number(profile.workout_days_per_week) || 0);
      setFitnessGoal(profile.fitness_goal || "");
      setExperienceLevel(profile.activity_level || "Beginner");
      setTargetWeight(profile.target_weight ?? null);
      setMembershipStartDate(profile.membership_start_date ? String(profile.membership_start_date).slice(0, 10) : "");
      setMembershipEndDate(profile.membership_end_date ? String(profile.membership_end_date).slice(0, 10) : "");
      setInjuries(Array.isArray(profile.injuries) ? profile.injuries.filter((injury) => injury && injury !== "None") : []);
      setHealthConditions(Array.isArray(profile.health_conditions) ? profile.health_conditions.filter((condition) => condition && condition !== "None") : []);
      setHasAssignedCoach(Boolean(profile.trainer_id));
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

  useEffect(() => {
    const requestedDate = searchParams.get("date") || "";
    const requestedPlanId = Number(searchParams.get("planId"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) return;
    const parsedRequestedDate = new Date(`${requestedDate}T00:00:00.000Z`);
    if (!Number.isFinite(parsedRequestedDate.getTime()) || parsedRequestedDate.toISOString().slice(0, 10) !== requestedDate) return;
    const planExists = Number.isInteger(requestedPlanId) && requestedPlanId > 0
      ? userPlans.some((plan) => Number(plan.workout_plan_id) === requestedPlanId)
        || sessions.some((session) => Number(session.workout_plan_id) === requestedPlanId)
      : true;
    if (!planExists) return;
    setWeekStart(philippinesMondayString(new Date(`${requestedDate}T12:00:00+08:00`)));
    setActiveDay(requestedDate);
  }, [searchParams, sessions, userPlans]);

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

  const handlePlanRequestSubmitted = async (message) => {
    setShowPlanRequest(false);
    setPlanRequestNotice(message);
    await fetchData();
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
  const weeklyGoal = workoutFrequency || workoutDays.length;
  const weeklyProgress = weeklyGoal ? Math.min(100, Math.round((completedThisWeek / weeklyGoal) * 100)) : 0;
  const nextSession = sessions
    .filter((session) => {
      const date = philippinesDateKey(session.session_date);
      return !session.completed && date && date >= today;
    })
    .sort((a, b) => philippinesDateKey(a.session_date).localeCompare(philippinesDateKey(b.session_date)))[0];
  const weekDates = DAYS.map((_, index) => addDays(weekStart, index));
  const activeDayLabel = formatWorkoutDate(activeDay);
  const activeDayProgram = getProgramForDate(activeDay, workoutDays, workoutFrequency);
  const weekEnd = weekDates[6];
  const weekLabel = `${formatPhilippinesDate(weekStart, { month: "short", day: "numeric" })} – ${formatPhilippinesDate(weekEnd, { month: "short", day: "numeric", year: "numeric" })}`;
  const changedPlansForActiveDay = userPlans.filter((plan) =>
    plan.trainer_change_reason &&
    philippinesDateKey(plan.session_date) === activeDay &&
    (!searchParams.get("planId") || Number(plan.workout_plan_id) === Number(searchParams.get("planId")))
  );
  const requestedPlanId = Number(searchParams.get("planId")) || null;
  const hasRequestedPlanChange = changedPlansForActiveDay.some(
    (plan) => Number(plan.workout_plan_id) === requestedPlanId
  );
  const pendingDeletionPlansForActiveDay = userPlans.filter((plan) => {
    const scheduledDate = philippinesDateKey(plan.session_date);
    return scheduledDate === activeDay && plan.deletion_request_status === "Pending";
  });
  const hasRequestedOrApprovedPlanForActiveDay = userPlans.some((plan) => (
    philippinesDateKey(plan.session_date) === activeDay &&
    ["Pending", "Approved"].includes(plan.approval_status)
  ));
  const activeDayIsNotFuture = activeDay <= today;
  const membershipExpired = membershipEndDate && membershipEndDate < today;
  const activeDayOutsideMembership = Boolean(
    (membershipStartDate && activeDay < membershipStartDate)
    || (membershipEndDate && activeDay > membershipEndDate)
  );
  const canRequestWorkout = hasAssignedCoach
    && !activeDayIsNotFuture
    && !membershipExpired
    && !activeDayOutsideMembership
    && isWorkoutDay(activeDay)
    && Boolean(activeDayProgram)
    && daySessions.length === 0
    && !hasRequestedOrApprovedPlanForActiveDay;

  useEffect(() => {
    if (loading || !requestedPlanId || !hasRequestedPlanChange) return;
    document.getElementById(`workout-plan-${requestedPlanId}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeDay, hasRequestedPlanChange, loading, requestedPlanId]);

  return (
    <div className="min-h-screen bg-[#fffaf5] dark:bg-[#080808] text-slate-900 dark:text-white">
      {showPlanRequest && (
        <MemberWorkoutPlanRequestModal
          initialDate={activeDay}
          initialGoal={fitnessGoal}
          initialTargetWeight={targetWeight}
          experienceLevel={experienceLevel}
          workoutDays={Array.isArray(workoutDays) ? workoutDays : []}
          workoutFrequency={workoutFrequency}
          injuries={injuries}
          healthConditions={healthConditions}
          existingPlans={userPlans}
          existingSessions={sessions}
          onClose={() => setShowPlanRequest(false)}
          onSubmitted={handlePlanRequestSubmitted}
        />
      )}
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
            {activeDayProgram && (
              <span className="inline-flex items-center gap-1.5">
                <Dumbbell size={15} className="text-orange-500" /> {activeDayLabel} program: {activeDayProgram}
              </span>
            )}
            {nextSession && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={15} className="text-orange-500" />
                Next workout {formatWorkoutDate(nextSession.session_date)}
              </span>
            )}
          </div>

          <div className="mx-5 mt-5 sm:mx-8">
            <TrainingPulse audience="user" date={activeDay} />
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
      {planRequestNotice && (
        <div role="status" className="mx-5 mt-5 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-200 sm:mx-8">
          {planRequestNotice}
        </div>
      )}
      {showPlanStatusNotices && userPlans.filter((plan) => ["Pending", "Rejected"].includes(plan.approval_status)).length > 0 && (
        <section aria-label="Workout plan requests" className="mx-5 mt-5 space-y-2 sm:mx-8">
          {userPlans.filter((plan) => ["Pending", "Rejected"].includes(plan.approval_status)).map((plan) => (
            <p key={plan.workout_plan_id} role="status" className={`rounded-xl border px-4 py-3 text-sm ${plan.approval_status === "Pending" ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200" : "border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200"}`}>
              <strong>{plan.plan_name}:</strong> {plan.approval_status === "Pending"
                ? plan.request_type === "coach_created"
                  ? "Your coach has been notified and will prepare this workout."
                  : "Waiting for your coach's approval."
                : plan.request_type === "coach_created"
                  ? "Your coach declined this workout request. You can submit another request."
                  : "Your coach declined this plan. You can submit an updated request."}
              {plan.session_date && <> Scheduled for {formatWorkoutDate(plan.session_date)}.</>}
              {plan.trainer_change_reason && (
                <span className="mt-2 block"><strong>Reason for coach changes:</strong> {plan.trainer_change_reason}</span>
              )}
            </p>
          ))}
        </section>
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
        {changedPlansForActiveDay.map((plan) => (
          <section
            key={plan.workout_plan_id}
            id={`workout-plan-${plan.workout_plan_id}`}
            role="status"
            className="rounded-2xl border border-orange-300 bg-orange-50 p-4 dark:border-orange-500/30 dark:bg-orange-500/10"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-orange-700 dark:text-orange-300">Coach updated this workout plan</p>
                <h3 className="mt-1 font-semibold text-slate-900 dark:text-white">{plan.plan_name}</h3>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Scheduled for {formatWorkoutDate(plan.session_date)}</p>
              </div>
              {plan.approval_status === "Pending" && (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">Awaiting approval</span>
              )}
            </div>
            <p className="mt-3 rounded-xl bg-white/80 px-3 py-2.5 text-sm text-slate-700 dark:bg-black/20 dark:text-slate-200">
              <strong className="text-orange-700 dark:text-orange-300">Reason for change:</strong> {plan.trainer_change_reason}
            </p>
          </section>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111] sm:px-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">Training plan</p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-slate-900 dark:text-white">{activeDayLabel}&apos;s workouts</h2>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!activeDayIsNotFuture && (membershipExpired
                ? <span role="status" className="text-sm font-medium text-amber-700 dark:text-amber-300">Your membership has ended. Renew it to request a workout plan.</span>
                : activeDayOutsideMembership
                  ? <span role="status" className="text-sm font-medium text-amber-700 dark:text-amber-300">Choose a date within your membership period to request a workout plan.</span>
                : !hasAssignedCoach
                  ? <span className="text-xs text-slate-500">Select a coach before requesting a workout.</span>
                  : hasRequestedOrApprovedPlanForActiveDay || daySessions.length > 0
                    ? <span role="status" className="text-sm font-medium text-slate-500">{dayWorkoutStatus === "Active" ? "A workout is already scheduled" : "A workout is already scheduled or awaiting approval for this date."}</span>
                    : !isWorkoutDay(activeDay)
                      ? <span role="status" className="text-sm font-medium text-slate-500">Choose one of your preferred workout days to request a workout.</span>
                      : !activeDayProgram
                        ? <span role="status" className="text-sm font-medium text-slate-500">Set your preferred workout days in your profile before requesting a workout.</span>
                      : null)}
            {canRequestWorkout && (
              <button type="button" onClick={() => { setPlanRequestNotice(""); setShowPlanRequest(true); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white transition hover:bg-orange-700">
                <Plus size={16} /> Create workout plan
              </button>
            )}
            {dayWorkoutStatus && (
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${WORKOUT_STATUS_STYLES[dayWorkoutStatus]}`}>
                {dayWorkoutStatus}
              </span>
            )}
            {pendingDeletionPlansForActiveDay.map((plan) => (
              <div key={plan.workout_plan_id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#111]">
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{plan.plan_name}</span>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">Deletion pending approval</span>
              </div>
            ))}
          </div>
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
              className={`group relative overflow-hidden rounded-2xl border bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md dark:bg-[#111] sm:p-5 ${Number(session.workout_plan_id) === requestedPlanId ? "border-orange-400 ring-2 ring-orange-500/20" : session.completed ? "border-green-500/30" : "border-slate-200 dark:border-white/10"}`}>
              <div className={`absolute inset-y-0 left-0 w-1 ${session.completed ? "bg-green-500" : "bg-gradient-to-b from-orange-400 to-orange-600"}`} />
              <div className="flex flex-col gap-4 pl-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ${session.completed ? "bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-400" : "bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400"}`}>
                    <Dumbbell size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-base font-bold tracking-tight ${session.completed ? "text-slate-500" : "text-slate-900 dark:text-white"}`}>
                      {session.exercise_name || "Workout"}
                    </p>
                    {session.muscle_group && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{session.muscle_group}</p>}
                    {session.training_program && (
                      <span className="mt-2 inline-flex max-w-full items-center rounded-full border border-orange-200/80 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold leading-snug text-orange-800 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-300">
                        {session.is_program_switch
                          ? `Switched program: ${session.previous_training_program || "scheduled"} → ${session.training_program}`
                          : `${session.training_program} program`}
                      </span>
                    )}
                    {(session.sets || session.reps) && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {session.sets && <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">💪 {session.sets} sets</span>}
                        {session.reps && <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">🔁 {session.reps} reps</span>}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                  <span className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-[11px] font-bold ${WORKOUT_STATUS_STYLES[session.completed ? "Complete" : dayWorkoutStatus]}`}>
                    {session.completed ? "Complete" : dayWorkoutStatus}
                  </span>
                  {session.deletion_request_status === "Pending" ? (
                    <span className="text-right text-[11px] font-semibold text-red-600 dark:text-red-300">Paused · deletion request pending</span>
                  ) : !session.completed && (
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
