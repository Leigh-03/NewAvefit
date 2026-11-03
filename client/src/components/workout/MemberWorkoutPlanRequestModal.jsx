import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import userApi from "../../userApi";
import { philippinesDateString } from "../../utils/philippinesDate";
import { getWorkoutGoalRules } from "../../utils/workoutGoalRules";

const blankExercise = (goal) => ({
  exercise_id: "",
  sets: String(getWorkoutGoalRules(goal).sets[0]),
  reps: String(getWorkoutGoalRules(goal).reps[0]),
});

const weekdayForDate = (date) => {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00.000Z`));
};

const getWeekDateRange = (dateKey) => {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  if (!dateKey || Number.isNaN(date.getTime())) return { start: "", end: "" };
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { start, end: date.toISOString().slice(0, 10) };
};

export default function MemberWorkoutPlanRequestModal({
  initialDate,
  initialGoal,
  workoutDays,
  existingSessions = [],
  onClose,
  onSubmitted,
}) {
  const [exercises, setExercises] = useState([]);
  const [planName, setPlanName] = useState("");
  const [goal, setGoal] = useState(initialGoal || "");
  const [sessionDate, setSessionDate] = useState(() => (
    initialDate && initialDate >= philippinesDateString() ? initialDate : philippinesDateString()
  ));
  const doseRules = getWorkoutGoalRules(initialGoal);
  const [sessions, setSessions] = useState([blankExercise(initialGoal), blankExercise(initialGoal), blankExercise(initialGoal)]);
  const [loadingExercises, setLoadingExercises] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedWeek = getWeekDateRange(sessionDate);
  const scheduledExerciseIds = new Set(
    (Array.isArray(existingSessions) ? existingSessions : [])
      .filter((scheduledSession) => {
        const scheduledDate = String(scheduledSession.session_date || "").slice(0, 10);
        return selectedWeek.start &&
          scheduledDate >= selectedWeek.start &&
          scheduledDate <= selectedWeek.end;
      })
      .map((scheduledSession) => String(scheduledSession.exercise_id))
  );

  useEffect(() => {
    let active = true;
    userApi.get("/exercises")
      .then(({ data }) => {
        const rows = Array.isArray(data.data) ? data.data : [];
        if (active) setExercises(rows);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || "Unable to load the exercise list.");
      })
      .finally(() => active && setLoadingExercises(false));
    return () => { active = false; };
  }, []);

  const updateSession = (index, key, value) => {
    setSessions((current) => current.map((session, sessionIndex) => (
      sessionIndex === index ? { ...session, [key]: value } : session
    )));
  };

  const submitRequest = async (event) => {
    event.preventDefault();
    setError("");
    if (!planName.trim() || !goal.trim()) {
      setError("Enter a plan name and goal.");
      return;
    }
    if (sessions.length < 3) {
      setError("Add at least 3 exercises.");
      return;
    }
    if (sessions.some((session) => !session.exercise_id || !session.sets || !session.reps)) {
      setError("Choose an exercise and enter sets and reps for every row.");
      return;
    }
    if (sessions.some((session) =>
      Number(session.sets) < doseRules.sets[0] || Number(session.sets) > doseRules.sets[1]
      || Number(session.reps) < doseRules.reps[0] || Number(session.reps) > doseRules.reps[1]
    )) {
      setError(`For your fitness goal, each exercise must use ${doseRules.sets[0]}–${doseRules.sets[1]} sets and ${doseRules.reps[0]}–${doseRules.reps[1]} reps.`);
      return;
    }
    const usedExercises = sessions.map((session) => session.exercise_id);
    if (new Set(usedExercises).size !== usedExercises.length) {
      setError("Choose a different exercise for each row.");
      return;
    }
    const workoutWeekday = weekdayForDate(sessionDate);
    if (workoutDays.length && !workoutDays.some((day) => day.toLowerCase() === workoutWeekday.toLowerCase())) {
      setError(`Choose one of your selected workout days: ${workoutDays.join(", ")}.`);
      return;
    }

    setSaving(true);
    try {
      const { data } = await userApi.post("/workout-plan-requests", {
        plan_name: planName.trim(),
        goal: goal.trim(),
        session_date: sessionDate,
        sessions: sessions.map(({ exercise_id, sets, reps }) => ({ exercise_id, sets, reps })),
      });
      onSubmitted(data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to submit your workout plan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="member-plan-request-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111]" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6">
          <div>
            <h2 id="member-plan-request-title" className="text-xl font-bold text-slate-900 dark:text-white">Create a workout plan</h2>
            <p className="mt-1 text-sm text-slate-500">Your coach must approve it before it appears in your schedule.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><X size={20} /></button>
        </header>

        <form onSubmit={submitRequest} className="space-y-5 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Plan name
              <input value={planName} onChange={(event) => setPlanName(event.target.value)} maxLength={100} required className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-[#171717] dark:text-white" placeholder="e.g. Full-body strength" />
            </label>
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Workout date
              <input type="date" min={philippinesDateString()} value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} required className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-[#171717] dark:text-white" />
            </label>
          </div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
            Goal
            <input value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={200} required className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-[#171717] dark:text-white" placeholder="What do you want to focus on?" />
          </label>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Exercises (minimum 3)</h3>
                <p className="mt-1 text-xs text-slate-500">Your coach will review this plan before it is added to your workouts. Goal standard: {doseRules.sets[0]}–{doseRules.sets[1]} sets and {doseRules.reps[0]}–{doseRules.reps[1]} reps.</p>
              </div>
              <button type="button" onClick={() => setSessions((current) => [...current, blankExercise(initialGoal)])} disabled={sessions.length >= 30} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-orange-500/30 px-3 text-xs font-semibold text-orange-600 hover:bg-orange-500/10 disabled:opacity-50 dark:text-orange-300">
                <Plus size={14} /> Add exercise
              </button>
            </div>
            {loadingExercises ? <p className="py-6 text-center text-sm text-slate-500">Loading exercises...</p> : (
              <div className="space-y-2">
                {sessions.map((session, index) => (
                  <div key={`request-exercise-${index}`} className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-[minmax(0,1fr)_90px_90px_36px]">
                    <label className="col-span-2 min-w-0 text-xs font-semibold text-slate-500 sm:col-span-1">
                      Exercise {index + 1}
                      <select value={session.exercise_id} onChange={(event) => updateSession(index, "exercise_id", event.target.value)} required className="mt-1 block min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-[#171717] dark:text-white">
                        <option value="">Choose exercise</option>
                        {exercises.map((exercise) => (
                          <option key={exercise.exercise_id} value={exercise.exercise_id} disabled={sessions.some((other, otherIndex) => otherIndex !== index && String(other.exercise_id) === String(exercise.exercise_id))}>
                            {exercise.exercise_name}{scheduledExerciseIds.has(String(exercise.exercise_id)) ? " (Scheduled this week)" : ""}
                          </option>
                        ))}
                      </select>
                      {scheduledExerciseIds.has(String(session.exercise_id)) && (
                        <span className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300">
                          Scheduled this week
                        </span>
                      )}
                    </label>
                    <label className="text-xs font-semibold text-slate-500">
                      Sets
                      <input type="number" min={doseRules.sets[0]} max={doseRules.sets[1]} step="1" value={session.sets} onChange={(event) => updateSession(index, "sets", event.target.value)} required className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-[#171717] dark:text-white" />
                    </label>
                    <label className="text-xs font-semibold text-slate-500">
                      Reps
                      <input type="number" min={doseRules.reps[0]} max={doseRules.reps[1]} step="1" value={session.reps} onChange={(event) => updateSession(index, "reps", event.target.value)} required className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-[#171717] dark:text-white" />
                    </label>
                    <button type="button" onClick={() => setSessions((current) => current.filter((_, itemIndex) => itemIndex !== index))} disabled={sessions.length <= 3} aria-label={`Remove exercise ${index + 1}`} className="col-span-2 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30 sm:col-span-1">
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">Cancel</button>
            <button type="submit" disabled={saving || loadingExercises || exercises.length === 0} className="min-h-11 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Submitting..." : "Submit for approval"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
