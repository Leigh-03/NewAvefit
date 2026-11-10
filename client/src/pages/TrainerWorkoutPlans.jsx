import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, ClipboardList, Dumbbell, Eye, LockKeyhole, Pencil, Plus, Search, Target, Trash2, UserRound, X } from "lucide-react";
import trainerApi from "../trainerApi";
import ExercisePicker from "../components/workout/ExercisePicker";
import { getWorkoutGoalRules } from "../utils/workoutGoalRules";
import {
  exerciseMatchesProgram,
  getProgramForDate,
  requiresConservativeWorkout,
} from "../utils/trainingPrograms";

const formatFitnessGoal = (goal) => goal === "Muscle Gain" ? "Gain Weight" : goal;
const formatPlanName = (firstName, lastName, trainingProgram) => {
  const memberName = `${firstName || ""} ${lastName || ""}`.trim() || "Member";
  return `${memberName}'s ${trainingProgram || "Workout"} day Workout Routine`;
};
const getPlanDisplayName = (plan) => (
  /^Program:/i.test(String(plan.plan_name || ""))
    ? formatPlanName(plan.member_name, "", plan.training_program || String(plan.plan_name).replace(/^Program:\s*/i, ""))
    : plan.plan_name
);

function PlanDetailsModal({ plan, onClose, onEdit, onApprove, onApproveDeletion, onRejectDeletion }) {
  const sessions = Array.isArray(plan.sessions) ? plan.sessions : [];
  const isInitialCoachRequest = plan.request_type === "coach_created" && sessions.length === 0;
  const hasPendingApproval = plan.approval_status === "Pending" && !isInitialCoachRequest;
  const injuries = toList(plan.injuries).filter((item) => item !== "None");
  const healthConditions = toList(plan.health_conditions).filter((item) => item !== "None");
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="trainer-plan-details-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111]" onClick={(event) => event.stopPropagation()}>
        <header className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-orange-50 via-white to-white p-5 dark:border-slate-800 dark:from-orange-500/[0.08] dark:via-[#111] dark:to-[#111] sm:p-6">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full bg-orange-400/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Workout plan details</p>
              <h2 id="trainer-plan-details-title" className="mt-1.5 break-words text-2xl font-black leading-tight text-slate-900 dark:text-white">{getPlanDisplayName(plan)}</h2>
              <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                <span className="inline-flex items-center gap-1.5 font-semibold"><UserRound size={14} className="text-slate-400" />{plan.member_name || "Member"}</span>
                <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">·</span>
                <span>{formatFitnessGoal(plan.fitness_goal) || "Goal not set"}</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:bg-white/[0.04] dark:text-slate-200">
                  <Target size={14} className="text-orange-500" />
                  Target weight: {plan.target_weight == null ? "Not set" : `${plan.target_weight} kg`}
                </span>
                {plan.training_program && (
                  <span className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-orange-200 bg-orange-100/70 px-2.5 py-1 text-xs font-semibold text-orange-800 dark:border-orange-500/25 dark:bg-orange-500/10 dark:text-orange-300">
                    <Dumbbell size={14} />
                    {plan.is_program_switch
                      ? `${plan.previous_training_program || "Scheduled"} → ${plan.training_program}`
                      : `Program: ${plan.training_program}`}
                  </span>
                )}
              </div>
              {(plan.request_type === "coach_created" || plan.scheduled_date || hasPendingApproval || plan.deletion_request_status === "Pending") && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {plan.request_type === "coach_created" && (
                    <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-100/70 px-2.5 py-1 text-[11px] font-semibold text-violet-800 dark:border-violet-500/25 dark:bg-violet-500/10 dark:text-violet-300">
                      {sessions.length ? "Member submitted for review" : "Coach workout requested"}
                    </span>
                  )}
                  {plan.scheduled_date && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <CalendarDays size={14} />
                      {new Date(`${String(plan.scheduled_date).slice(0, 10)}T00:00:00`).toLocaleDateString()}
                    </span>
                  )}
                  {(hasPendingApproval || plan.deletion_request_status === "Pending") && (
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                      {plan.deletion_request_status === "Pending" ? "Deletion request awaiting review" : "Awaiting approval"}
                    </span>
                  )}
                </div>
              )}
              {!plan.scheduled_date && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Workout date not set</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close plan details" className="relative shrink-0 rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-500 shadow-sm transition hover:border-orange-300 hover:bg-orange-50 hover:text-slate-800 dark:border-slate-700 dark:bg-white/[0.04] dark:hover:border-orange-500/40 dark:hover:bg-orange-500/10 dark:hover:text-white">
              <X size={19} />
            </button>
          </div>
        </header>
        <div className="space-y-3 p-5 sm:p-6">
          {plan.deletion_request_status === "Pending" && (
            <section className="rounded-xl border border-red-300 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
              <p className="text-sm font-bold text-red-700 dark:text-red-300">Member requested plan deletion</p>
              <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{plan.deletion_request_reason}</p>
              <p className="mt-1 text-xs text-slate-500">
                Requested {plan.deletion_requested_at ? new Date(plan.deletion_requested_at).toLocaleString() : ""}
              </p>
            </section>
          )}
          {(injuries.length > 0 || healthConditions.length > 0) && (
            <section className="rounded-xl border border-amber-300/50 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/10">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-200">Member health and safety information</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {[injuries.length ? `Injury/pain areas: ${injuries.join(", ")}` : "", healthConditions.length ? `Health conditions: ${healthConditions.join(", ")}` : ""].filter(Boolean).join(" · ")}
              </p>
              <p className="mt-2 text-xs text-slate-500">Review any requested exercise adjustment with the member and defer medical restrictions to their healthcare professional.</p>
            </section>
          )}
          {sessions.length ? sessions.map((session, index) => (
            <article key={`${session.exercise_id}-${index}`} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">{index + 1}. {session.exercise_name || "Exercise"}</h3>
                  <p className="mt-1 text-xs text-slate-500">{[session.muscle_group, session.equipment].filter(Boolean).join(" · ") || "No exercise details"}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${session.completed ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>
                  {session.completed ? "Completed" : "Scheduled"}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
                <strong>{session.sets ?? "—"}</strong> sets × <strong>{session.reps ?? "—"}</strong> reps
                {session.session_date ? ` · ${new Date(`${String(session.session_date).slice(0, 10)}T00:00:00`).toLocaleDateString()}` : ""}
              </p>
            </article>
          )) : (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-white/5">
              {plan.request_type === "coach_created"
                ? "No exercises yet. Create the workout by adding at least 3 exercises."
                : "No exercises are attached to this plan."}
            </p>
          )}
        </div>
        <footer className="flex flex-wrap justify-end gap-3 border-t border-slate-200 p-4 dark:border-slate-800">
          <div className="flex flex-wrap gap-2">
            {hasPendingApproval && (
              <>
              <button type="button" onClick={onEdit} className="rounded-lg border border-orange-500/30 px-3 py-2 text-sm font-semibold text-orange-600 hover:bg-orange-500/10 dark:text-orange-400">Edit request</button>
              <button type="button" onClick={onApprove} disabled={sessions.length < 3} title={sessions.length < 3 ? "Create at least 3 exercises before approval." : undefined} className="rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">Approve</button>
              </>
            )}
            {plan.deletion_request_status === "Pending" && (
              <>
                <button type="button" onClick={onRejectDeletion} className="rounded-lg border border-slate-400 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-white/10">Decline deletion</button>
                <button type="button" onClick={onApproveDeletion} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700">Approve deletion</button>
              </>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

const statusColors = {
  Active: "border-green-200 bg-green-50 text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300",
  "Pending Approval": "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  Rejected: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
  Incomplete: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  Complete: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300",
  Absent: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
};

const statusFilterOptions = [
  "Pending Approval",
  "Active",
  "Complete",
  "Incomplete",
  "Absent",
  "Coach workout requested",
];
const isInitialCoachWorkoutRequest = (plan) => (
  String(plan.request_type || "").toLowerCase() === "coach_created" &&
  Number(plan.exercise_count || 0) === 0
);
const getPlanDisplayStatuses = (plan) => {
  const statuses = [];
  if (
    plan.approval_status === "Pending" &&
    plan.deletion_request_status !== "Pending" &&
    !isInitialCoachWorkoutRequest(plan)
  ) {
    statuses.push("Pending Approval");
  }
  if (plan.request_type === "coach_created" && plan.deletion_request_status !== "Pending") {
    statuses.push(Number(plan.exercise_count) > 0 ? "Active" : "Coach workout requested");
  }
  if (
    plan.request_type !== "coach_created" &&
    plan.approval_status !== "Pending" &&
    plan.approval_status !== "Rejected" &&
    !plan.deletion_request_status
  ) {
    statuses.push(plan.activity_status || "Active");
  }
  return statuses;
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

function PlanModal({ members, exercises, plans, plan, initialMemberId = "", initialWorkoutDate = "", lockDate = false, onClose, onSave }) {
  const [form, setForm] = useState(() => {
    const userId = plan ? String(plan.user_id) : String(initialMemberId || "");
    const member = members.find((item) => String(item.user_id) === userId);
    const doseRules = getWorkoutGoalRules(member?.fitness_goal);
    const reservedDates = plans
      .filter((item) => String(item.user_id) === userId)
      .map((item) => item.scheduled_date);
    const sessions = (plan?.sessions || []).map((session) => ({
      exercise_id: String(session.exercise_id || ""),
      sets: String(session.sets ?? ""),
      reps: String(session.reps ?? ""),
    }));
    while (sessions.length < 3) {
      sessions.push({
        exercise_id: "",
        sets: String(doseRules.sets[0]),
        reps: String(doseRules.reps[0]),
      });
    }

    return {
      user_id: userId,
      plan_name: plan?.plan_name || "",
      goal: plan?.fitness_goal || plan?.goal || member?.fitness_goal || "",
      session_date: plan?.scheduled_date || initialWorkoutDate || (member ? nextPreferredDate(member.preferred_days, reservedDates) : ""),
      sessions,
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const selectedMember = members.find((member) => String(member.user_id) === form.user_id);
  const isMemberRequestedWorkout = plan?.request_type === "coach_created";
  const doseRules = getWorkoutGoalRules(selectedMember?.fitness_goal);
  const keepingExistingDate = plan
    && String(plan.scheduled_date || "").slice(0, 10) === form.session_date;
  const existingPlanOnDate = !keepingExistingDate && plans.find((item) =>
    String(item.user_id) === form.user_id
    && String(item.scheduled_date || "").slice(0, 10) === form.session_date
    && String(item.approval_status || "").toLowerCase() === "approved"
    && String(item.workout_plan_id) !== String(plan?.workout_plan_id)
  );
  const availableDays = toList(selectedMember?.preferred_days);
  const memberAvailabilityDays = toList(selectedMember?.weekly_availability)
    .map((availability) => typeof availability === "string" ? availability : availability.day_of_week)
    .filter(Boolean);
  const preferredWorkoutDays = memberAvailabilityDays.length
    ? [...new Set(memberAvailabilityDays)]
    : availableDays;
  const trainingProgram = plan?.training_program || getProgramForDate(form.session_date, availableDays);
  const preferredDifficulty = EXERCISE_DIFFICULTIES.find(
    (difficulty) => difficultyRank(difficulty) === allowedDifficultyRank(selectedMember?.activity_level)
  );
  const matchingExercises = preferredDifficulty
    ? exercises.filter((exercise) => (
      isExerciseAllowedForMember(exercise, selectedMember?.activity_level) &&
      (!trainingProgram || exerciseMatchesProgram(exercise, trainingProgram)) &&
      (!requiresConservativeWorkout(exercise, toList(selectedMember?.injuries), toList(selectedMember?.health_conditions))
        || String(exercise.difficulty || "").toLowerCase() === "beginner")
    ))
    : [];
  const getSessionDoseRules = (session) => {
    const exercise = exercises.find((item) => String(item.exercise_id) === String(session.exercise_id));
    if (exercise && requiresConservativeWorkout(exercise, toList(selectedMember?.injuries), toList(selectedMember?.health_conditions))) {
      return plan ? { sets: [1, 6], reps: [3, 16] } : { sets: [1, 2], reps: [6, 10] };
    }
    return doseRules || { sets: [1, 6], reps: [3, 16] };
  };

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
    if (session.exercise_id && !matchingExercises.some((exercise) => String(exercise.exercise_id) === String(session.exercise_id))) {
      errors[`sessions.${index}.exercise_id`] = `Choose an exercise for the ${trainingProgram || "selected"} program and member's level.`;
    }
    const sessionRules = getSessionDoseRules(session);
    const setsError = integerRangeError(session.sets, "Sets", sessionRules.sets[0], sessionRules.sets[1]);
    if (setsError) errors[`sessions.${index}.sets`] = setsError;
    const repsError = integerRangeError(session.reps, "Reps", sessionRules.reps[0], sessionRules.reps[1]);
    if (repsError) errors[`sessions.${index}.reps`] = repsError;
    return errors;
  };

  const handleSubmit = async () => {
    const planName = trainingProgram && selectedMember
      ? formatPlanName(selectedMember.first_name, selectedMember.last_name, trainingProgram)
      : "";
    const nextErrors = {};
    if (!form.user_id) nextErrors.user_id = "Choose a member.";
    if (!form.session_date) nextErrors.session_date = "Workout date is required.";
    if (existingPlanOnDate) {
      nextErrors.session_date = "A workout plan already exists for this member on that date. Edit the existing plan instead.";
    }
    if (form.sessions.length < 3) nextErrors.sessions = "Add at least 3 exercises.";

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
        training_program: trainingProgram,
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
    const chosenExercise = field === "exercise_id"
      ? exercises.find((exercise) => String(exercise.exercise_id) === String(value))
      : null;
    const injuryAdjusted = chosenExercise && requiresConservativeWorkout(
      chosenExercise,
      toList(selectedMember?.injuries),
      toList(selectedMember?.health_conditions)
    );
    const nextDose = injuryAdjusted && !plan
      ? { sets: [1, 2], reps: [6, 10] }
      : doseRules || { sets: [1, 6], reps: [3, 16] };
    setForm((current) => ({
      ...current,
      sessions: current.sessions.map((session, sessionIndex) =>
        sessionIndex === index
          ? {
            ...session,
            [field]: value,
            ...(field === "exercise_id" ? { sets: String(nextDose.sets[0]), reps: String(nextDose.reps[0]) } : {}),
          }
          : session
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
      ? integerRangeError(value, "Sets", nextDose.sets[0], nextDose.sets[1])
      : integerRangeError(value, "Reps", nextDose.reps[0], nextDose.reps[1]);
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
              Member
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
                  setForm({
                    ...form,
                    user_id: event.target.value,
                    goal,
                    session_date: sessionDate,
                    plan_name: form.plan_name || (member ? formatPlanName(member.first_name, member.last_name, trainingProgram) : ""),
                    sessions: form.sessions.map((session) => {
                      const exercise = exercises.find((item) => String(item.exercise_id) === String(session.exercise_id));
                      if (exercise && !isExerciseAllowedForMember(exercise, memberDifficulty)) {
                        return { ...session, exercise_id: "" };
                      }
                      if (!session.exercise_id && member) {
                        const memberDoseRules = getWorkoutGoalRules(member.fitness_goal);
                        return {
                          ...session,
                          sets: String(memberDoseRules.sets[0]),
                          reps: String(memberDoseRules.reps[0]),
                        };
                      }
                      return session;
                    }),
                  });
                  setFieldErrors((current) => ({
                    ...current,
                    user_id: "",
                    goal: goal.trim() ? "" : current.goal,
                    session_date: "",
                  }));
                  setError("");
                }}
                required
                aria-invalid={Boolean(fieldErrors.user_id)}
                className="trainer-field w-full appearance-none rounded-lg px-4 py-2.5 text-sm"
              >
                <option value="">Select a roster member...</option>
                {members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.first_name} {member.last_name}
                  </option>
                ))}
              </select>
            </div>
            {renderFieldError("user_id")}
          </div>
          <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 text-sm font-semibold text-slate-700 dark:text-slate-200">
            {trainingProgram ? `Program: ${trainingProgram}` : "Choose a member and workout date to view the assigned program."}
            {selectedMember && trainingProgram && (
              <p className="mt-1 text-xs font-normal">
                Plan name: {selectedMember.first_name}&apos;s {trainingProgram} day Workout Routine
              </p>
            )}
          </div>
          <div>
            <label htmlFor="trainer-plan-goal" className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Member fitness goal (read-only)
            </label>
            <input
              id="trainer-plan-goal"
              type="text"
              value={formatFitnessGoal(selectedMember?.fitness_goal) || ""}
              readOnly
              placeholder="Select a member to view their fitness goal"
              className={inputClass("goal")}
            />
          </div>
          {selectedMember && (
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wide text-orange-500">Member assessment</p>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                {[
                  ["Goal", formatFitnessGoal(selectedMember.fitness_goal) || "Not specified"],
                  ["Target weight", selectedMember.target_weight ? `${selectedMember.target_weight} kg` : "Not specified"],
                  ["BMI", calculateBmi(selectedMember)],
                  ["Activity", selectedMember.activity_level || "Not specified"],
                  ["Height / weight", `${selectedMember.height ? `${selectedMember.height} cm` : "Height not set"} · ${selectedMember.latest_weight || selectedMember.weight ? `${selectedMember.latest_weight || selectedMember.weight} kg` : "Weight not set"}`],
                  ["Preferred Workout Day", preferredWorkoutDays.join(", ") || "Not specified"],
                  ["Weekly frequency", selectedMember.workout_days_per_week ? `${selectedMember.workout_days_per_week} days` : "Not specified"],
                  ["Preferred intensity", INTENSITY_LABELS[Number(selectedMember.intensity)] || "Not specified"],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-2 border-t border-orange-500/20 pt-3 text-xs sm:grid-cols-2">
                <p className="text-amber-500"><strong>Injuries / pain:</strong> {toList(selectedMember.injuries).join(", ") || "None recorded"}</p>
                <p className="text-amber-500"><strong>Health conditions:</strong> {toList(selectedMember.health_conditions).join(", ") || "None recorded"}</p>
              </div>
              {toList(selectedMember.weekly_availability).length > 0 && (
                <div className="mt-3 border-t border-orange-500/20 pt-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-orange-500">Member-provided availability</p>
                  <div className="flex flex-wrap gap-2">
                    {toList(selectedMember.weekly_availability).map((slot) => (
                      <span key={slot.day_of_week} className="rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:bg-white/5 dark:text-slate-300">
                        {slot.day_of_week}: {slot.time_preference || `${slot.start_time}–${slot.end_time}`}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div>
            <label htmlFor="trainer-plan-date" className="mb-1 block text-sm font-medium text-slate-600 dark:text-slate-300">
              Workout Date
            </label>
            <input
              id="trainer-plan-date"
              type="date"
              required
              min={manilaDateString()}
              value={form.session_date}
              disabled={isMemberRequestedWorkout || lockDate}
              onChange={(event) => {
                const sessionDate = event.target.value;
                if (!isPreferredWorkoutDate(sessionDate, availableDays)) {
                  setForm({ ...form, session_date: "" });
                  setFieldError("session_date", `Choose one of the member's preferred workout days: ${availableDays.join(", ")}.`);
                  return;
                }
                setForm({ ...form, session_date: sessionDate });
                setFieldErrors((current) => ({
                  ...current,
                  session_date: sessionDate ? "" : "Workout date is required.",
                }));
                setError("");
              }}
              aria-invalid={Boolean(fieldErrors.session_date)}
              className={inputClass("session_date")}
            />
            {renderFieldError("session_date")}
            {(isMemberRequestedWorkout || lockDate) && (
              <p className="mt-1 text-xs text-slate-500">
                {isMemberRequestedWorkout
                  ? "This date was requested by the member and cannot be changed."
                  : "This date is based on the member's preferred workout day and cannot be changed here."}
              </p>
            )}
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
          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800 dark:text-white">Routine Exercises (minimum 3)</p>
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
                    sessions: [...form.sessions, {
                      exercise_id: "",
                      sets: String(doseRules.sets[0]),
                      reps: String(doseRules.reps[0]),
                    }],
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
                    <label htmlFor={`sessions-${index}-exercise_id`} className="mb-1 flex h-5 items-center whitespace-nowrap text-xs font-medium text-slate-500">Workout</label>
                    <ExercisePicker
                      id={`sessions-${index}-exercise_id`}
                      value={session.exercise_id}
                      disabled={!selectedMember || !preferredDifficulty}
                      placeholder={
                        !selectedMember ? "Select a member first" :
                          !preferredDifficulty ? "Experience level unavailable" :
                            matchingExercises.length ? "Select an exercise" : "No matching exercises"
                      }
                      options={matchingExercises.map((exercise) => ({
                        ...exercise,
                        disabled: form.sessions.some((other, otherIndex) =>
                          otherIndex !== index && String(other.exercise_id) === String(exercise.exercise_id)
                        ),
                      }))}
                      onChange={(exerciseId) => updateSessionField(index, "exercise_id", exerciseId)}
                      ariaInvalid={Boolean(fieldErrors[`sessions.${index}.exercise_id`])}
                      ariaDescribedby={fieldErrors[`sessions.${index}.exercise_id`] ? `sessions-${index}-exercise_id-error` : undefined}
                    />
                    {renderFieldError(`sessions.${index}.exercise_id`)}
                  </div>
                  <div className="min-w-0">
                    <label htmlFor={`sessions-${index}-sets`} className="mb-1 flex h-5 items-center whitespace-nowrap text-xs font-medium text-slate-500">Sets ({getSessionDoseRules(session).sets[0]}–{getSessionDoseRules(session).sets[1]})</label>
                    <input
                      id={`sessions-${index}-sets`}
                      aria-label={`Exercise ${index + 1} sets`}
                      type="number"
                      min={getSessionDoseRules(session).sets[0]}
                      max={getSessionDoseRules(session).sets[1]}
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
                    <label htmlFor={`sessions-${index}-reps`} className="mb-1 flex h-5 items-center whitespace-nowrap text-xs font-medium text-slate-500">Reps ({getSessionDoseRules(session).reps[0]}–{getSessionDoseRules(session).reps[1]})</label>
                    <input
                      id={`sessions-${index}-reps`}
                      aria-label={`Exercise ${index + 1} reps`}
                      type="number"
                      min={getSessionDoseRules(session).reps[0]}
                      max={getSessionDoseRules(session).reps[1]}
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
                    disabled={form.sessions.length <= 3}
                    onClick={() => {
                      setForm({ ...form, sessions: form.sessions.filter((_, itemIndex) => itemIndex !== index) });
                      setFieldErrors((current) => Object.fromEntries(
                        Object.entries(current).filter(([key]) => !key.startsWith("sessions."))
                      ));
                    }}
                    aria-label={`Remove exercise ${index + 1}`}
                    title={form.sessions.length <= 3 ? "At least 3 exercises are required." : "Remove exercise"}
                    className="col-span-2 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent sm:col-span-1"
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [plans, setPlans] = useState([]);
  const [members, setMembers] = useState([]);
  const [missingWorkouts, setMissingWorkouts] = useState([]);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [rosterFilter, setRosterFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [initialMemberId, setInitialMemberId] = useState("");
  const [initialWorkoutDate, setInitialWorkoutDate] = useState("");
  const [viewingPlan, setViewingPlan] = useState(null);
  const [rejectingPlan, setRejectingPlan] = useState(null);
  const [rejectionType, setRejectionType] = useState("plan");
  const [rejectionReason, setRejectionReason] = useState("");
  const [rejectionError, setRejectionError] = useState("");
  const [fetchError, setFetchError] = useState("");
  const [reviewingPlanId, setReviewingPlanId] = useState(null);

  const fetchData = useCallback(async () => {
    setFetchError("");
    try {
      const [plansResponse, membersResponse, missingWorkoutsResponse, exercisesResponse] = await Promise.all([
        trainerApi.get("/me/workout-plans"),
        trainerApi.get("/me/roster"),
        trainerApi.get("/me/missing-workouts"),
        trainerApi.get("/me/exercises"),
      ]);
      const loadedPlans = plansResponse.data.data || [];
      const loadedMembers = membersResponse.data.data || [];
      const loadedMissingWorkouts = missingWorkoutsResponse.data.data || [];
      setPlans(loadedPlans);
      setMembers(loadedMembers);
      setMissingWorkouts(loadedMissingWorkouts);
      const requestedMemberId = searchParams.get("createFor");
      const requestedMemberName = searchParams.get("createForName");
      if (requestedMemberId || requestedMemberName) {
        const matchingMembers = requestedMemberId
          ? loadedMembers.filter((item) => String(item.user_id) === requestedMemberId)
          : loadedMembers.filter((item) => String(item.first_name || "").trim().toLowerCase() === requestedMemberName.trim().toLowerCase());
        const requestedMember = matchingMembers.length === 1 ? matchingMembers[0] : null;
        if (requestedMember) {
          setInitialMemberId(String(requestedMember.user_id));
          setInitialWorkoutDate(
            loadedMissingWorkouts.find((item) => String(item.user_id) === String(requestedMember.user_id))?.workout_date || ""
          );
          setEditingPlan(null);
          setShowModal(true);
        } else {
          setFetchError(matchingMembers.length > 1
            ? "This workout reminder matches multiple roster members. Select the correct member to create the plan."
            : "The member from this workout reminder is not available in your roster.");
        }
        setSearchParams({}, { replace: true });
      }
      const requestedPlanId = Number(searchParams.get("planId"));
      if (Number.isInteger(requestedPlanId) && requestedPlanId > 0) {
        const requestedPlan = loadedPlans.find((item) => Number(item.workout_plan_id) === requestedPlanId);
        if (requestedPlan) {
          setViewingPlan(requestedPlan);
          setSearchParams({}, { replace: true });
        } else {
          setFetchError("The workout plan request from this notification could not be found in your current plans.");
          setSearchParams({}, { replace: true });
        }
      }
      setExercises(exercisesResponse.data.data || []);
    } catch (err) {
      console.error(err);
      setFetchError(err.response?.data?.message || err.message || "Couldn't load workout plans.");
    } finally {
      setLoading(false);
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const handleCreateMissingWorkout = (member) => {
    const existingCoachRequest = plans.find((plan) =>
      String(plan.user_id) === String(member.user_id)
      && String(plan.scheduled_date || "").slice(0, 10) === member.workout_date
      && String(plan.request_type || "").toLowerCase() === "coach_created"
      && Number(plan.exercise_count || 0) === 0
    );
    if (existingCoachRequest) {
      setInitialMemberId("");
      setInitialWorkoutDate("");
      handleEdit(existingCoachRequest);
      return;
    }

    setEditingPlan(null);
    setInitialMemberId(String(member.user_id));
    setInitialWorkoutDate(member.workout_date);
    setShowModal(true);
  };

  const handleReviewRequest = async (plan, decision, reason = "") => {
    setReviewingPlanId(plan.workout_plan_id);
    setFetchError("");
    try {
      await trainerApi.put(`/me/workout-plans/${plan.workout_plan_id}/review`, { decision, reason });
      await fetchData();
      return true;
    } catch (err) {
      const message = err.response?.data?.message || "Unable to review this workout plan request.";
      setFetchError(message);
      if (decision === "reject") setRejectionError(message);
      return false;
    } finally {
      setReviewingPlanId(null);
    }
  };

  const handleDeletionReview = async (plan, decision, reason = "") => {
    setReviewingPlanId(plan.workout_plan_id);
    setFetchError("");
    try {
      await trainerApi.put(`/me/workout-plans/${plan.workout_plan_id}/deletion-review`, { decision, reason });
      await fetchData();
      return true;
    } catch (err) {
      const message = err.response?.data?.message || "Unable to review this deletion request.";
      setFetchError(message);
      if (decision === "reject") setRejectionError(message);
      return false;
    } finally {
      setReviewingPlanId(null);
    }
  };

  const approveDeletionRequest = async (plan) => {
    if (!window.confirm(`Approve deletion of "${plan.plan_name}"? The plan and its workouts will be permanently removed.`)) return false;
    return handleDeletionReview(plan, "approve");
  };

  const submitRejection = async () => {
    const reason = rejectionReason.trim();
    if (reason.length < 5 || reason.length > 1000) {
      setRejectionError("Enter a reason between 5 and 1000 characters.");
      return;
    }
    const submitted = rejectionType === "deletion"
      ? await handleDeletionReview(rejectingPlan, "reject", reason)
      : await handleReviewRequest(rejectingPlan, "reject", reason);
    if (submitted) {
      setRejectingPlan(null);
      setRejectionReason("");
      setRejectionError("");
    }
  };

  const query = search.trim().toLowerCase();
  const filtered = plans.filter((plan) =>
    plan.plan_name?.toLowerCase().includes(query) ||
    plan.fitness_goal?.toLowerCase().includes(query) ||
    plan.goal?.toLowerCase().includes(query) ||
    plan.member_name?.toLowerCase().includes(query)
  ).filter((plan) => statusFilter === "All" || getPlanDisplayStatuses(plan).includes(statusFilter))
    .filter((plan) => rosterFilter === "All" || String(plan.user_id) === rosterFilter);
  const requestAlreadyReviewed = fetchError === "This workout plan request has already been reviewed.";

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      {showModal && (
        <PlanModal
          key={editingPlan?.workout_plan_id ?? `new-plan-${initialMemberId}-${initialWorkoutDate}`}
          members={members}
          exercises={exercises}
          plans={plans}
          plan={editingPlan}
          initialMemberId={initialMemberId}
          initialWorkoutDate={initialWorkoutDate}
          lockDate={Boolean(initialMemberId)}
          onClose={() => {
            setShowModal(false);
            setEditingPlan(null);
            setInitialMemberId("");
            setInitialWorkoutDate("");
          }}
          onSave={fetchData}
        />
      )}
      {viewingPlan && (
        <PlanDetailsModal
          plan={viewingPlan}
          onClose={() => setViewingPlan(null)}
          onEdit={() => { handleEdit(viewingPlan); setViewingPlan(null); }}
          onApprove={async () => {
            if (await handleReviewRequest(viewingPlan, "approve")) setViewingPlan(null);
          }}
          onApproveDeletion={async () => {
            if (await approveDeletionRequest(viewingPlan)) setViewingPlan(null);
          }}
          onRejectDeletion={() => {
            setRejectingPlan(viewingPlan);
            setRejectionType("deletion");
            setRejectionReason("");
            setRejectionError("");
            setViewingPlan(null);
          }}
        />
      )}
      {rejectingPlan && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="workout-rejection-title" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111]">
            <header className="border-b border-slate-200 p-5 dark:border-slate-800">
              <h2 id="workout-rejection-title" className="text-lg font-bold text-slate-900 dark:text-white">{rejectionType === "deletion" ? "Decline deletion request" : "Reject workout plan"}</h2>
              <p className="mt-1 text-sm text-slate-500">{rejectingPlan.plan_name} · {rejectingPlan.member_name}</p>
            </header>
            <div className="space-y-2 p-5">
              <label htmlFor="workout-rejection-reason" className="block text-sm font-medium text-slate-700 dark:text-slate-200">{rejectionType === "deletion" ? "Response to member" : "Reason for rejection"}</label>
              <textarea
                id="workout-rejection-reason"
                rows={4}
                maxLength={1000}
                required
                autoFocus
                value={rejectionReason}
                onChange={(event) => {
                  setRejectionReason(event.target.value);
                  setRejectionError("");
                }}
                aria-invalid={Boolean(rejectionError)}
                className="trainer-field w-full rounded-lg px-4 py-3 text-sm"
                placeholder={rejectionType === "deletion" ? "Explain why the deletion request is declined. This will be emailed to the member." : "Explain what needs to be corrected. This reason will be emailed to the member."}
              />
              <p className="text-xs text-slate-500">The member will receive this response by email.</p>
              {rejectionError && <p role="alert" className="text-sm text-red-500">{rejectionError}</p>}
            </div>
            <footer className="flex justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-800">
              <button type="button" onClick={() => { setRejectingPlan(null); setRejectionReason(""); setRejectionError(""); }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancel</button>
              <button type="button" onClick={submitRejection} disabled={reviewingPlanId === rejectingPlan.workout_plan_id} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">{reviewingPlanId === rejectingPlan.workout_plan_id ? "Submitting..." : rejectionType === "deletion" ? "Decline deletion" : "Reject plan"}</button>
            </footer>
          </section>
        </div>
      )}

      <header className="ave-page-hero flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Training programming</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">Workout Plans</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Build and track personalized training plans for your roster.</p>
        </div>
      </header>

      {fetchError && (
        <div
          role={requestAlreadyReviewed ? "status" : "alert"}
          aria-live={requestAlreadyReviewed ? "polite" : "assertive"}
          className={`rounded-xl border px-4 py-3 text-sm ${
            requestAlreadyReviewed
              ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
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

      <section aria-labelledby="missing-workouts-title" className="trainer-card overflow-hidden rounded-2xl border">
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2 id="missing-workouts-title" className="font-bold text-slate-900 dark:text-white">Members Missing a Workout</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Roster members who have no workout scheduled for tomorrow's preferred workout day.</p>
          </div>
          <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-bold text-red-600 dark:text-red-300">
            {loading ? "…" : missingWorkouts.length}
          </span>
        </div>
        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(2)].map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
        ) : missingWorkouts.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">No roster members have a missing workout tomorrow.</p>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {missingWorkouts.map((member) => (
              <li key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-semibold text-slate-900 dark:text-white">{member.member_name || "Member"}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Missing workout · {new Date(`${member.workout_date}T00:00:00`).toLocaleDateString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCreateMissingWorkout(member)}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-orange-700"
                  aria-label={`Create workout plan for ${member.member_name || "member"}`}
                >
                  <Plus size={16} aria-hidden="true" />
                  Create Plan
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

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
        {["All", ...statusFilterOptions].map((status) => <option key={status} value={status}>{status === "All" ? "All Status" : status}</option>)}
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
                    <th key={heading} className={`whitespace-nowrap px-5 py-4 font-semibold text-slate-600 dark:text-slate-300 ${heading === "Status" ? "min-w-[150px]" : ""}`}>
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
                  const pendingApproval = plan.approval_status === "Pending"
                    && plan.deletion_request_status !== "Pending"
                    && !isInitialCoachWorkoutRequest(plan);
                  const rejectedPlan = plan.approval_status === "Rejected";
                  const planLocked = Boolean(pendingApproval || rejectedPlan || plan.deletion_request_status === "Pending" || plan.has_started || pastWorkoutDate);
                  const memberRequestedWorkoutNeedsCreation = plan.user_id != null &&
                    String(plan.request_type || "").toLowerCase() === "coach_created" &&
                    Number(plan.exercise_count || 0) === 0;
                  const canEditPlan = Boolean(                    plan.user_id &&
                    plan.deletion_request_status !== "Pending" &&
                    !plan.has_started &&
                    (pendingApproval || rejectedPlan || !pastWorkoutDate)
                  );
                  return (
                  <tr key={plan.workout_plan_id} className="hover:bg-orange-500/5">
                    <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-800 dark:text-white">{getPlanDisplayName(plan)}</td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{formatFitnessGoal(plan.fitness_goal) || "—"}</td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">{plan.member_name || "Template"}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-500">
                      {plan.scheduled_date ? (
                        <>
                          {new Date(`${plan.scheduled_date}T00:00:00`).toLocaleDateString()}
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300">
                      {Number(plan.completed_count) || 0} / {Number(plan.exercise_count) || 0} completed
                    </td>
                    <td className="min-w-[150px] px-4 py-4">
                      <div className="flex w-fit max-w-[180px] flex-col items-start gap-2">
                        {pendingApproval && (
                          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold leading-none text-amber-200">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                            Pending approval
                          </span>
                        )}
                        {plan.deletion_request_status === "Pending" && (
                          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-red-300/60 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold leading-none text-red-200">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-300" />
                            Rejected
                          </span>
                        )}
                        {plan.is_program_switch && (
                          <span className="inline-flex min-h-9 w-full items-center gap-2 rounded-xl border border-orange-300/60 bg-orange-500/10 px-2.5 py-1.5 text-orange-200">
                            <span className="shrink-0 rounded-md bg-orange-500/15 px-1.5 py-1 text-[9px] font-bold uppercase tracking-wide text-orange-300">Switch</span>
                            <span className="min-w-0 break-words text-xs font-semibold leading-tight">{plan.training_program}</span>
                          </span>
                        )}
                        {plan.request_type === "coach_created" && plan.deletion_request_status !== "Pending" && (
                          <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold leading-none ${
                            Number(plan.exercise_count) > 0
                              ? statusColors.Active
                              : "border-violet-300/60 bg-violet-500/10 text-violet-200"
                          }`}>
                            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${
                              Number(plan.exercise_count) > 0 ? "bg-green-500" : "bg-violet-300"
                            }`} />
                            {Number(plan.exercise_count) > 0 ? "Active" : "Coach workout requested"}
                          </span>
                        )}
                        {plan.approval_status === "Rejected" && plan.deletion_request_status !== "Pending" && (
                          <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-red-300/60 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold leading-none text-red-200">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-300" />
                            Rejected
                          </span>
                        )}
                        {plan.request_type !== "coach_created" &&
                          plan.approval_status !== "Pending" &&
                          plan.approval_status !== "Rejected" &&
                          !plan.deletion_request_status && (
                          <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusColors[plan.activity_status] || statusColors.Active}`}>
                            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${plan.activity_status === "Complete" ? "bg-orange-400" : "bg-green-400"}`} />
                            {plan.activity_status || "Active"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setViewingPlan(plan)}
                          aria-label={`View exercises in ${plan.plan_name}`}
                          title="View workout plan exercises"
                          className="rounded-lg p-2 text-slate-500 transition hover:bg-orange-500/10 hover:text-orange-600"
                        >
                          <Eye size={16} />
                        </button>
                        {plan.deletion_request_status === "Pending" && (
                          <button
                            type="button"
                            onClick={() => approveDeletionRequest(plan)}
                            disabled={reviewingPlanId === plan.workout_plan_id}
                            aria-label={`Approve deletion of ${plan.plan_name}`}
                            title={`Approve deletion of ${plan.plan_name}`}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                            {reviewingPlanId === plan.workout_plan_id ? "Deleting..." : "Approve deletion"}
                          </button>
                        )}
                        {memberRequestedWorkoutNeedsCreation && (
                          <button
                            type="button"
                            onClick={() => handleEdit(plan)}
                            aria-label={`Create workout plan for ${plan.plan_name}`}
                            title="Create workout plan"
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-orange-600"
                          >
                            <Plus size={14} />
                            Create
                          </button>
                        )}
                        {canEditPlan && !pendingApproval && !memberRequestedWorkoutNeedsCreation && (
                          <button
                            type="button"
                            onClick={() => handleEdit(plan)}
                            aria-label={`Edit ${plan.plan_name}`}
                            className="rounded-lg p-2 text-orange-500 transition hover:bg-orange-500/10 hover:text-orange-600"
                            title={rejectedPlan ? "Revise rejected plan and submit it for approval" : "Edit workout plan"}
                          >
                            <Pencil size={16} />
                          </button>
                        )}
                        {planLocked && !canEditPlan && (
                          <span
                            className="inline-flex items-center gap-1 px-2 text-xs text-slate-500"
                            title={pastWorkoutDate
                              ? "Editing is locked because the workout date has passed."
                              : "This workout has started or finished and is locked."}
                            aria-label="Workout plan is locked"
                          >
                            <LockKeyhole size={15} /> Locked
                          </span>
                        )}
                        {pastWorkoutDate && plan.deletion_request_status !== "Pending" && (
                          <button
                            type="button"
                            onClick={() => handleDelete(plan)}
                            aria-label={`Delete ${plan.plan_name}`}
                            title="Delete past workout plan"
                            className="rounded-lg p-2 text-red-400 transition hover:bg-red-500/10 hover:text-red-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
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
