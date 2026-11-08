/**
 * Workout status values shared by the member dashboard and the trainer
 * workout plan list. The backend decides the status; these helpers only give
 * it a label and a colour so the same status always looks the same.
 */
export const WORKOUT_STATUS = Object.freeze({
  SCHEDULED: "Scheduled",
  ACTIVE: "Active",
  COMPLETE: "Complete",
  INCOMPLETE: "Incomplete",
  ABSENT: "Absent",
});

export const WORKOUT_STATUS_STYLES = Object.freeze({
  [WORKOUT_STATUS.SCHEDULED]: "border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
  [WORKOUT_STATUS.ACTIVE]: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300",
  [WORKOUT_STATUS.COMPLETE]: "border-green-200 bg-green-50 text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300",
  [WORKOUT_STATUS.INCOMPLETE]: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  [WORKOUT_STATUS.ABSENT]: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
});

export const WORKOUT_STATUS_DESCRIPTIONS = Object.freeze({
  [WORKOUT_STATUS.SCHEDULED]: "Booked for a future day.",
  [WORKOUT_STATUS.ACTIVE]: "Scheduled day is still ongoing and this workout is not finished yet.",
  [WORKOUT_STATUS.COMPLETE]: "The member finished this workout.",
  [WORKOUT_STATUS.INCOMPLETE]: "The member started this workout but did not finish it before the day ended.",
  [WORKOUT_STATUS.ABSENT]: "No workout was logged for this scheduled day.",
});

export const workoutStatusLabel = (status) => status || WORKOUT_STATUS.SCHEDULED;

export const workoutStatusStyle = (status) =>
  WORKOUT_STATUS_STYLES[status] || WORKOUT_STATUS_STYLES[WORKOUT_STATUS.SCHEDULED];

export const workoutStatusDescription = (status) =>
  WORKOUT_STATUS_DESCRIPTIONS[status] || WORKOUT_STATUS_DESCRIPTIONS[WORKOUT_STATUS.SCHEDULED];

// The statuses a member can be filtered by. "Scheduled" is not offered: it
// only marks a workout that has not started yet, so it is not something a
// member or a coach filters a plan list by.
export const WORKOUT_STATUS_FILTERS = [
  WORKOUT_STATUS.ACTIVE,
  WORKOUT_STATUS.COMPLETE,
  WORKOUT_STATUS.INCOMPLETE,
  WORKOUT_STATUS.ABSENT,
];
