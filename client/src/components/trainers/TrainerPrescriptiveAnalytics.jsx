import { useCallback, useEffect, useRef, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from "chart.js";
import { Bar } from "react-chartjs-2";
import { AlertTriangle, ChevronDown, Sparkles, TrendingUp, UserRound } from "lucide-react";
import trainerApi from "../../trainerApi";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const formatFitnessGoal = (goal) => goal === "Muscle Gain" ? "Gain Weight" : goal;

function calculateBmi(weight, height) {
  const weightKg = Number(weight);
  const heightCm = Number(height);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(heightCm) || heightCm <= 0) return null;
  return (weightKg / ((heightCm / 100) ** 2)).toFixed(1);
}

export default function TrainerPrescriptiveAnalytics({ members, onViewProfile }) {
  const [insights, setInsights] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const isMountedRef = useRef(false);
  const requestInFlightRef = useRef(false);

  const refreshAnalytics = useCallback(async () => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;

    try {
      const response = await trainerApi.get("/me/prescriptive-analytics");
      const analytics = response.data.data || {};
      if (!isMountedRef.current) return;
      setInsights(Array.isArray(analytics.insights) ? analytics.insights : []);
      setSummary(analytics);
      setError("");
      setLastUpdatedAt(new Date());
    } catch (requestError) {
      console.error("Couldn't refresh roster prescriptive analytics:", requestError);
      if (isMountedRef.current) {
        setError(requestError.response?.data?.message || "Unable to load roster recommendations.");
      }
    } finally {
      requestInFlightRef.current = false;
      if (isMountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    const refreshVisibleAnalytics = () => {
      if (document.visibilityState === "visible") refreshAnalytics();
    };
    refreshAnalytics();
    const intervalId = window.setInterval(refreshVisibleAnalytics, 15000);
    window.addEventListener("focus", refreshVisibleAnalytics);
    document.addEventListener("visibilitychange", refreshVisibleAnalytics);
    return () => {
      isMountedRef.current = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleAnalytics);
      document.removeEventListener("visibilitychange", refreshVisibleAnalytics);
    };
  }, [refreshAnalytics]);

  const previousWeekCompletions = Number(summary?.previous_week_workout_count) || 0;
  const lastWeekCompletions = Number(summary?.last_week_workout_count) || 0;
  const memberSignalRows = [
    { label: "No workouts in 14 days", value: Number(summary?.inactive_member_count) || 0, color: "#f59e0b" },
    { label: "Little recent weight change", value: Number(summary?.stalled_member_count) || 0, color: "#fb7185" },
    { label: "Weight-loss goal", value: Number(summary?.weight_loss_member_count) || 0, color: "#38bdf8" },
  ];
  const memberSignalChart = {
    labels: memberSignalRows.map((row) => row.label),
    datasets: [{
      label: "Active roster members",
      data: memberSignalRows.map((row) => row.value),
      backgroundColor: memberSignalRows.map((row) => row.color),
      borderRadius: 6,
      barThickness: 18,
    }],
  };
  const memberSignalChartOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.parsed.x} active ${context.parsed.x === 1 ? "member" : "members"}`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        max: Math.max(Number(summary?.roster_size) || 0, ...memberSignalRows.map((row) => row.value), 1),
        ticks: { precision: 0, stepSize: 1, color: "#94a3b8" },
        title: { display: true, text: "Active members", color: "#94a3b8" },
        grid: { color: "rgba(148,163,184,0.12)" },
      },
      y: { ticks: { color: "#94a3b8" }, grid: { display: false } },
    },
  };

  const weeklyWorkoutRows = [
    { label: "Previous 7 days", value: previousWeekCompletions, color: "#14b8a6" },
    { label: "Most recent 7 days", value: lastWeekCompletions, color: "#f97316" },
  ];
  const weeklyWorkoutChart = {
    labels: weeklyWorkoutRows.map((row) => row.label),
    datasets: [{
      label: "Completed approved sessions",
      data: weeklyWorkoutRows.map((row) => row.value),
      backgroundColor: weeklyWorkoutRows.map((row) => row.color),
      borderRadius: 6,
      barThickness: 22,
    }],
  };
  const weeklyWorkoutChartOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.parsed.x} completed ${context.parsed.x === 1 ? "session" : "sessions"}`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        max: Math.max(previousWeekCompletions, lastWeekCompletions, 1) * 1.15,
        ticks: { precision: 0, stepSize: 1, color: "#94a3b8" },
        title: { display: true, text: "Completed sessions", color: "#94a3b8" },
        grid: { color: "rgba(148,163,184,0.12)" },
      },
      y: { ticks: { color: "#94a3b8" }, grid: { display: false } },
    },
  };

  const nextWeekCompletionForecast = Math.max(
    0,
    lastWeekCompletions + (lastWeekCompletions - previousWeekCompletions)
  );
  const hasCompletionHistory = previousWeekCompletions > 0 || lastWeekCompletions > 0;
  const isCompletionForecastDeclining = nextWeekCompletionForecast < lastWeekCompletions;
  const workoutCompletionForecastChart = {
    labels: ["Previous 7 days", "Most recent 7 days", "Next 7-day estimate"],
    datasets: [{
      label: "Completed approved sessions",
      data: [previousWeekCompletions, lastWeekCompletions, nextWeekCompletionForecast],
      backgroundColor: ["#64748b", "#f97316", isCompletionForecastDeclining ? "#fb7185" : "#10b981"],
      borderRadius: 6,
      barThickness: 24,
    }],
  };
  const workoutCompletionForecastOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (context) => `${context.parsed.x} completed ${context.parsed.x === 1 ? "session" : "sessions"}`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        max: Math.max(previousWeekCompletions, lastWeekCompletions, nextWeekCompletionForecast, 1) * 1.15,
        ticks: { precision: 0, stepSize: 1, color: "#94a3b8" },
        title: { display: true, text: "Completed sessions", color: "#94a3b8" },
        grid: { color: "rgba(148,163,184,0.12)" },
      },
      y: { ticks: { color: "#94a3b8" }, grid: { display: false } },
    },
  };
  const linkedWorkoutInsight = insights.find((insight) => insight.title === "Roster workout completion declined");
  const weeklyCompletionChange = lastWeekCompletions - previousWeekCompletions;
  const weeklyCompletionChangeLabel = weeklyCompletionChange < 0
    ? `down by ${Math.abs(weeklyCompletionChange)}`
    : weeklyCompletionChange > 0
      ? `up by ${weeklyCompletionChange}`
      : "unchanged";

  return (
    <div className="space-y-4">
      <section aria-labelledby="trainer-predictive-analytics-heading" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300"><TrendingUp size={19} /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">Forward outlook</p>
            <h2 id="trainer-predictive-analytics-heading" className="mt-1 text-lg font-black text-slate-900 dark:text-white">Predictive analytics</h2>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Estimates completed approved workouts for the next 7 days using recent roster activity and coaching signals.</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Auto-refreshes every 15 seconds while this page is open
              {lastUpdatedAt && ` · Updated ${lastUpdatedAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}`}
            </p>
          </div>
        </div>
        {error && <p role="alert" className="mb-3 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        {loading ? (
          <p role="status" className="text-sm text-slate-500">Loading recent workout activity for your forecast...</p>
        ) : summary && hasCompletionHistory ? (
          <>
            <p className="mb-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              Your roster completed <strong>{previousWeekCompletions}</strong> approved {previousWeekCompletions === 1 ? "workout" : "workouts"} in the previous 7 days, then <strong>{lastWeekCompletions}</strong> in the most recent 7 days ({weeklyCompletionChangeLabel}). If that same change continues, the estimate for the next 7 days is about <strong>{nextWeekCompletionForecast}</strong> completed {nextWeekCompletionForecast === 1 ? "workout" : "workouts"}.
            </p>
            {isCompletionForecastDeclining && linkedWorkoutInsight ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-400/20 dark:bg-amber-500/10">
                <p className="text-xs font-bold text-amber-900 dark:text-amber-200">Related coaching signal: {linkedWorkoutInsight.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-800 dark:text-amber-100">{linkedWorkoutInsight.detail} Follow up with the members listed in the prescriptive analytics below.</p>
              </div>
            ) : (
              <p className="mb-4 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                This forecast uses the same weekly completion totals shown in the coaching signals below. Review those recommendations to decide which members may need a check-in.
              </p>
            )}
            <div role="img" aria-label="Completed approved workouts in the previous seven days, most recent seven days, and estimated next seven days" className="h-52 w-full">
              <Bar data={workoutCompletionForecastChart} options={workoutCompletionForecastOptions} />
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
              This is a simple estimate that repeats the change between two 7-day periods. It is not a guarantee; new schedules or coaching actions can change the result.
            </p>
          </>
        ) : summary ? (
          <p className="rounded-xl border border-dashed border-violet-300 px-4 py-6 text-center text-sm leading-relaxed text-slate-600 dark:border-violet-400/20 dark:text-slate-400">
            No approved workouts were completed in either of the last two 7-day periods, so there is not enough activity to estimate a trend. Review the coaching signals below to identify members for a check-in; the forecast will become available as workouts are completed.
          </p>
        ) : (
          <p className="text-sm text-slate-500">The forecast is unavailable until recent roster activity can be loaded.</p>
        )}
      </section>

      <section aria-labelledby="trainer-prescriptive-analytics-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500"><Sparkles size={19} /></span>
          <div>
            <h2 id="trainer-prescriptive-analytics-heading" className="text-lg font-bold text-slate-900 dark:text-white">Prescriptive analytics</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Coaching signals and recommended follow-ups for your active roster</p>
          </div>
        </div>
      {loading ? <p role="status" className="text-sm text-slate-500">Analyzing your roster...</p> : (
        <div className="grid gap-3 lg:grid-cols-3">
          {insights.map((insight) => (
            <article key={insight.title} className={`flex h-full flex-col rounded-2xl border p-4 ${
              insight.type === "alert"
                ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-100"
                : insight.type === "recommendation"
                  ? "border-violet-200 bg-violet-50 text-violet-900 dark:border-violet-400/30 dark:bg-violet-500/10 dark:text-violet-100"
                  : insight.type === "focus"
                    ? "border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-400/30 dark:bg-sky-500/10 dark:text-sky-100"
                    : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-100"
            }`}>
              <h3 className="mb-2 flex items-center gap-2 font-bold">
                {insight.type === "focus" || insight.type === "positive" ? <Sparkles size={16} /> : <AlertTriangle size={16} />}
                {insight.title}
              </h3>
              <p className="text-sm leading-relaxed">{insight.detail}</p>
              {insight.members?.length > 0 && (
                <details className="group relative mt-auto pt-4 open:z-30">
                  <summary className="flex h-[88px] cursor-pointer list-none items-center gap-3 rounded-xl border border-current/25 bg-white/60 px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] marker:hidden hover:bg-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 dark:bg-black/15 dark:hover:bg-black/25">
                    <span className="group-open:hidden">Show {insight.members.length} {insight.members.length === 1 ? "member" : "members"} to follow up</span>
                    <span className="hidden group-open:inline">Hide {insight.members.length === 1 ? "member" : "members"} to follow up</span>
                    <ChevronDown size={18} className="ml-auto shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <ul className="absolute inset-x-0 top-full z-30 mt-3 max-h-64 space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white/95 p-2 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-slate-950/95">
                    {insight.members.map((attentionMember) => {
                      const profile = members.find((member) => String(member.user_id) === String(attentionMember.user_id))
                        || summary?.members?.find((member) => String(member.user_id) === String(attentionMember.user_id))
                        || attentionMember;
                      return (
                        <li key={attentionMember.user_id}>
                          <button
                            type="button"
                            onClick={() => onViewProfile(profile)}
                            title={`${attentionMember.first_name} ${attentionMember.last_name}`}
                            className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-3 text-left shadow-sm transition hover:border-orange-300 hover:bg-orange-50/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 dark:border-white/10 dark:bg-slate-900 dark:hover:border-orange-400/40 dark:hover:bg-slate-800"
                          >
                            <span className="flex min-w-0 items-start gap-2.5">
                              <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/10 text-xs font-bold uppercase text-orange-600 dark:text-orange-300">
                                {attentionMember.first_name?.charAt(0)}{attentionMember.last_name?.charAt(0)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block break-words text-sm font-bold capitalize text-slate-900 dark:text-slate-100">{attentionMember.first_name} {attentionMember.last_name}</span>
                                <span className="mt-1 inline-flex whitespace-nowrap rounded-lg bg-orange-700 px-2 py-1 text-[10px] font-bold text-white transition-colors hover:bg-orange-800 dark:bg-orange-400 dark:text-slate-950 dark:hover:bg-orange-300">View profile</span>
                                <span className="mt-1 block text-xs leading-relaxed text-slate-600 dark:text-slate-400">{attentionMember.detail}</span>
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              )}
            </article>
          ))}
        </div>
      )}
      {!loading && summary && (
        <div className="mt-4">
          <div className="mb-3">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Roster coaching signals</h3>
            <p className="mt-1 text-[11px] text-slate-500">Member counts connect to the follow-up recommendations above; weekly workout totals connect to the forecast above.</p>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <section aria-labelledby="member-follow-up-signals-heading" className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/50">
              <h4 id="member-follow-up-signals-heading" className="text-sm font-bold text-slate-800 dark:text-slate-100">Members to follow up with</h4>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Each count shows how many active members match that signal. When a count is above zero, their names and advice appear in the recommendations above. A member can appear in more than one group.</p>
              {Number(summary.roster_size) > 0 ? (
                <div role="img" aria-label="Active roster members with no approved workouts in 14 days, little recent weight change, or a weight-loss goal" className="mt-3 h-48 w-full">
                  <Bar data={memberSignalChart} options={memberSignalChartOptions} />
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
                  No active members are assigned to your roster yet.
                </p>
              )}
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">“Little recent weight change” means less than 0.5 kg between two weight records at least 14 days apart; the latest record must be from the past 30 days.</p>
            </section>
            <section aria-labelledby="weekly-workout-activity-heading" className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/50">
              <h4 id="weekly-workout-activity-heading" className="text-sm font-bold text-slate-800 dark:text-slate-100">Weekly completed workouts</h4>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">These two completed-session totals are the inputs for the next-7-day estimate in the predictive outlook above.</p>
              {hasCompletionHistory ? (
                <div role="img" aria-label="Approved workout sessions completed in the previous 7 days compared with the most recent 7 days" className="mt-3 h-48 w-full">
                  <Bar data={weeklyWorkoutChart} options={weeklyWorkoutChartOptions} />
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
                  No approved workouts were completed in the last 14 days, so there is not yet a weekly trend to compare.
                </p>
              )}
            </section>
          </div>
        </div>
      )}
      {!loading && summary && (
        <details className="group mt-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/50 sm:p-5">
          <summary className="flex cursor-pointer list-none items-center gap-3 text-slate-900 marker:hidden dark:text-white">
            <Sparkles size={18} className="shrink-0 text-orange-500" />
            <span className="min-w-0">
              <span className="block text-sm font-bold">Individual member recommendations</span>
              <span className="mt-1 block text-[11px] text-slate-500">Workout suggestions use approved plans and recorded completion history. Review profile health details before changing a plan.</span>
            </span>
            <ChevronDown size={18} className="ml-auto shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
            <span className="sr-only">Toggle individual member recommendations</span>
          </summary>
          <div className="mt-4 space-y-3">
            {summary.members?.length ? (
              <div className="grid gap-3 xl:grid-cols-2">
                {summary.members.map((member) => {
                  const exercises = member.today_workout_exercises || [];
                  const bmi = calculateBmi(member.latest_weight, member.height);
                  const rosterMember = members.find((item) => String(item.user_id) === String(member.user_id));
                  return (
                    <article key={member.user_id} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h4 className="truncate font-bold text-slate-900 dark:text-white">{member.first_name} {member.last_name}</h4>
                          <p className="mt-1 text-xs text-slate-500">{formatFitnessGoal(member.fitness_goal) || "Goal not set"} · {member.activity_level || "Experience not set"}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {member.latest_weight ? `${member.latest_weight} kg` : "Weight not recorded"}
                            {bmi ? ` · BMI ${bmi}` : ""}
                            {member.target_weight ? ` · Target ${member.target_weight} kg` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onViewProfile(rosterMember || member)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-500/30 px-2.5 py-2 text-xs font-semibold text-orange-600 hover:bg-orange-500/10 dark:text-orange-300"
                        >
                          <UserRound size={14} /> View profile
                        </button>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Workout for today</p>
                          {exercises.length ? (
                            <>
                              <p className="mt-1 text-xs text-slate-500">{member.today_workout_name || "Approved workout"}</p>
                              <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                                {exercises.map((exercise, index) => (
                                  <li key={`${exercise.exercise_name || "exercise"}-${index}`}>
                                    {exercise.exercise_name || "Exercise"} · {exercise.sets ?? "—"} sets × {exercise.reps ?? "—"} reps
                                  </li>
                                ))}
                              </ul>
                            </>
                          ) : (
                            <p className="mt-1 text-xs text-slate-500">No approved workout is scheduled today. Create or update a plan if training is intended.</p>
                          )}
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Intensity adjustment</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{member.recommendations.intensity}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Rest &amp; recovery</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{member.recommendations.recovery}</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-950 sm:col-span-2">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Previous workout / performance</p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{member.recommendations.previous_performance}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
                No active roster members are available for individual recommendations.
              </p>
            )}
          </div>
        </details>
      )}
      </section>
    </div>
  );
}
