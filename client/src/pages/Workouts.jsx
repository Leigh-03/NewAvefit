import { useEffect, useState } from "react";
import { ChevronDown, Dumbbell, Search, Edit2, X, ListOrdered, SlidersHorizontal } from "lucide-react";
import { getWorkoutGuideExercise } from "../utils/workoutGuide";
import api from "../services/api";
import CustomSelect from "../components/ui/CustomSelect";

const difficultyColors = {
  Beginner: "bg-green-500/20 text-green-400",
  Intermediate: "bg-yellow-500/20 text-yellow-400",
  Advanced: "bg-red-500/20 text-red-400",
};

const MUSCLE_GROUPS = ["Chest", "Back", "Shoulders", "Biceps", "Triceps", "Legs", "Glutes", "Core", "Cardio", "Full Body"];
const EQUIPMENT_OPTIONS = ["Barbell", "Dumbbell", "Cable Machine", "Smith Machine", "Kettlebell", "EZ Bar", "Bodyweight", "Pull-Up Bar", "Dip Station", "Roman Chair", "Landmine Attachment", "T-Bar Row Machine", "Assisted Pull-Up Machine", "Preacher Bench", "Leg Press Machine", "Hack Squat Machine", "Weight Plate", "Decline Bench", "Treadmill", "Stationary Bike", "Rowing Machine", "Stair Climber Machine", "Elliptical Machine", "Assault Bike", "Battle Ropes", "Jump Rope", "Sled", "TRX Suspension Trainer", "Medicine Ball", "Plyo Box", "Gym Mat"];
const STEP_TITLES = ["Starting Position", "Movement", "Finish"];

// Letters + spaces only for the name, plus punctuation real names already use
// (Pull-Up, Farmer's Carry, Weighted Dips (Chest Focus)). Blocks digits.
const NAME_PATTERN = /^[A-Za-z][A-Za-z\s'().,&-]*$/;
// Letters/spaces + normal sentence punctuation. Blocks digits.
const TEXT_PATTERN = /^[A-Za-z][A-Za-z\s.,'’\-()/:;]*$/;

const inputClass = (hasError) =>
  `w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 ${
    hasError ? "border-red-400 focus:ring-red-500" : "border-slate-300 focus:ring-orange-500"
  }`;

const validateName = (value) => {
  const v = String(value || "").trim();
  if (!v) return "Exercise name is required.";
  if (!NAME_PATTERN.test(v)) return "Exercise name may only contain letters, spaces, and simple punctuation (no numbers).";
  return "";
};

const validateText = (value, label) => {
  const v = String(value || "").trim();
  if (!v) return `${label} is required.`;
  if (v.length < 5) return `${label} must be at least 5 letters.`;
  if (v.length > 500) return `${label} must be 500 letters or fewer.`;
  if (!TEXT_PATTERN.test(v)) return `${label} may only contain letters, spaces, and punctuation (no numbers).`;
  return "";
};

const emptySteps = () => [
  { title: "Starting Position", description: "" },
  { title: "Movement", description: "" },
  { title: "Finish", description: "" },
];

function ExerciseModal({ exercise, onClose, onSave }) {
  const [form, setForm] = useState(
    exercise
      ? { ...exercise }
      : { exercise_name: "", muscle_group: "", difficulty: "Beginner", description: "", equipment: "" }
  );
  const [steps, setSteps] = useState(
    exercise?.movement_steps && Array.isArray(exercise.movement_steps) && exercise.movement_steps.length === 3
      ? exercise.movement_steps
      : emptySteps()
  );
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState("");

  // Keep any legacy/custom value selectable when editing an existing exercise.
  const muscleGroupOptions = [...new Set([...(form.muscle_group ? [form.muscle_group] : []), ...MUSCLE_GROUPS])];
  const equipmentOptions = EQUIPMENT_OPTIONS;

  const updateStep = (i, field, value) => {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  };

  const buildErrors = () => {
    const next = {};
    const nameError = validateName(form.exercise_name);
    if (nameError) next.exercise_name = nameError;
    if (!form.muscle_group) next.muscle_group = "Muscle group is required.";
    if (!equipmentOptions.includes(form.equipment)) next.equipment = "Select a valid equipment option.";
    const descriptionError = validateText(form.description, "Description");
    if (descriptionError) next.description = descriptionError;
    steps.forEach((step, i) => {
      const stepError = validateText(step.description, STEP_TITLES[i]);
      if (stepError) next[`step_${i}`] = stepError;
    });
    return next;
  };

  const handleSubmit = async () => {
    const nextErrors = buildErrors();
    setErrors(nextErrors);
    setError("");
    if (Object.keys(nextErrors).length > 0) return;
    setSaving(true);
    try {
      // The exercise visuals now come from the bundled Workout Guide repository.
      // Keep only AveFit's exercise metadata and coaching notes in the database.
      const {
        exercise_name, muscle_group, difficulty, description, equipment
      } = form;
      const payload = {
        exercise_name: exercise_name.trim(),
        muscle_group,
        difficulty,
        description: description.trim(),
        equipment,
        movement_steps: steps.map((step, i) => ({
          title: STEP_TITLES[i],
          description: step.description.trim(),
        })),
      };
      await api.put(`/workouts/${exercise.exercise_id}`, payload);
      onSave();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save exercise.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">
            {exercise ? "Edit Exercise" : "Add New Exercise"}
          </h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Exercise Name *</label>
              <input type="text" value={form.exercise_name}
                onChange={(e) => setForm({ ...form, exercise_name: e.target.value })}
                aria-invalid={Boolean(errors.exercise_name)}
                className={inputClass(errors.exercise_name)} />
              {errors.exercise_name && <p className="mt-1 text-xs text-red-500">{errors.exercise_name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Muscle Group *</label>
              <CustomSelect
                value={form.muscle_group || ""}
                onChange={(muscle_group) => setForm({ ...form, muscle_group })}
                ariaLabel="Muscle group"
                ariaInvalid={Boolean(errors.muscle_group)}
                className={`${inputClass(errors.muscle_group)} dark:bg-[#111]`}
                options={[
                  { value: "", label: "Select muscle group..." },
                  ...muscleGroupOptions.map((muscleGroup) => ({ value: muscleGroup, label: muscleGroup })),
                ]}
              />
              {errors.muscle_group && <p className="mt-1 text-xs text-red-500">{errors.muscle_group}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Equipment *</label>
              <CustomSelect
                value={form.equipment || ""}
                onChange={(equipment) => setForm({ ...form, equipment })}
                ariaLabel="Equipment"
                ariaInvalid={Boolean(errors.equipment)}
                className={`${inputClass(errors.equipment)} dark:bg-[#111]`}
                options={[
                  { value: "", label: "Select equipment..." },
                  ...equipmentOptions.map((equipment) => ({ value: equipment, label: equipment })),
                ]}
              />
              {errors.equipment && <p className="mt-1 text-xs text-red-500">{errors.equipment}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Difficulty</label>
              <CustomSelect
                value={form.difficulty || "Beginner"}
                onChange={(difficulty) => setForm({ ...form, difficulty })}
                ariaLabel="Difficulty"
                className="rounded-lg border-slate-300 px-4 py-2.5 dark:bg-[#111]"
                options={["Beginner", "Intermediate", "Advanced"].map((difficulty) => ({ value: difficulty, label: difficulty }))}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Description *</label>
            <textarea rows={2} value={form.description || ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              aria-invalid={Boolean(errors.description)}
              className={inputClass(errors.description)} />
            {errors.description && <p className="mt-1 text-xs text-red-500">{errors.description}</p>}
          </div>

          {/* Movement Tutorial — 3 steps */}
          <div className="pt-2 border-t">
            <div className="flex items-center gap-2 mb-1">
              <ListOrdered size={16} className="text-orange-600" />
              <label className="text-sm font-semibold text-slate-700">Movement Tutorial (3 steps) *</label>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Shown to members as a step-by-step guide. Each step needs 5–500 letters and no numbers.
            </p>
            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 text-sm font-semibold text-slate-700">{STEP_TITLES[i]}</span>
                  </div>
                  <textarea
                    rows={2}
                    value={step.description}
                    onChange={(e) => updateStep(i, "description", e.target.value)}
                    placeholder="Describe what to do in this phase of the movement..."
                    aria-invalid={Boolean(errors[`step_${i}`])}
                    className={inputClass(errors[`step_${i}`])}
                  />
                  {errors[`step_${i}`] && <p className="mt-1 text-xs text-red-500">{errors[`step_${i}`]}</p>}
                </div>
              ))}
            </div>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>

        <div className="p-6 border-t flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2.5 rounded-xl text-sm font-medium bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white transition">
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Workouts() {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [search, setSearch] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editExercise, setEditExercise] = useState(null);

  const fetchData = () => {
    setLoading(true);
    setFetchError("");
    api.get("/workouts")
      .then((exRes) => {
        setExercises(exRes.data.data);
      })
      .catch((err) => {
        console.error(err);
        setFetchError(err.response?.data?.message || err.message || "Couldn't load exercises.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleEdit = (ex) => { setEditExercise(ex); setShowModal(true); };

  const filtered = exercises.filter((e) => {
    const matchSearch =
      e.exercise_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.muscle_group?.toLowerCase().includes(search.toLowerCase());
    const matchDifficulty = filterDifficulty === "All" || e.difficulty === filterDifficulty;
    return matchSearch && matchDifficulty;
  });

  return (
    <div className="space-y-6">
      {showModal && (
        <ExerciseModal
          exercise={editExercise}
          onClose={() => setShowModal(false)}
          onSave={fetchData}
        />
      )}

      <header className="ave-page-hero flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Training resources</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Exercise Library</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Maintain exercises, member-facing instructions, and coaching notes.</p>
        </div>
      </header>

      {fetchError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          ⚠️ {fetchError}
        </div>
      )}

      <label className="ave-search flex min-h-12 w-full items-center gap-3 rounded-xl border px-4">
          <Search size={18} className="shrink-0 text-slate-500" aria-hidden="true" />
          <input
            type="search"
            placeholder="Search exercises, muscles, equipment..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search exercises"
            className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-sm outline-none shadow-none placeholder:text-slate-500 focus:border-0 focus:ring-0 focus-visible:outline-none dark:placeholder:text-slate-400"
          />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          aria-expanded={showFilters}
          onClick={() => setShowFilters(!showFilters)}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:border-orange-300 dark:border-white/10 dark:bg-[#111] dark:text-slate-200"
        >
          <SlidersHorizontal size={16} className="text-orange-500" />
          Filters
          {filterDifficulty !== "All" && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[11px] font-bold text-white">1</span>
          )}
          <ChevronDown size={15} className={`transition-transform ${showFilters ? "rotate-180" : ""}`} />
        </button>
        <p aria-live="polite" className="text-xs font-medium text-slate-500">{loading ? "Loading exercises..." : `${filtered.length} ${filtered.length === 1 ? "exercise" : "exercises"} found`}</p>
      </div>

      {showFilters && (
        <div className="space-y-4 rounded-2xl border border-orange-100 bg-white p-4 dark:border-white/10 dark:bg-[#111]">
          <div>
            <p className="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Difficulty</p>
            <div className="flex flex-wrap gap-2">
              {["All", "Beginner", "Intermediate", "Advanced"].map((difficulty) => (
                <button
                  key={difficulty}
                  type="button"
                  onClick={() => setFilterDifficulty(difficulty)}
                  aria-pressed={filterDifficulty === difficulty}
                  className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    filterDifficulty === difficulty
                      ? "border-orange-500 bg-orange-500 text-white"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-orange-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300"
                  }`}
                >
                  {difficulty}
                </button>
              ))}
            </div>
          </div>
          {filterDifficulty !== "All" && (
            <button
              type="button"
              onClick={() => setFilterDifficulty("All")}
              className="text-xs font-semibold text-orange-700 hover:text-orange-800 dark:text-orange-300"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {(search || filterDifficulty !== "All") && (
        <div className="flex justify-end">
          <button type="button" onClick={() => { setSearch(""); setFilterDifficulty("All"); }} className="text-xs font-semibold text-orange-700 hover:underline dark:text-orange-300">Clear filters</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-white animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 bg-white py-16 text-center text-slate-600 dark:border-white/10 dark:bg-[#111] dark:text-slate-300"><Dumbbell size={30} className="mx-auto mb-3 text-orange-500"/><p className="font-semibold">No exercises match your filters</p><p className="mt-1 text-sm text-slate-500">Try another search or clear the filters.</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((exercise) => {
            const guide = getWorkoutGuideExercise(exercise.exercise_name);
            return (
            <div
              key={exercise.exercise_id}
              className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-orange-500/50 hover:bg-slate-100"
            >
              {guide ? (
                <img
                  src={`/workout-guide/${guide.frames[1].path}`}
                  alt=""
                  aria-hidden="true"
                  className="h-16 w-16 shrink-0 rounded-xl bg-slate-50 object-contain"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-slate-50">
                  <Dumbbell size={22} className="text-slate-300" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{exercise.exercise_name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {exercise.muscle_group}
                </p>
                {exercise.equipment && (
                  <p className="mt-1 text-xs text-slate-500">🏋️ {exercise.equipment}</p>
                )}
                {(() => {
                  return guide ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-orange-500">
                      <Dumbbell size={11} /> Illustrated guide available
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Guide unavailable</p>
                  );
                })()}
              </div>
              <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-medium ${
                difficultyColors[exercise.difficulty] || "bg-slate-100 text-slate-500"
              }`}>
                {exercise.difficulty || "N/A"}
              </span>
              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <button
                  onClick={() => handleEdit(exercise)}
                  className="flex items-center justify-center gap-1 rounded-lg bg-[#c2410c] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#9a3412]"
                >
                  <Edit2 size={13} /> Edit
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
