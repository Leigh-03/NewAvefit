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

const EXERCISE_LIMITS_BY_EXPERIENCE = {
  beginner: { label: "Beginner", max: 6 },
  intermediate: { label: "Intermediate", max: 8 },
  moderate: { label: "Intermediate", max: 8 },
  advanced: { label: "Advanced", max: 10 },
};

const getExerciseLimitForExperience = (experienceLevel) => (
  EXERCISE_LIMITS_BY_EXPERIENCE[String(experienceLevel || "").trim().toLowerCase()]
    || EXERCISE_LIMITS_BY_EXPERIENCE.beginner
);

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
  elbow: ["bicep", "tricep", "arm"],
  neck: ["back", "shoulder"],
};

const searchableMuscles = (exercise) => (
  `${exercise.category_name || ""} ${exercise.muscle_group || ""}`.toLowerCase()
);

const toList = (value) => {
  if (Array.isArray(value)) return value.filter((item) => item != null && String(item).trim() !== "");
  if (value == null) return [];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("[")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return toList(parsed);
      } catch {
        // Fall back to the delimited database representation below.
      }
    }
    return value
      .split(/[;,]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [value].filter((item) => item != null && String(item).trim() !== "");
};

const normalizeHealthValue = (value) => String(value || "")
  .trim()
  .replace(/^[\s"'[\]{}]+|[\s"'[\]{}]+$/g, "")
  .trim()
  .replace(/[.,;:]+$/g, "")
  .trim()
  .toLowerCase();

const noReportedHealthValues = new Set([
  "none",
  "none reported",
  "none selected",
  "no",
  "no injury",
  "no injuries",
  "no injury reported",
  "no injuries reported",
  "no injury or pain",
  "no condition",
  "no conditions",
  "no health condition",
  "no health conditions",
  "no condition reported",
  "no conditions reported",
  "no injuries or conditions",
  "no injury or condition",
  "no injury or health condition",
  "no injuries or health conditions",
  "not reported",
  "not specified",
  "not selected",
  "n/a",
  "not applicable",
]);

const hasReportedInjuries = (injuries = []) => (
  toList(injuries).some((injury) => {
    const value = normalizeHealthValue(injury);
    return value && !noReportedHealthValues.has(value);
  })
);

const hasHealthConditions = hasReportedInjuries;

const requiresConservativeWorkout = (exercise, injuries = [], healthConditions = []) => (
  hasHealthConditions(healthConditions) || isExerciseAffectedByInjury(exercise, injuries)
);

const exerciseMatchesProgram = (exercise, program) => {
  const category = String(exercise?.category_name || "").trim().toLowerCase();
  const muscleGroup = String(exercise?.muscle_group || "").trim().toLowerCase();
  if (category === "cardio" || muscleGroup === "cardio") return true;
  const muscles = searchableMuscles(exercise);
  return (PROGRAM_MUSCLES[program] || []).some((muscle) => muscles.includes(muscle));
};

const isCardioExercise = (exercise) => (
  String(exercise?.category_name || "").trim().toLowerCase() === "cardio"
  || String(exercise?.muscle_group || "").trim().toLowerCase() === "cardio"
);

const getHighestInjuryPainLevel = (painLevels = {}) => {
  if (!painLevels || typeof painLevels !== "object") return 0;
  return Object.values(painLevels).reduce((highest, value) => {
    const level = Number(value);
    return Number.isFinite(level) ? Math.max(highest, Math.min(Math.max(level, 0), 10)) : highest;
  }, 0);
};

const getCardioDurationRecommendation = ({
  experienceLevel,
  fitnessGoal,
  painLevel = 0,
  hasHealthCondition = false,
} = {}) => {
  const level = String(experienceLevel || "").trim().toLowerCase();
  const goal = String(fitnessGoal || "").trim().toLowerCase();

  let standard;
  if (level === "advanced") {
    standard = goal.includes("lose") || goal.includes("loss")
      ? [30, 45]
      : goal.includes("maintain")
        ? [20, 30]
        : goal.includes("muscle") || goal.includes("gain")
          ? [10, 20]
          : [20, 30];
  } else if (level === "intermediate" || level === "moderate") {
    standard = goal.includes("lose") || goal.includes("loss")
      ? [20, 30]
      : goal.includes("maintain")
        ? [15, 20]
        : goal.includes("muscle") || goal.includes("gain")
          ? [10, 15]
          : [15, 20];
  } else {
    standard = goal.includes("lose") || goal.includes("loss")
      ? [15, 20]
      : goal.includes("maintain")
        ? [10, 15]
        : goal.includes("muscle") || goal.includes("gain")
          ? [5, 10]
          : [10, 15];
  }

  const pain = Math.max(0, Math.min(10, Number(painLevel) || 0));
  if (pain >= 7) {
    return { status: "stop", min: 0, max: 0, recommended: 0, note: "Stop cardio exercise and seek prompt medical assessment." };
  }
  if (pain >= 5) {
    return { status: "blocked", min: 0, max: 0, recommended: 0, note: "Avoid affected movements and assess with a healthcare professional before exercise." };
  }

  const scale = pain >= 3 || hasHealthCondition ? 0.75 : 1;
  const min = Math.ceil(standard[0] * scale);
  const max = Math.max(min, Math.floor(standard[1] * scale));
  const recommended = Math.max(min, Math.min(max, Math.ceil((min + max) / 2)));
  return {
    status: pain >= 3 || hasHealthCondition ? "modified" : "standard",
    min,
    max,
    recommended,
    note: pain >= 3
      ? "Use a shorter, comfortable duration and stop if pain increases."
      : hasHealthCondition
        ? "Use a conservative duration and stop if symptoms or discomfort appear."
        : "Standard cardio duration for this experience level and fitness goal.",
  };
};

const isExerciseAllowedForExperience = (exercise, experienceLevel) => {
  const difficultyRank = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "beginner") return 1;
    if (normalized === "intermediate" || normalized === "moderate") return 2;
    if (normalized === "advanced") return 3;
    return 0;
  };
  const experienceRank = difficultyRank(experienceLevel);
  const exerciseRank = difficultyRank(exercise?.difficulty);
  return experienceRank > 0 && exerciseRank > 0 && exerciseRank <= experienceRank;
};

const isExerciseAffectedByInjury = (exercise, injuries = []) => {
  const muscles = searchableMuscles(exercise);
  return toList(injuries).some((injury) => {
    const injuryName = normalizeHealthValue(injury);
    if (!injuryName || noReportedHealthValues.has(injuryName)) return false;
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
  getExerciseLimitForExperience,
  exerciseMatchesProgram,
  isCardioExercise,
  getHighestInjuryPainLevel,
  getCardioDurationRecommendation,
  isExerciseAllowedForExperience,
  getProgramForDate,
  getScheduledPrograms,
  hasReportedInjuries,
  hasHealthConditions,
  isExerciseAffectedByInjury,
  requiresConservativeWorkout,
};
