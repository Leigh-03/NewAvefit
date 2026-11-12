import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import userApi from "../../userApi";
import ExercisePicker from "./ExercisePicker";
import ProgramPicker from "./ProgramPicker";
import { philippinesDateString } from "../../utils/philippinesDate";
import { getWorkoutGoalRules } from "../../utils/workoutGoalRules";
import ConfirmDialog from "../ui/ConfirmDialog";
import {
  exerciseMatchesProgram,
  getExerciseDose,
  getProgramForDate,
  getScheduledPrograms,
  hasReportedInjuries,
  hasHealthConditions,
  isExerciseAllowedForExperience,
  requiresConservativeWorkout,
} from "../../utils/trainingPrograms";

const blankExercise = (goal) => ({
  exercise_id: "",
  sets: String(getWorkoutGoalRules(goal).sets[0]),
  reps: String(getWorkoutGoalRules(goal).reps[0]),
});

const programLabel = (program) => program === "Full Body" ? program : `${program} day`;

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
  experienceLevel,
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
  const [requestType, setRequestType] = useState("keep_current_program");
  const [selectedProgram, setSelectedProgram] = useState(defaultProgram);
  const doseRules = useMemo(() => getWorkoutGoalRules(initialGoal), [initialGoal]);
  const hasInjuryOrHealthCondition = hasReportedInjuries(injuries) || hasHealthConditions(healthConditions);
  const [sessions, setSessions] = useState([blankExercise(initialGoal), blankExercise(initialGoal), blankExercise(initialGoal)]);
  const [requestNote, setRequestNote] = useState("");
  const [loadingExercises, setLoadingExercises] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [removeExerciseIndex, setRemoveExerciseIndex] = useState(null);

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
  const scheduledPrograms = [...getScheduledPrograms(workoutDays)];
  const usedPrograms = new Set([
    ...existingPlans
      .filter((plan) => {
        const planDate = String(plan.session_date || "").slice(0, 10);
        return ["pending", "approved"].includes(String(plan.approval_status || "").toLowerCase())
          && planDate >= selectedWeek.start
          && planDate <= selectedWeek.end;
      })
      .map((plan) => plan.training_program)
      .filter(Boolean),
    ...existingSessions
      .filter((session) => {
        const sessionDate = String(session.session_date || "").slice(0, 10);
        return sessionDate >= selectedWeek.start && sessionDate <= selectedWeek.end;
      })
      .map((session) => session.training_program)
      .filter(Boolean),
  ]);
  const availableWeeklyPrograms = scheduledPrograms.filter((program) => !usedPrograms.has(program));
  const availableSwitchPrograms = availableWeeklyPrograms.filter((program) => program !== defaultProgram);
  const availableCoachRequestPrograms = availableWeeklyPrograms;
  const hasAvailableWeeklyPrograms = availableWeeklyPrograms.length > 0;
  const defaultCoachRequestProgram = availableCoachRequestPrograms[0] || "";
  const selectedProgramAvailableForCoachRequest = availableCoachRequestPrograms.includes(selectedProgram);
  const hasAvailableSwitchPrograms = availableSwitchPrograms.length > 0;
  const hasAvailableCoachRequestPrograms = availableCoachRequestPrograms.length > 0;
  const hasAvailableCurrentProgram = availableWeeklyPrograms.includes(defaultProgram);
  const hasSelectableProgram = requestType === "program_change"
    ? hasAvailableSwitchPrograms
    : requestType === "specific_workout"
      ? hasAvailableCoachRequestPrograms
      : hasAvailableCurrentProgram;

  useEffect(() => {
    if (requestType === "program_change") {
      if (!hasAvailableSwitchPrograms) {
        setRequestType("keep_current_program");
        setSelectedProgram(defaultProgram || "");
        return;
      }
      if (!availableSwitchPrograms.includes(selectedProgram)) {
        setSelectedProgram(availableSwitchPrograms[0]);
      }
      return;
    }

    if (requestType === "specific_workout") {
      if (!selectedProgramAvailableForCoachRequest) {
        setSelectedProgram(defaultCoachRequestProgram);
      }
      return;
    }

    if (requestType === "keep_current_program" || requestType === "coach_created") {
      if (requestType === "keep_current_program" && !hasAvailableCurrentProgram) {
        if (hasAvailableSwitchPrograms) {
          setRequestType("program_change");
          setSelectedProgram(availableSwitchPrograms[0]);
        } else if (hasAvailableCoachRequestPrograms) {
          setRequestType("specific_workout");
          setSelectedProgram(defaultCoachRequestProgram);
        }
        return;
      }
      setSelectedProgram(defaultProgram || "");
    }
  }, [availableSwitchPrograms, defaultCoachRequestProgram, defaultProgram, hasAvailableCoachRequestPrograms, hasAvailableCurrentProgram, hasAvailableSwitchPrograms, requestType, selectedProgram, selectedProgramAvailableForCoachRequest]);
  const isProgramChange = requestType === "program_change";
  const isKeepCurrentProgram = requestType === "keep_current_program";
  const isSpecificWorkout = requestType === "specific_workout";
  const isProgramSwitch = selectedProgram !== defaultProgram;
  const requestNeedsExerciseEditor = isKeepCurrentProgram || isProgramChange;
  const visibleExercises = exercises.filter((exercise) => (
    exerciseMatchesProgram(exercise, selectedProgram || defaultProgram) &&
    isExerciseAllowedForExperience(exercise, experienceLevel) &&
    (!requiresConservativeWorkout(exercise, injuries, healthConditions) || String(exercise.difficulty || "").toLowerCase() === "beginner")
  ));

  useEffect(() => {
    setSelectedProgram(defaultProgram);
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

  const getDoseRulesForExercise = useCallback((exerciseId) => {
    const exercise = exercises.find((item) => String(item.exercise_id) === String(exerciseId));
    return exercise ? getExerciseDose(exercise, injuries, doseRules, healthConditions) : doseRules;
  }, [doseRules, exercises, healthConditions, injuries]);

  useEffect(() => {
    setSessions((current) => {
      let changed = false;
      const updated = current.map((session) => {
        if (!session.exercise_id) return session;
        const rules = getDoseRulesForExercise(session.exercise_id);
        const sets = String(rules.sets[0]);
        const reps = String(rules.reps[0]);
        if (session.sets === sets && session.reps === reps) return session;
        changed = true;
        return { ...session, sets, reps };
      });
      return changed ? updated : current;
    });
  }, [getDoseRulesForExercise]);

  const handleProgramChange = (program) => {
    setSelectedProgram(program);
    setSessions((current) => current.map(() => ({
      ...blankExercise(initialGoal),
      sets: String(doseRules.sets[0]),
      reps: String(doseRules.reps[0]),
    })));
  };

  const handleRequestTypeChange = (nextType) => {
    if (nextType === "keep_current_program" && !hasAvailableCurrentProgram) return;
    setRequestType(nextType);
    if (nextType === "program_change") {
      const nextProgram = availableSwitchPrograms[0] || "";
      setSelectedProgram(nextProgram);
      setSessions((current) => current.map(() => ({
        ...blankExercise(initialGoal),
        sets: String(doseRules.sets[0]),
        reps: String(doseRules.reps[0]),
      })));
      return;
    }

    if (nextType === "specific_workout") {
      setSelectedProgram(availableCoachRequestPrograms[0] || "");
      setSessions((current) => (current.length ? current : [blankExercise(initialGoal)]));
      return;
    }

    setSelectedProgram(defaultProgram || scheduledPrograms[0] || "");
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
    if (sessionDate <= philippinesDateString()) {
      setError("Workout requests are only available for future dates. Choose a day after today.");
      return;
    }
    if (requestType === "program_change" && sessions.length > 30) {
      setError("A program-change request can include up to 30 exercises.");
      return;
    }
    if (requestType === "specific_workout" && sessions.length > 30) {
      setError("A workout request can include up to 30 exercises.");
      return;
    }
    if (requestNeedsExerciseEditor && sessions.length < 3) {
      setError("Add at least 3 exercises for your coach to review.");
      return;
    }
    if (requestNeedsExerciseEditor && sessions.some((session) => !session.exercise_id || !session.sets || !session.reps)) {
      setError("Choose an exercise and enter sets and reps for every row.");
      return;
    }
    if (requestType === "program_change" && !availableSwitchPrograms.includes(selectedProgram)) {
      setError("Each program can only be selected once per week. Choose an unused program.");
      return;
    }
    if (requestType === "specific_workout" && !availableCoachRequestPrograms.includes(selectedProgram)) {
      setError("Each program can only be selected once per week. Choose an unused program.");
      return;
    }
    if (requestType === "keep_current_program" && !hasAvailableCurrentProgram) {
      setError("Your current program has already been selected this week. Choose an unused program.");
      return;
    }
    if (!scheduledPrograms.includes(selectedProgram)) {
      setError("Choose a program from your weekly workout split.");
      return;
    }
    if (requestNeedsExerciseEditor && sessions.some((session) => {
      const rules = getDoseRulesForExercise(session.exercise_id);
      return Number(session.sets) < rules.sets[0] || Number(session.sets) > rules.sets[1]
        || Number(session.reps) < rules.reps[0] || Number(session.reps) > rules.reps[1];
    })) {
      setError("Use the displayed sets and reps range for each exercise.");
      return;
    }
    const usedExercises = sessions.map((session) => session.exercise_id);
    if (requestNeedsExerciseEditor && new Set(usedExercises).size !== usedExercises.length) {
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
      const wantsProgramChange = requestType === "program_change" || requestType === "specific_workout";
      const { data } = await userApi.post("/workout-plan-requests", {
        session_date: sessionDate,
        training_program: selectedProgram,
        request_type: requestType,
        is_program_switch: wantsProgramChange && isProgramSwitch,
        previous_program: wantsProgramChange && isProgramSwitch ? defaultProgram : "",
        sessions: requestNeedsExerciseEditor
          ? sessions.map(({ exercise_id, sets, reps }) => ({ exercise_id, sets, reps }))
          : [],
        notes: requestNote.trim(),
      });
      onSubmitted(data.message);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to submit your workout plan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    {removeExerciseIndex !== null && (
      <ConfirmDialog
        title={`Remove exercise ${removeExerciseIndex + 1}?`}
        description={`“${exercises.find((exercise) => String(exercise.exercise_id) === String(sessions[removeExerciseIndex]?.exercise_id))?.exercise_name || "This exercise"}” will be removed from your workout request.`}
        confirmLabel="Remove exercise"
        onCancel={() => setRemoveExerciseIndex(null)}
        onConfirm={() => {
          setSessions((current) => current.filter((_, itemIndex) => itemIndex !== removeExerciseIndex));
          setRemoveExerciseIndex(null);
        }}
      />
    )}
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="member-plan-request-title" className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111]" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-800 sm:p-6">
          <div>
            <h2 id="member-plan-request-title" className="text-xl font-bold text-slate-900 dark:text-white">Request a Workout</h2>
              <p className="mt-1 text-sm text-slate-500">Choose the way you want your coach to review your next training request.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><X size={20} /></button>
        </header>

        <form onSubmit={submitRequest} className="space-y-5 p-5 sm:p-6">
          <section className="rounded-xl border border-orange-200 bg-orange-50/70 p-4 dark:border-orange-500/20 dark:bg-orange-500/[0.06]">
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Workout date: {sessionDate}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Goal weight: {initialTargetWeight ? `${initialTargetWeight} kg` : "Not set in your profile"}</p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              Today&apos;s program: {programLabel(defaultProgram)}. Options are limited to your {workoutDays.length || workoutFrequency}-day weekly split.
            </p>
            <div className="mt-4 space-y-3">
              <div
                onClick={(event) => {
                  if (!event.target.closest("button, input, label") && !isKeepCurrentProgram) {
                    handleRequestTypeChange("keep_current_program");
                  }
                }}
                className={`block rounded-xl border p-3 transition-colors ${isKeepCurrentProgram ? "border-orange-500 bg-white dark:bg-white/5" : "border-slate-200 dark:border-white/10"}`}
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="workout-request-type"
                    value="keep_current_program"
                    checked={isKeepCurrentProgram}
                    disabled={!hasAvailableCurrentProgram}
                    onChange={() => handleRequestTypeChange("keep_current_program")}
                  />
                  Keep My Current Program
                </label>
                <span className="mt-2 block pl-6 text-xs text-slate-500">Create a workout plan based on your current program and send it to your trainer for review.</span>
                <div className="mt-3 ml-6 rounded-lg border border-slate-300 bg-slate-100/70 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-[#171717] dark:text-slate-200">
                  Current split: <span className="font-semibold text-slate-900 dark:text-white">{programLabel(defaultProgram || "Current program")}</span>
                </div>
              </div>

              <div
                onClick={(event) => {
                  if (!event.target.closest("button, input, label") && !isProgramChange) {
                    handleRequestTypeChange("program_change");
                  }
                }}
                className={`block rounded-xl border p-3 transition-colors ${isProgramChange ? "border-orange-500 bg-white dark:bg-white/5" : "border-slate-200 dark:border-white/10"}`}
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="workout-request-type"
                    value="program_change"
                    checked={isProgramChange}
                    disabled={!hasAvailableSwitchPrograms}
                    onChange={() => handleRequestTypeChange("program_change")}
                  />
                  Request a Program Change
                </label>
                <span className="mt-2 block pl-6 text-xs text-slate-500">Create a new workout routine and request a different program for your trainer to review.</span>
                <div className="mt-3 ml-6 rounded-lg border border-slate-300 bg-slate-100/70 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-[#171717] dark:text-slate-200">
                  Current program: <span className="font-semibold text-slate-900 dark:text-white">{programLabel(defaultProgram || "Current program")}</span>
                </div>
                <div className="mt-3 ml-6">
                  <p className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Requested new split</p>
                  <ProgramPicker
                    ariaLabel="Requested new program"
                    value={isProgramChange ? selectedProgram : ""}
                    disabled={!isProgramChange || !hasAvailableSwitchPrograms}
                    placeholder="Select alternate split"
                    options={availableSwitchPrograms.map((program) => ({ value: program, label: programLabel(program) }))}
                    onChange={handleProgramChange}
                  />
                </div>
              </div>

              <div
                onClick={(event) => {
                  if (!event.target.closest("button, input, label") && !isSpecificWorkout) {
                    handleRequestTypeChange("specific_workout");
                  }
                }}
                className={`block rounded-xl border p-3 transition-colors ${isSpecificWorkout ? "border-orange-500 bg-white dark:bg-white/5" : "border-slate-200 dark:border-white/10"}`}
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <input
                    type="radio"
                    name="workout-request-type"
                    value="specific_workout"
                    checked={isSpecificWorkout}
                    onChange={() => handleRequestTypeChange("specific_workout")}
                  />
                  Request workout from your coach
                </label>
                <span className="mt-2 block pl-6 text-xs text-slate-500">Send a request to your trainer for a workout plan using an unfinished program from your weekly split.</span>
                <div className="mt-3 ml-6 rounded-lg border border-slate-300 bg-slate-100/70 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-[#171717] dark:text-slate-200">
                  Current program: <span className="font-semibold text-slate-900 dark:text-white">{programLabel(defaultProgram || "Current program")}</span>
                </div>
                <div className="mt-3 ml-6">
                  <p className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Requested program</p>
                  <ProgramPicker
                    ariaLabel="Requested program"
                    value={isSpecificWorkout ? selectedProgram : ""}
                    disabled={!isSpecificWorkout || !hasAvailableCoachRequestPrograms}
                    placeholder={hasAvailableCoachRequestPrograms ? "Select program" : "No programs available"}
                    options={availableCoachRequestPrograms.map((program) => ({ value: program, label: programLabel(program) }))}
                    onChange={handleProgramChange}
                  />
                </div>
              </div>
            </div>
            {isProgramChange && selectedProgram && (
              <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">
                {`Program change: ${programLabel(defaultProgram) || "Not set"} → ${programLabel(selectedProgram) || "Select a program"}. Your coach must approve it.`}
              </label>
            )}
            {!hasAvailableWeeklyPrograms && <p className="mt-2 text-xs text-slate-500">Each program in your weekly split can be selected once per week. Your choices reset next Monday.</p>}
            {hasAvailableWeeklyPrograms && !hasAvailableCurrentProgram && <p className="mt-2 text-xs text-slate-500">Your current program has already been selected this week. Choose one of the unused programs above; your choices reset next Monday.</p>}
            {!hasAvailableSwitchPrograms && hasAvailableCurrentProgram && <p className="mt-2 text-xs text-slate-500">There are no unused alternative programs this week. Each program can be selected once and choices reset next Monday.</p>}
            {hasInjuryOrHealthCondition && (
              <p className="mt-3 rounded-lg border border-amber-300/50 bg-amber-100/60 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                Injury-related exercises and workouts for members with recorded health conditions use a conservative beginner starting range for coach review. This is not medical advice; consult a healthcare professional about exercise restrictions.
              </p>
            )}
          </section>

          {requestNeedsExerciseEditor && <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">My Personalized Suggested Workout Routine</h3>
                <p className="mt-1 text-xs text-slate-500">{isProgramChange ? `Add your proposed ${selectedProgram || "selected program"} exercises for coach approval.` : `Add your preferred exercises and sets/reps for your trainer to review.`}</p>
              </div>
              <button type="button" onClick={() => setSessions((current) => [...current, blankExercise(initialGoal)])} disabled={sessions.length >= 30} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-orange-500/30 px-3 text-xs font-semibold text-orange-600 hover:bg-orange-500/10 disabled:opacity-50 dark:text-orange-300">
                <Plus size={14} /> Add exercise
              </button>
            </div>
            {loadingExercises ? <p className="py-6 text-center text-sm text-slate-500">Loading exercises...</p> : (
              visibleExercises.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
                  No exercises match this program and your experience level.
                </p>
              ) : (
                <div className="space-y-2">
                  {sessions.map((session, index) => (
                  <div key={`request-exercise-${index}`} className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-[minmax(0,1fr)_90px_90px_36px]">
                    <label className="col-span-2 min-w-0 text-xs font-semibold text-slate-500 sm:col-span-1">
                      Exercise {index + 1}
                      <div className="mt-1">
                        <ExercisePicker
                          id={`member-request-exercise-${index}`}
                          value={session.exercise_id}
                          options={visibleExercises.map((exercise) => ({
                            ...exercise,
                            disabled: sessions.some((other, otherIndex) =>
                              otherIndex !== index && String(other.exercise_id) === String(exercise.exercise_id)
                            ),
                          }))}
                          onChange={(exerciseId) => handleExerciseSelection(index, exerciseId)}
                          placeholder="Choose an exercise"
                          getBadges={(exercise) => [
                            ...(scheduledExerciseIds.has(String(exercise.exercise_id))
                              ? [{ label: "Scheduled this week", className: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" }]
                              : []),
                            ...(requiresConservativeWorkout(exercise, injuries, healthConditions)
                              ? [{ label: "Beginner / conservative", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" }]
                              : []),
                          ]}
                        />
                      </div>
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
                    <button type="button" onClick={() => setRemoveExerciseIndex(index)} disabled={sessions.length <= 3} aria-label={`Remove exercise ${index + 1}`} className="col-span-2 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30 sm:col-span-1">
                      <X size={16} />
                    </button>
                  </div>
                  ))}
                </div>
              )
            )}
          </div>}

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/40">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Additional notes for your coach
              <textarea
                value={requestNote}
                onChange={(event) => setRequestNote(event.target.value)}
                rows={4}
                placeholder="Example: I want a more chest-focused workout this week, or please prepare a full-body routine based on my current split."
                className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-500 dark:border-slate-700 dark:bg-[#171717] dark:text-white"
              />
            </label>
          </div>

          {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
          <div className="flex justify-end gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            <button type="button" onClick={onClose} disabled={saving} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">Cancel</button>
            <button type="submit" disabled={saving || !hasSelectableProgram || (requestNeedsExerciseEditor && (loadingExercises || exercises.length === 0))} className="min-h-11 rounded-xl bg-orange-600 px-5 text-sm font-bold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Sending request..." : "Submit"}</button>
          </div>
        </form>
      </section>
    </div>
    </>
  );
}
