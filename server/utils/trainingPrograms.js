const PROGRAM_SCHEDULES = {
  2: ["Upper", "Lower"],
  3: ["Push", "Pull", "Legs"],
  4: ["Upper", "Lower", "Upper", "Lower"],
  5: ["Push", "Pull", "Legs", "Upper", "Lower"],
  6: ["Push", "Pull", "Legs", "Chest & Back", "Shoulders & Arms", "Legs"],
};

const TRAINING_PROGRAMS = [
  "Upper",
  "Lower",
  "Push",
  "Pull",
  "Legs",
  "Chest & Back",
  "Shoulders & Arms",
  "Full Body",
];

const PROGRAM_MUSCLES = {
  Upper: ["chest", "back", "shoulder", "bicep", "tricep"],
  Lower: ["leg", "glute", "quad", "hamstring", "calf"],
  Push: ["chest", "shoulder", "tricep"],
  Pull: ["back", "bicep"],
  Legs: ["leg", "glute", "quad", "hamstring", "calf"],
  "Chest & Back": ["chest", "back"],
  "Shoulders & Arms": ["shoulder", "bicep", "tricep", "arm"],
  "Full Body": ["chest", "back", "shoulder", "bicep", "tricep", "leg", "glute", "quad", "hamstring", "calf"],
};

const INJURY_MUSCLES = {
  leg: ["leg", "glute", "quad", "hamstring", "calf"],
  "lower body": ["leg", "glute", "quad", "hamstring", "calf"],
  knee: ["leg", "glute", "quad", "hamstring", "calf"],
  ankle: ["leg", "glute", "quad", "hamstring", "calf"],
  foot: ["leg", "glute", "quad", "hamstring", "calf"],
  feet: ["leg", "glute", "quad", "hamstring", "calf"],
  thigh: ["leg", "glute", "quad", "hamstring", "calf"],
  calf: ["leg", "glute", "quad", "hamstring", "calf"],
  hip: ["leg", "glute", "quad", "hamstring", "calf"],
  back: ["back"],
  shoulder: ["shoulder"],
  wrist: ["chest", "back", "shoulder", "bicep", "tricep", "arm"],
  neck: ["back", "shoulder"],
};

const searchableMuscles = (exercise) => (
  `${exercise.category_name || ""} ${exercise.muscle_group || ""}`.toLowerCase()
);

const toList = (value) => {
  if (Array.isArray(value)) return value.filter((item) => item != null && String(item).trim() !== "");
  if (value == null) return [];
  if (typeof value === "string") {
    return value
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [value].filter((item) => item != null && String(item).trim() !== "");
};

const hasHealthConditions = (conditions = []) => (
  toList(conditions).some((condition) => {
    const value = String(condition || "").trim().toLowerCase();
    return value && !["none", "no condition", "no conditions", "n/a"].includes(value);
  })
);

const requiresConservativeWorkout = (exercise, injuries = [], healthConditions = []) => (
  hasHealthConditions(healthConditions) || isExerciseAffectedByInjury(exercise, injuries)
);

const exerciseMatchesProgram = (exercise, program) => {
  const muscles = searchableMuscles(exercise);
  return (PROGRAM_MUSCLES[program] || []).some((muscle) => muscles.includes(muscle));
};

const isExerciseAffectedByInjury = (exercise, injuries = []) => {
  const muscles = searchableMuscles(exercise);
  return toList(injuries).some((injury) => {
    const injuryName = String(injury || "").toLowerCase().trim();
    if (!injuryName || ["none", "no injury", "no injuries", "n/a"].includes(injuryName)) return false;
    const mappedRegions = Object.entries(INJURY_MUSCLES)
      .filter(([region]) => injuryName.includes(region))
      .flatMap(([, groups]) => groups);
    const affectedMuscles = mappedRegions.length ? mappedRegions : PROGRAM_MUSCLES["Full Body"];
    return affectedMuscles.some((muscle) => muscles.includes(muscle));
  });
};

const getProgramForDate = (date, preferredDays = []) => {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00.000Z`));
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const days = weekdays.filter((day) => toList(preferredDays).some(
    (preferredDay) => String(preferredDay).toLowerCase() === day.toLowerCase()
  ));
  const dayIndex = days.findIndex((day) => day.toLowerCase() === weekday.toLowerCase());
  if (dayIndex < 0) return "";
  const schedule = PROGRAM_SCHEDULES[days.length] || ["Full Body"];
  return schedule[dayIndex % schedule.length];
};

const getScheduledPrograms = (preferredDays = []) => {
  const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const days = weekdays.filter((day) => toList(preferredDays).some(
    (preferredDay) => String(preferredDay).toLowerCase() === day.toLowerCase()
  ));
  return new Set(PROGRAM_SCHEDULES[days.length] || ["Full Body"]);
};

module.exports = {
  TRAINING_PROGRAMS,
  exerciseMatchesProgram,
  getProgramForDate,
  getScheduledPrograms,
  hasHealthConditions,
  isExerciseAffectedByInjury,
  requiresConservativeWorkout,
};
