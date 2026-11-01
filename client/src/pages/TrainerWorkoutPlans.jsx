import { useEffect, useState } from "react";
import { ChevronDown, ClipboardList, LockKeyhole, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import trainerApi from "../trainerApi";
import { formatWorkoutTime, getCompatibleWorkoutStartTimes } from "../utils/workoutSchedule";

const statusColors = {
  Active: "border-green-200 bg-green-50 text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300",
  Incomplete: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  Complete: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300",
  Absent: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
};

const INTENSITY_LABELS = ["", "Light", "Easy", "Moderate", "Intense", "Very Intense"];
const EXERCISE_DIFFICULTIES = ["Beginner", "Moderate", "Advanced"];

const difficultyRank = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "beginner") return 1;
  if (normalized === "moderate" || normalized === "intermediate") return 2;
  if (normalized === "advanced") return 3;
  return 0;
};

const allowedDifficultyRank = (value) => difficultyRank(value);
const isExerciseAllowedForMember = (exercise, memberLevel) => {
  const memberRank = allowedDifficultyRank(memberLevel);
  const exerciseRank = difficultyRank(exercise?.difficulty);
  return memberRank > 0 && exerciseRank > 0 && exerciseRank <= memberRank;
};

const localDateString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

const isPastWorkoutPlan = (plan) => Boolean(
  plan.scheduled_date &&
  String(plan.scheduled_date).slice(0, 10) < manilaDateString()
);

const toList = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  return value.replace(/^\{|\}$/g, "").split(",").map((item) => item.trim()).filter(Boolean);
};

const formatPreferredWorkoutTime = (value) => ({
  Morning: "Morning (6:00 AM – 12:00 PM)",
  Afternoon: "Afternoon (12:00 PM – 5:00 PM)",
  Evening: "Evening (5:00 PM – 10:00 PM)",
  Flexible: "Flexible (6:00 AM – 10:00 PM)",
}[value] || "Not specified");

const calculateBmi = (member) => {
  const weight = Number(member.latest_weight ?? member.weight);
  const height = Number(member.height);
  if (!Number.isFinite(weight) || weight <= 0 || !Number.isFinite(height) || height <= 0) return "—";
  return (weight / ((height / 100) ** 2)).toFixed(1);
};

const nextPreferredDate = (preferredDays, reservedDates = []) => {
  const today = new Date();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const preferences = toList(preferredDays).map((day) => day.toLowerCase());
  for (let offset = 0; offset < 365; offset += 1) {
    const candidate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const date = localDateString(candidate);
    if ((!preferences.length || preferences.includes(dayNames[candidate.getDay()].toLowerCase()))
      && !reservedDates.includes(date)) {
      return date;
    }
  }
  return localDateString(today);
};

const isPreferredWorkoutDate = (date, preferredDays) => {
  const preferences = toList(preferredDays).map((day) => day.toLowerCase());
  if (!date || preferences.length === 0) return true;
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return preferences.includes(dayNames[weekday].toLowerCase());
};

function PlanModal({ members, exercises, plans, coachAvailability, plan, onClose, onSave }) {
  const [form, setForm] = useState(() => plan ? {
    user_id: String(plan.user_id),
    plan_name: plan.plan_name || "",
    goal: plan.goal || "",
    session_date: plan.scheduled_date || "",
    session_start_time: String(plan.scheduled_start_time || "").slice(0, 5),
    sessions: (plan.sessions || []).map((session) => ({
      exercise_id: String(session.exercise_id || ""),
      sets: String(session.sets ?? ""),
      reps: String(session.reps ?? ""),
    })),
  } : {
    user_id: "",
    plan_name: "",
    goal: "",
    session_date: "",
    session_start_time: "",
    sessions: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const selectedMember = members.find((member) => String(member.user_id) === form.user_id);
  const keepingExistingDate = plan
    && String(plan.scheduled_date || "").slice(0, 10) === form.session_date;
  const existingPlanOnDate = !keepingExistingDate && plans.find((item) =>
    String(item.user_id) === form.user_id
    && String(item.scheduled_date || "").slice(0, 10) === form.session_date
    && String(item.workout_plan_id) !== String(plan?.workout_plan_id)
  );
  const availableDays = toList(selectedMember?.preferred_days);
  const compatibleStartTimes = getCompatibleWorkoutStartTimes(
    selectedMember,
    coachAvailability,
    form.session_date
  );
  const compatibleStartTimesKey = compatibleStartTimes.join(",");
  const preferredDifficulty = EXERCISE_DIFFICULTIES.find(
    (difficulty) => difficultyRank(difficulty) === allowedDifficultyRank(selectedMember?.activity_level)
  );
  const matchingExercises = preferredDifficulty
    ? exercises.filter((exercise) => isExerciseAllowedForMember(exercise, selectedMember?.activity_level))
    : [];

  useEffect(() => {
    const availableTimes = compatibleStartTimesKey ? compatibleStartTimesKey.split(",") : [];
    if (!availableTimes.length && form.session_start_time) {
      setForm((current) => ({ ...current, session_start_time: "" }));
      return;
    }
    if (
      availableTimes.length &&
      !availableTimes.includes(form.session_start_time)
    ) {
      setForm((current) => ({ ...current, session_start_time: availableTimes[0] }));
      setFieldErrors((current) => ({ ...current, session_start_time: "" }));
    }
  }, [compatibleStartTimesKey, form.session_start_time]);

  const setFieldError = (field, message) => {
    setFieldErrors((current) => ({ ...current, [field]: message }));
  };

  const integerRangeError = (value, label, min, max) => {
    if (String(value).trim() === "") return `${label} is required.`;
    const number = Number(value);
    if (!Number.isFinite(number)) return `Enter a valid number for ${label.toLowerCase()}.`;
    if (!Number.isInteger(number)) return `${label} must be a whole number.`;
    if (number < min) return `${label} must be at least ${min}.`;
    if (number > max) return `${label} cannot be more than ${max}.`;
    return "";
  };

  const getSessionErrors = (session, index) => {
    const errors = {};
    if (!session.exercise_id) errors[`sessions.${index}.exercise_id`] = "Select an exercise.";
    if (session.exercise_id && form.sessions.some((other, otherIndex) =>
      otherIndex !== index && String(other.exercise_id) === String(session.exercise_id)
    )) {
      errors[`sessions.${index}.exercise_id`] = "Choose an exercise that is not already in this day's plan.";
    }
    const setsError = integerRangeError(session.sets, "Sets", 1, 6);
    if (setsError) errors[`sessions.${index}.sets`] = setsError;
    const repsError = integerRangeError(session.reps, "Reps", 3, 16);
    if (repsError) errors[`sessions.${index}.reps`] = repsError;
    return errors;
  };

  const handleSubmit = async () => {
    const planName = form.plan_name.trim();
    const nextErrors = {};
    if (!form.user_id) nextErrors.user_id = "Choose a member.";
    if (!planName) nextErrors.plan_name = "Plan name is required.";
    if (!form.goal.trim()) nextErrors.goal = "Goal is required. Enter the member's assessment goal.";
    if (!form.session_date) nextErrors.session_date = "Workout date is required.";
    if (!form.session_start_time) {
      nextErrors.session_start_time = compatibleStartTimes.length
        ? "Choose a session start time."
        : "No available start time matches the member's saved availability and the coach's schedule.";
    } else if (!compatibleStartTimes.includes(form.session_start_time)) {
      nextErrors.session_start_time = "Choose a start time that fits the member's availability and the coach's schedule.";
    }
    if (existingPlanOnDate) {
      nextErrors.session_date = "A workout plan already exists for this member on that date. Edit the existing plan instead.";
    }
    if (form.sessions.length === 0) nextErrors.sessions = "Add at least one exercise.";

    form.sessions.forEach((session, index) => {
      Object.assign(nextErrors, getSessionErrors(session, index));
    });

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError("Some fields need attention. Review the highlighted messages below.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        plan_name: planName,
        sessions: form.sessions.map(({ exercise_id, sets, reps }) => ({
          exercise_id,
          sets,
          reps,
        })),
      };
      if (plan) {
        await trainerApi.put(`/me/workout-plans/${plan.workout_plan_id}`, payload);
      } else {
        await trainerApi.post("/me/workout-plans", payload);
      }
      await onSave();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || `Failed to ${plan ? "update" : "create"} workout plan.`);
    } finally {
      setSaving(false);
    }
  };

  const inputClass = (field) =>
    `trainer-field w-full rounded-lg px-4 py-2.5 text-sm ${fieldErrors[field] ? "border border-red-500 focus:border-red-500" : ""}`;

  const renderFieldError = (field) => fieldErrors[field] ? (
    <p id={`${field.replaceAll(".", "-")}-error`} className="mt-1 text-xs leading-snug text-red-500" role="alert">{fieldErrors[field]}</p>
  ) : null;

  const updateSessionField = (index, field, value) => {
    setForm((current) => ({
      ...current,
      sessions: current.sessions.map((session, sessionIndex) =>
        sessionIndex === index ? { ...session, [field]: value } : session
      ),
    }));
    const key = `sessions.${index}.${field}`;
    const fieldError = field === "exercise_id"
      ? !value
        ? "Select an exercise."
        : form.sessions.some((session, sessionIndex) =>
          sessionIndex !== index && String(session.exercise_id) === String(value)
        )
          ? "Choose an exercise that is not already in this day's plan."
          : ""
      : field === "sets"
        ? integerRangeError(value, "Sets", 1, 6)
        : integerRangeError(value, "Reps", 3, 16);
    setFieldErrors((current) => ({ ...current, sessions: "", [key]: fieldError }));
    setError("");
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-[#111]">
        <div className="flex items-center justify-between border-b border-slate-200 p-6 dark:border-slate-800">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">{plan ? "Edit Workout Plan" : "Create Workout Plan"}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <label htmlFor="trainer-plan-member" className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Member *
            </label>
            <div className="relative">
              <select
                id="trainer-plan-member"
                value={form.user_id}
                disabled={Boolean(plan)}
                onChange={(event) => {
                  const member = members.find((item) => String(item.user_id) === event.target.value);
                  const goal = member?.fitness_goal || "";
                  const memberDifficulty = String(member?.activity_level || "").trim().toLowerCase();
                  const reservedDates = plans
                    .filter((item) => String(item.user_id) === event.target.value)
                    .map((item) => item.scheduled_date);
                  const sessionDate = member ? nextPreferredDate(member.preferred_days, reservedDates) : "";
                  const startTimes = getCompatibleWorkoutStartTimes(member, coachAvailability, sessionDate);
                  setForm({
                    ...form,
                    user_id: event.target.value,
                    goal,
                    session_date: sessionDate,
                    session_start_time: startTimes[0] || "",
                    plan_name: form.plan_name || (member ? `${member.first_name}'s Workout Routine` : ""),
                    sessions: form.sessions.map((session) => {
                      const exercise = exercises.find((item) => String(item.exercise_id) === String(session.exercise_id));
                      return !exercise || isExerciseAllowedForMember(exercise, memberDifficulty)
                        ? session
                        : { ...session, exercise_id: "" };
                    }),
                  });
                  setFieldErrors((current) => ({
                    ...current,
                    user_id: "",
                    goal: goal.trim() ? "" : current.goal,
                    session_date: "",
                    session_start_time: "",
                  }));
                  setError("");
                }}
                required
                aria-invalid={Boolean(fieldErrors.user_id)}
                className="trainer-field w-full appearance-none rounded-lg px-4 py-2.5 pr-10 text-sm"
              >
                <option value="">Select a roster member...</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.first_name} {member.last_name}
                  </option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                size={18}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>
            {renderFieldError("user_id")}
          </div>
          <div>
            <label htmlFor="trainer-plan-name" className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Plan Name *
            </label>
            <input
              id="trainer-plan-name"
              type="text"
              required
              value={form.plan_name}
              onChange={(event) => {
                setForm({ ...form, plan_name: event.target.value });
                setFieldError("plan_name", event.target.value.trim() ? "" : "Plan name is required.");
              }}
              aria-invalid={Boolean(fieldErrors.plan_name)}
              placeholder="e.g. Beginner Strength Program"
              className={inputClass("plan_name")}
            />
            {renderFieldError("plan_name")}
          </div>
          <div>
            <label htmlFor="trainer-plan-goal" className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Goal from assessment *
            </label>
            <input
              id="trainer-plan-goal"
              type="text"
              required
              value={form.goal}
              onChange={(event) => {
                setForm({ ...form, goal: event.target.value });
                setFieldError("goal", event.target.value.trim() ? "" : "Goal is required.");
              }}
              aria-invalid={Boolean(fieldErrors.goal)}
              placeholder="Select a member to load their goal"
              className={inputClass("goal")}
            />
            {renderFieldError("goal")}
          </div>
          {selectedMember && (
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-orange-500">Member assessment</p>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                {[
                  ["Goal", selectedMember.fitness_goal || "Not specified"],
                  ["BMI", calculateBmi(selectedMember)],
                  ["Activity", selectedMember.activity_level || "Not specified"],
                  ["Preferred days", toList(selectedMember.preferred_days).join(", ") || "Not specified"],
                  ["Preferred time", formatPreferredWorkoutTime(selectedMember.preferred_workout_time)],
                  ["Weekly frequency", selectedMember.workout_days_per_week ? `${selectedMember.workout_days_per_week} days` : "Not specified"],
                  ["Session length", selectedMember.workout_duration ? `${selectedMember.workout_duration} min` : "Not specified"],
                  ["Preferred intensity", INTENSITY_LABELS[Number(selectedMember.intensity)] || "Not specified"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{value}</p>
                  </div>
                ))}
              </div>
              {(toList(selectedMember.injuries).length > 0 || toList(selectedMember.health_conditions).length > 0) && (
                <p className="mt-3 border-t border-orange-500/20 pt-3 text-xs text-amber-500">
                  Health notes: {[...toList(selectedMember.injuries), ...toList(selectedMember.health_conditions)].join(", ")}. Review these before choosing exercises.
                </p>
              )}
            </div>
          )}
          <div>
            <label htmlFor="trainer-plan-date" className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Workout Date *
            </label>
            <input
              id="trainer-plan-date"
              type="date"
              required
              min={plan ? undefined : localDateString(new Date())}
              value={form.session_date}
              onChange={(event) => {
                const sessionDate = event.target.value;
                if (!isPreferredWorkoutDate(sessionDate, availableDays)) {
                  setForm({ ...form, session_date: "", session_start_time: "" });
                  setFieldErrors((current) => ({ ...current, session_start_time: "" }));
                  setFieldError("session_date", `Choose one of the member's preferred workout days: ${availableDays.join(", ")}.`);
                  return;
                }
                setForm({ ...form, session_date: sessionDate });
                setFieldErrors((current) => ({
                  ...current,
                  session_date: sessionDate ? "" : "Workout date is required.",
                  session_start_time: "",
                }));
                setError("");
              }}
              aria-invalid={Boolean(fieldErrors.session_date)}
              className={inputClass("session_date")}
            />
            {renderFieldError("session_date")}
            {existingPlanOnDate && (
              <p role="alert" className="mt-1 text-xs text-red-500">
                This member already has a plan on this date. Edit that plan instead.
              </p>
            )}
            {selectedMember && availableDays.length > 0 && (
              <p className="mt-1 text-xs text-slate-500">
                Only assessment days are allowed: {availableDays.join(", ")}.
              </p>
            )}
          </div>
          <div>
            <label htmlFor="trainer-plan-start-time" className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Session Start Time *
            </label>
            <div className="relative">
              <select
                id="trainer-plan-start-time"
                required
                value={form.session_start_time}
                disabled={!compatibleStartTimes.length}
                onChange={(event) => {
                  setForm({ ...form, session_start_time: event.target.value });
                  setFieldError("session_start_time", event.target.value ? "" : "Choose a session start time.");
                  setError("");
                }}
                aria-invalid={Boolean(fieldErrors.session_start_time)}
                aria-describedby={fieldErrors.session_start_time ? "session_start_time-error" : undefined}
                className={`${inputClass("session_start_time")} appearance-none pr-10`}
              >
                <option value="">
                  {!selectedMember
                    ? "Select a member first..."
                    : !form.session_date
                      ? "Select a workout date first..."
                      : compatibleStartTimes.length
                        ? "Choose a start time..."
                        : "No compatible start times"}
                </option>
                {compatibleStartTimes.map((time) => (
                  <option key={time} value={time}>{formatWorkoutTime(time)}</option>
                ))}
              </select>
              <ChevronDown
                aria-hidden="true"
                size={18}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
            </div>
            {renderFieldError("session_start_time")}
            <p className="mt-1 text-xs text-slate-500">
              Times follow the member’s saved availability and are shown in Philippine time. Session length is {selectedMember?.workout_duration || "—"} minutes.
            </p>
          </div>
          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">Routine Exercises *</p>
                <p className="text-xs text-slate-500">
                  {selectedMember
                    ? preferredDifficulty
                      ? preferredDifficulty === "Moderate"
                        ? "Showing Beginner and Moderate/Intermediate exercises to match this member's experience level."
                        : preferredDifficulty === "Advanced"
                          ? "Showing Beginner, Moderate/Intermediate, and Advanced exercises to match this member's experience level."
                          : `Showing ${preferredDifficulty} exercises to match this member's experience level.`
                      : "This member has no supported experience level for exercise filtering."
                    : "Select a member to see exercises that match their experience level."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const lastIndex = form.sessions.length - 1;
                  if (lastIndex >= 0) {
                    const errors = getSessionErrors(form.sessions[lastIndex], lastIndex);
                    if (Object.keys(errors).length > 0) {
                      setFieldErrors((current) => ({ ...current, ...errors }));
                      setError("Complete the highlighted exercise fields before adding another exercise.");
                      const firstInvalidField = Object.keys(errors)[0];
                      document.getElementById(firstInvalidField.replaceAll(".", "-"))?.focus();
                      return;
                    }
                  }
                  setForm({
                    ...form,
                    sessions: [...form.sessions, { exercise_id: "", sets: "", reps: "" }],
                  });
                  setFieldError("sessions", "");
                  setError("");
                }}
                className="flex items-center gap-1 rounded-lg border border-orange-500/30 px-3 py-2 text-xs font-semibold text-orange-500 hover:bg-orange-500/10"
              >
                <Plus size={14} /> Add Exercise
              </button>
            </div>
            <div className="space-y-3">
              {form.sessions.map((session, index) => (
                <div key={`session-${index}`} className="grid grid-cols-2 items-start gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-[minmax(0,1fr)_104px_104px_36px]">
                  <div className="col-span-2 min-w-0 sm:col-span-1">
                    <label htmlFor={`sessions-${index}-exercise_id`} className="mb-1 flex h-5 items-center whitespace-nowrap text-xs font-medium text-slate-500">Workout *</label>
                    <div className="relative">
                    <select
                      id={`sessions-${index}-exercise_id`}
                      aria-label={`Exercise ${index + 1}`}
                      value={session.exercise_id}
                      required
                      disabled={!selectedMember || !preferredDifficulty}
                      onChange={(event) => updateSessionField(index, "exercise_id", event.target.value)}
                      aria-invalid={Boolean(fieldErrors[`sessions.${index}.exercise_id`])}
                      aria-describedby={fieldErrors[`sessions.${index}.exercise_id`] ? `sessions-${index}-exercise_id-error` : undefined}
                      className={`${inputClass(`sessions.${index}.exercise_id`)} h-11 min-w-0 appearance-none truncate px-3 py-2 pr-10`}
                    >
                      <option value="">
                        {!selectedMember
                          ? "Select a member first..."
                          : !preferredDifficulty
                            ? "Experience level unavailable"
                            : matchingExercises.length
                              ? "Select exercise..."
                              : preferredDifficulty === "Beginner"
                                ? "No Beginner exercises"
                                : preferredDifficulty === "Moderate"
                                  ? "No Beginner or Moderate exercises"
                                  : "No matching exercises"}
                      </option>
                      {matchingExercises.map((exercise) => (
                        <option
                          key={exercise.exercise_id}
                          value={exercise.exercise_id}
                          disabled={form.sessions.some((other, otherIndex) =>
                            otherIndex !== index && String(other.exercise_id) === String(exercise.exercise_id)
                          )}
                        >
                          {exercise.exercise_name} · {exercise.difficulty}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      aria-hidden="true"
                      size={18}
                      className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500"
                    />
                    </div>
                    {renderFieldError(`sessions.${index}.exercise_id`)}
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`sessions-${index}-sets`} className="mb-1 flex h-5 items-center whitespace-nowrap text-xs font-medium text-slate-500">Sets (1–6)</label>
                    <input
                      id={`sessions-${index}-sets`}
                      aria-label={`Exercise ${index + 1} sets`}
                      type="number"
                      min="1"
                      max="6"
                      step="1"
                      required
                      placeholder="Sets"
                      value={session.sets}
                      onChange={(event) => updateSessionField(index, "sets", event.target.value)}
                      aria-invalid={Boolean(fieldErrors[`sessions.${index}.sets`])}
                      aria-describedby={fieldErrors[`sessions.${index}.sets`] ? `sessions-${index}-sets-error` : undefined}
                      className={`${inputClass(`sessions.${index}.sets`)} h-11 px-3 py-2`}
                    />
                    {renderFieldError(`sessions.${index}.sets`)}
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`sessions-${index}-reps`} className="mb-1 flex h-5 items-center whitespace-nowrap text-xs font-medium text-slate-500">Reps (3–16)</label>
                    <input
                      id={`sessions-${index}-reps`}
                      aria-label={`Exercise ${index + 1} reps`}
                      type="number"
                      min="3"
                      max="16"
                      step="1"
                      required
                      placeholder="Reps"
                      value={session.reps}
                      onChange={(event) => updateSessionField(index, "reps", event.target.value)}
                      aria-invalid={Boolean(fieldErrors[`sessions.${index}.reps`])}
                      aria-describedby={fieldErrors[`sessions.${index}.reps`] ? `sessions-${index}-reps-error` : undefined}
                      className={`${inputClass(`sessions.${index}.reps`)} h-11 px-3 py-2`}
                    />
                    {renderFieldError(`sessions.${index}.reps`)}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setForm({ ...form, sessions: form.sessions.filter((_, itemIndex) => itemIndex !== index) });
                      setFieldErrors((current) => Object.fromEntries(
                        Object.entries(current).filter(([key]) => !key.startsWith("sessions."))
                      ));
                    }}
                    aria-label={`Remove exercise ${index + 1}`}
                    className="col-span-2 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10 sm:col-span-1"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {form.sessions.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
                  Add at least one exercise to this routine.
                </p>
              )}
              {renderFieldError("sessions")}
            </div>
          </div>
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-slate-200 p-6 dark:border-slate-800">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={saving || Boolean(existingPlanOnDate)} className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? (plan ? "Saving..." : "Creating...") : (plan ? "Save Changes" : "Create Plan")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TrainerWorkoutPlans() {
  const [plans, setPlans] = useState([]);
  const [members, setMembers] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [coachAvailability, setCoachAvailability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [rosterFilter, setRosterFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [fetchError, setFetchError] = useState("");

  const fetchData = async () => {
    setFetchError("");
    try {
      const [plansResponse, membersResponse, exercisesResponse, availabilityResponse] = await Promise.all([
        trainerApi.get("/me/workout-plans"),
        trainerApi.get("/me/roster"),
        trainerApi.get("/me/exercises"),
        trainerApi.get("/me/availability"),
      ]);
      setPlans(plansResponse.data.data || []);
      setMembers(membersResponse.data.data || []);
      setExercises(exercisesResponse.data.data || []);
      setCoachAvailability(availabilityResponse.data.data || []);
    } catch (err) {
      console.error(err);
      setFetchError(err.response?.data?.message || err.message || "Couldn't load workout plans.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (plan) => {
    if (!window.confirm(`Delete "${plan.plan_name}"? This can't be undone.`)) return;
    setFetchError("");
    try {
      await trainerApi.delete(`/me/workout-plans/${plan.workout_plan_id}`);
      await fetchData();
    } catch (err) {
      console.error(err);
      setFetchError(err.response?.data?.message || "Failed to delete workout plan.");
    }
  };

  const handleEdit = (plan) => {
    setEditingPlan(plan);
    setShowModal(true);
  };

  const query = search.trim().toLowerCase();
  const filtered = plans.filter((plan) =>
    plan.plan_name?.toLowerCase().includes(query) ||
    plan.goal?.toLowerCase().includes(query) ||
    plan.member_name?.toLowerCase().includes(query)
  ).filter((plan) => statusFilter === "All" || plan.activity_status === statusFilter)
    .filter((plan) => rosterFilter === "All" || String(plan.user_id) === rosterFilter);

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {showModal && (
        <PlanModal
          key={editingPlan?.workout_plan_id ?? "new-plan"}
          members={members}
          exercises={exercises}
          plans={plans}
          coachAvailability={coachAvailability}
          plan={editingPlan}
          onClose={() => {
            setShowModal(false);
            setEditingPlan(null);
          }}
          onSave={fetchData}
        />
      )}

      <header className="ave-page-hero flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Training programming</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">Workout Plans</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Build and track personalized training plans for your roster.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingPlan(null);
            setShowModal(true);
          }}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#080808]"
        >
          <Plus size={18} /> Create Plan
        </button>
      </header>

      {fetchError && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {fetchError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Total plans", value: plans.length, color: "text-orange-600 dark:text-orange-400" },
          { label: "Active plans", value: plans.filter((plan) => plan.activity_status === "Active").length, color: "text-green-600 dark:text-green-400" },
          { label: "Assigned to members", value: plans.filter((plan) => plan.member_name).length, color: "text-violet-600 dark:text-violet-400" },
        ].map((summary) => (
          <div key={summary.label} className="trainer-card rounded-2xl border p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{summary.label}</p>
            <p className={`mt-2 text-2xl font-black ${summary.color}`}>{loading ? "—" : summary.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <label className="trainer-card flex min-h-11 flex-1 items-center gap-3 rounded-xl border px-4 py-3">
        <Search size={18} className="text-slate-500" />
        <input
          type="search"
          aria-label="Search workout plans"
          placeholder="Search plan, goal, or member..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500 dark:text-white"
        />
      </label>
      <label className="sr-only" htmlFor="trainer-plan-status">Filter plans by status</label>
      <select id="trainer-plan-status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="trainer-field min-h-11 rounded-xl px-4 text-sm">
        {["All", "Active", "Complete", "Incomplete", "Absent"].map((status) => <option key={status} value={status}>{status === "All" ? "All Status" : status}</option>)}
      </select>
      <label className="sr-only" htmlFor="trainer-plan-roster">Filter by My Roster</label>
      <select id="trainer-plan-roster" value={rosterFilter} onChange={(event) => setRosterFilter(event.target.value)} className="trainer-field min-h-11 rounded-xl px-4 text-sm">
        <option value="All">My Roster · All members</option>
        {members.map((member) => (
          <option key={member.user_id} value={String(member.user_id)}>{member.first_name} {member.last_name}</option>
        ))}
      </select>
      </div>

      <div className="trainer-card overflow-hidden rounded-2xl border">
        {loading ? (
          <div className="space-y-3 p-6">
            {[...Array(4)].map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/70">
                <tr>
                  {["Plan Name", "Goal", "Member", "Workout Date", "Completed / Total", "Status", "Actions"].map((heading) => (
                    <th key={heading} className="whitespace-nowrap px-5 py-4 font-semibold text-slate-600 dark:text-slate-300">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-16 text-center">
                      <ClipboardList size={36} className="mx-auto mb-2 text-slate-400" />
                      <p className="font-semibold text-slate-700 dark:text-slate-200">{plans.length ? "No plans match these filters." : "No workout plans yet."}</p>
                      <p className="mt-1 text-sm text-slate-500">{plans.length ? "Try a different search or status." : "Create a plan to start building a member's routine."}</p>
                    </td>
                  </tr>
                ) : filtered.map((plan) => {
                  const pastWorkoutDate = isPastWorkoutPlan(plan);
                  const planLocked = Boolean(plan.has_started || pastWorkoutDate);
                  return (
                  <tr key={plan.workout_plan_id} className="hover:bg-orange-500/5">
                    <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-800 dark:text-white">{plan.plan_name}</td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{plan.goal || "—"}</td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{plan.member_name || "Template"}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                      {plan.scheduled_date ? (
                        <>
                          {new Date(`${plan.scheduled_date}T00:00:00`).toLocaleDateString()}
                          {plan.scheduled_start_time && (
                            <span className="mt-1 block text-xs text-slate-400">
                              {formatWorkoutTime(plan.scheduled_start_time)}
                              {plan.scheduled_duration_minutes ? ` · ${plan.scheduled_duration_minutes} min` : ""}
                            </span>
                          )}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {Number(plan.completed_count) || 0} / {Number(plan.exercise_count) || 0} completed
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusColors[plan.activity_status] || statusColors.Active}`}>
                        {plan.activity_status || "Active"}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        {plan.user_id && !planLocked && (
                          <button
                            type="button"
                            onClick={() => handleEdit(plan)}
                            aria-label={`Edit ${plan.plan_name}`}
                            className="rounded-lg p-2 text-orange-500 transition hover:bg-orange-500/10 hover:text-orange-600"
                            title="Edit workout plan"
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        {planLocked && (
                          <span
                            className="inline-flex items-center gap-1 px-2 text-xs text-slate-500"
                            title={plan.has_started ? "This workout has started or finished and is locked." : "Workout dates in the past are locked."}
                            aria-label="Workout plan is locked"
                          >
                            <LockKeyhole size={15} /> Locked
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(plan)}
                          disabled={planLocked}
                          aria-label={`Delete ${plan.plan_name}`}
                          title={planLocked ? "Started, completed, or past workout plans are locked." : "Delete workout plan"}
                          className="rounded-lg p-2 text-red-400 transition hover:bg-red-500/10 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-slate-200 px-5 py-3 text-sm text-slate-500 dark:border-slate-800">
          Showing {filtered.length} of {plans.length} plans
        </div>
      </div>
    </div>
  );
}
