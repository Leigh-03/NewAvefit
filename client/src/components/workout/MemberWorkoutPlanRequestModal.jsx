import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import userApi from "../../userApi";
import { philippinesDateString } from "../../utils/philippinesDate";
import { getWorkoutGoalRules } from "../../utils/workoutGoalRules";
import {
  exerciseMatchesProgram,
  getExerciseDose,
  getProgramForDate,
  getScheduledPrograms,
  requiresConservativeWorkout,
} from "../../utils/trainingPrograms";

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
  initialTargetWeight,
  workoutDays,
  workoutFrequency,
  injuries = [],
  healthConditions = [],
  existingPlans = [],
  existingSessions = [],
  onClose,
  onSubmitted,
}) {
  const [exercises, setExercises] = useState([]);
  const sessionDate = (
    initialDate && initialDate >= philippinesDateString() ? initialDate : philippinesDateString()
  );
  const defaultProgram = getProgramForDate(sessionDate, workoutDays, workoutFrequency);
  const [isSwitchingProgram, setIsSwitchingProgram] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState(defaultProgram);
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
  const selectedWeekPlan = getWeekDateRange(sessionDate);
  const scheduledPrograms = getScheduledPrograms(workoutDays);
  const completedPrograms = new Set(
    Object.values(existingSessions
      .filter((session) => {
        const date = String(session.session_date || "").slice(0, 10);
        return date >= selectedWeek.start && date <= selectedWeek.end;
      })
      .reduce((groups, session) => {
        const key = `${session.workout_plan_id || session.training_program}:${String(session.session_date).slice(0, 10)}`;
        if (!groups[key]) groups[key] = { program: session.training_program, completed: true };
        groups[key].completed = groups[key].completed && session.completed === true;
        return groups;
      }, {}))
      .filter((group) => group.completed && group.program)
      .map((group) => group.program)
  );
  const usedSwitchPrograms = new Set(
    existingPlans
      .filter((plan) => plan.is_program_switch && plan.session_date >= selectedWeekPlan.start && plan.session_date <= selectedWeekPlan.end)
      .map((plan) => plan.training_program)
  );
  const availableSwitchPrograms = [...scheduledPrograms].filter((program) => (
    program !== defaultProgram && !completedPrograms.has(program) && !usedSwitchPrograms.has(program)
  ));
  const visibleExercises = exercises.filter((exercise) => (
    exerciseMatchesProgram(exercise, selectedProgram) &&
    (!requiresConservativeWorkout(exercise, injuries, healthConditions) || String(exercise.difficulty || "").toLowerCase() === "beginner")
  ));

  useEffect(() => {
    setSelectedProgram(defaultProgram);
    setIsSwitchingProgram(false);
    setSessions((current) => current.map(() => blankExercise(initialGoal)));
  }, [defaultProgram, initialGoal]);

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

  const getDoseRulesForExercise = (exerciseId) => {
    const exercise = exercises.find((item) => String(item.exercise_id) === String(exerciseId));
    return exercise ? getExerciseDose(exercise, injuries, doseRules, healthConditions) : doseRules;
  };

  const handleProgramChange = (program) => {
    setSelectedProgram(program);
    setSessions((current) => current.map(() => ({
      ...blankExercise(initialGoal),
      sets: String(doseRules.sets[0]),
      reps: String(doseRules.reps[0]),
    })));
  };

  const handleExerciseSelection = (index, exerciseId) => {
    const rules = getDoseRulesForExercise(exerciseId);
    setSessions((current) => current.map((session, sessionIndex) => (
      sessionIndex === index
        ? { ...session, exercise_id: exerciseId, sets: String(rules.sets[0]), reps: String(rules.reps[0]) }
        : session
    )));
  };

  const submitRequest = async (event) => {
    event.preventDefault();
    setError("");
    if (sessions.length < 3) {
      setError("Add at least 3 exercises.");
      return;
    }
    if (sessions.some((session) => !session.exercise_id || !session.sets || !session.reps)) {
      setError("Choose an exercise and enter sets and reps for every row.");
      return;
    }
    if (isSwitchingProgram && !availableSwitchPrograms.includes(selectedProgram)) {
      setError("That program has already been scheduled or switched to this week. Choose another program.");
      return;
    }
    if (sessions.some((session) => {
      const rules = getDoseRulesForExercise(session.exercise_id);
      return Number(session.sets) < rules.sets[0] || Number(session.sets) > rules.sets[1]
        || Number(session.reps) < rules.reps[0] || Number(session.reps) > rules.reps[1];
    })) {
      setError("Use the displayed sets and reps range for each exercise. Conservative workouts use a reduced beginner range.");
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
        session_date: sessionDate,
        training_program: selectedProgram,
        is_program_switch: isSwitchingProgram,
        previous_program: isSwitchingProgram ? defaultProgram : "",
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
            <h2 id="member-plan-request-title" className="text-xl font-bold text-slate-900 dark:text-white">Request a workout from your coach</h2>
            <p className="mt-1 text-sm text-slate-500">Your coach must approve it before it appears in your schedule.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><X size={20} /></button>
        </header>

        <form onSubmit={submitRequest} className="space-y-5 p-5 sm:p-6">
          <section className="rounded-xl border border-orange-200 bg-orange-50/70 p-4 dark:border-orange-500/20 dark:bg-orange-500/[0.06]">
            <p className="text-sm font-bold text-slate-900 dark:text-white">Program: {selectedProgram || "Not set"}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Workout date: {sessionDate}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Goal weight: {initialTargetWeight ? `${initialTargetWeight} kg` : "Not set in your profile"}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Your program is assigned from your preferred workout days and weekly frequency.</p>
            <label className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={isSwitchingProgram} disabled={!availableSwitchPrograms.length} onChange={(event) => {
                const switching = event.target.checked;
                setIsSwitchingProgram(switching);
                handleProgramChange(switching ? availableSwitchPrograms[0] : defaultProgram);
              }} />
              Would you like to request a different program from your coach?
            </label>
            {isSwitchingProgram && (
              <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                Choose an unfinished program this week (coach approval required)
                <select value={selectedProgram} onChange={(event) => handleProgramChange(event.target.value)} className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-[#171717] dark:text-white">
                  {availableSwitchPrograms.map((program) => <option key={program} value={program}>{program}</option>)}
                </select>
              </label>
            )}
            {isSwitchingProgram && <p className="mt-2 text-xs text-slate-500">Your coach will receive an in-app and email notification and must approve the request. Programs already completed this week are unavailable.</p>}
            {!availableSwitchPrograms.length && <p className="mt-2 text-xs text-slate-500">There are no unfinished alternative programs available this week.</p>}
            {(injuries.length > 0 || healthConditions.length > 0) && (
              <p className="mt-3 rounded-lg border border-amber-300/50 bg-amber-100/60 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                Injury-related exercises and workouts for members with recorded health conditions use a conservative beginner starting range for coach review. This is not medical advice; consult a healthcare professional about exercise restrictions.
              </p>
            )}
          </section>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Exercises (minimum 3)</h3>
                <p className="mt-1 text-xs text-slate-500">Only exercises for {selectedProgram || "your selected program"} are shown. Injury-affected exercises are limited to beginner options and reduced volume for coach review.</p>
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
                      <select value={session.exercise_id} onChange={(event) => handleExerciseSelection(index, event.target.value)} required className="mt-1 block min-h-10 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-[#171717] dark:text-white">
                        <option value="">Choose exercise</option>
                        {visibleExercises.map((exercise) => (
                          <option key={exercise.exercise_id} value={exercise.exercise_id} disabled={sessions.some((other, otherIndex) => otherIndex !== index && String(other.exercise_id) === String(exercise.exercise_id))}>
                            {exercise.exercise_name}{scheduledExerciseIds.has(String(exercise.exercise_id)) ? " (Scheduled this week)" : ""}{requiresConservativeWorkout(exercise, injuries, healthConditions) ? " (Beginner / conservative)" : ""}
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
                      <input type="number" min={getDoseRulesForExercise(session.exercise_id).sets[0]} max={getDoseRulesForExercise(session.exercise_id).sets[1]} step="1" value={session.sets} onChange={(event) => updateSession(index, "sets", event.target.value)} required className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-[#171717] dark:text-white" />
                    </label>
                    <label className="text-xs font-semibold text-slate-500">
                      Reps
                      <input type="number" min={getDoseRulesForExercise(session.exercise_id).reps[0]} max={getDoseRulesForExercise(session.exercise_id).reps[1]} step="1" value={session.reps} onChange={(event) => updateSession(index, "reps", event.target.value)} required className="mt-1 block min-h-10 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal text-slate-900 dark:border-slate-700 dark:bg-[#171717] dark:text-white" />
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
            <button type="submit" disabled={saving || loadingExercises || exercises.length === 0} className="min-h-11 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Sending request..." : "Request workout from coach"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}
