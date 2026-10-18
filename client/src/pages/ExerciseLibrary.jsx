import { useEffect, useState } from "react";
import { Search, X, ChevronDown, ListOrdered, Dumbbell, ArrowLeft, SlidersHorizontal, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import userApi from "../userApi";
import WorkoutGuide from "../components/WorkoutGuide";
import { getWorkoutGuideExercise } from "../utils/workoutGuide";

export function ExerciseDetail({ exercise, onClose }) {
  const steps = Array.isArray(exercise.movement_steps) ? exercise.movement_steps : null;
  const guide = getWorkoutGuideExercise(exercise.exercise_name);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exercise-detail-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-orange-500/20 bg-[#111] p-5 text-white shadow-2xl sm:p-7"
      >
        <button
          type="button"
          onClick={onClose}
          className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#383838] bg-[#1c1c1c] px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-orange-500/60 hover:bg-[#252525] hover:text-white"
        >
          <ArrowLeft size={16} /> Back to exercises
        </button>
        <div className="mb-4">
          <div>
            <h2 id="exercise-detail-title" className="text-xl font-bold text-white">{exercise.exercise_name}</h2>
            <p className="text-slate-300 text-sm">{exercise.muscle_group}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          {[
            { label: "Difficulty", value: exercise.difficulty || "N/A" },
            { label: "Equipment", value: exercise.equipment || "None" },
          ].map((item) => (
            <div key={item.label} className="bg-[#1c1c1c] border border-[#303030] rounded-xl p-3 text-center">
              <p className="text-white font-semibold text-sm">{item.value}</p>
              <p className="text-slate-300 text-xs mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>

        {exercise.description && (
          <div className="mb-5">
            <h4 className="text-sm font-semibold text-slate-200 mb-2">Description</h4>
            <p className="text-slate-300 text-sm leading-relaxed">{exercise.description}</p>
          </div>
        )}

        <div className="mb-5 border-t border-[#303030] pt-5">
          {guide ? (
            <WorkoutGuide exerciseName={guide} />
          ) : (
            <div className="bg-[#1c1c1c] border border-[#303030] rounded-2xl p-4">
              <h4 className="font-semibold text-white flex items-center gap-2">
                <Dumbbell size={16} className="text-orange-500" /> Workout Guide
              </h4>
              <p className="text-sm text-slate-300 mt-1">
                A matching illustrated guide is not available for this exercise yet.
              </p>
            </div>
          )}
        </div>

        {steps && (
          <div className="border-t border-[#303030] pt-5">
            <h4 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
              <ListOrdered size={15} className="text-orange-500" /> Coaching Notes
            </h4>
            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <span className="w-7 h-7 rounded-full bg-orange-500 text-white text-sm font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    {i < steps.length - 1 && <div className="w-0.5 flex-1 bg-orange-200 mt-1" />}
                  </div>
                  <div className="pb-3">
                    <p className="font-semibold text-white text-sm">{step.title}</p>
                    <p className="text-slate-300 text-sm mt-0.5 leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const difficultyColors = {
  Beginner: "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300",
  Intermediate: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  Advanced: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300",
};

export default function ExerciseLibrary() {
  const navigate = useNavigate();
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("All");
  const [selected, setSelected] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    userApi.get("/exercises")
      .then((exRes) => {
        setExercises(exRes.data.data || []);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(err.response?.data?.message || "Unable to load exercises. Please try again.");
      })
      .finally(() => setLoading(false));
  }, []);

  const activeFilterCount = Number(filterDifficulty !== "All");
  const filtered = exercises.filter((e) => {
    const query = search.trim().toLowerCase();
    const matchSearch = !query ||
      e.exercise_name?.toLowerCase().includes(query) ||
      e.muscle_group?.toLowerCase().includes(query) ||
      e.equipment?.toLowerCase().includes(query);
    const matchDiff = filterDifficulty === "All" || e.difficulty === filterDifficulty;
    return matchSearch && matchDiff;
  });

  return (
    <div className="min-h-screen bg-[#fffaf5] dark:bg-[#080808] text-slate-900 dark:text-white">
      {selected && <ExerciseDetail exercise={selected} onClose={() => setSelected(null)} />}

      <header className="ave-page-hero border-b border-orange-100 px-5 pb-7 pt-8 dark:border-white/5 sm:px-8">
        <button
          type="button"
          onClick={() => navigate("/user/workout")}
          className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-500 hover:text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-slate-700 dark:bg-[#151515] dark:text-slate-200 dark:hover:bg-[#202020] dark:hover:text-white"
        >
          <ArrowLeft size={16} /> Back to workouts
        </button>
        <div className="mx-auto max-w-5xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">
            <Sparkles size={14} /> Move with confidence
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">Exercise library</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Explore exercises, learn the equipment and difficulty, and open illustrated guides.
          </p>
          {!loading && <p className="mt-3 text-xs font-medium text-slate-500">{exercises.length} exercises available</p>}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-5 py-6 sm:px-8">
        {loadError && (
          <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {loadError}
          </div>
        )}

        <div className="flex items-center gap-3 rounded-xl border border-orange-100 bg-white px-4 py-3 shadow-sm focus-within:border-orange-400 dark:border-white/10 dark:bg-[#111]">
          <Search size={18} aria-hidden="true" className="shrink-0 text-slate-500" />
          <input
            type="search"
            aria-label="Search exercises"
            placeholder="Search by exercise, muscle, or equipment..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
          />
          {search && (
            <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 transition hover:border-orange-300 dark:border-white/10 dark:bg-[#111] dark:text-slate-200"
          >
            <SlidersHorizontal size={16} className="text-orange-500" />
            Filters
            {activeFilterCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>
            )}
            <ChevronDown size={15} className={`transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </button>
          <p aria-live="polite" className="text-xs font-medium text-slate-500">
            {loading ? "Loading exercises…" : `${filtered.length} ${filtered.length === 1 ? "exercise" : "exercises"} found`}
          </p>
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
                    aria-pressed={filterDifficulty === difficulty}
                    onClick={() => setFilterDifficulty(difficulty)}
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
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFilterDifficulty("All");
                }}
                className="text-xs font-semibold text-orange-700 hover:text-orange-800 dark:text-orange-300"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[...Array(6)].map((_, i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-white dark:bg-[#111]" />)}
          </div>
        ) : loadError ? null : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-orange-200 bg-white px-5 py-14 text-center dark:border-white/10 dark:bg-[#111]">
            <Search size={28} className="mx-auto mb-3 text-orange-500" />
            <p className="font-semibold text-slate-900 dark:text-white">No exercises match your search</p>
            <p className="mt-1 text-sm text-slate-500">Try another search or clear your filters.</p>
            {(search || activeFilterCount > 0) && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setFilterDifficulty("All");
                }}
                className="mt-4 rounded-lg px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-500/10"
              >
                Reset search and filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((exercise) => {
              const guide = getWorkoutGuideExercise(exercise.exercise_name);
              return (
                <button
                  key={exercise.exercise_id}
                  type="button"
                  onClick={() => setSelected(exercise)}
                  className="group w-full rounded-2xl border border-orange-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-white/5 dark:bg-[#111] dark:hover:border-orange-500/40"
                >
                  <div className="flex items-start gap-3">
                    {guide ? (
                      <img
                        src={`/workout-guide/${guide.frames[1].path}`}
                        alt=""
                        aria-hidden="true"
                        className="h-16 w-16 shrink-0 rounded-xl border border-slate-100 bg-slate-50 object-contain dark:border-white/5 dark:bg-white/[0.03]"
                      />
                    ) : (
                      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                        <Dumbbell size={23} aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="font-bold text-slate-900 group-hover:text-orange-700 dark:text-white dark:group-hover:text-orange-300">{exercise.exercise_name}</h2>
                        <span className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold ${difficultyColors[exercise.difficulty] || "border-slate-200 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"}`}>
                          {exercise.difficulty || "Not specified"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{exercise.muscle_group || "Muscle group not specified"}</p>
                      {exercise.equipment && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Equipment: {exercise.equipment}</p>}
                      <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${guide ? "text-orange-600 dark:text-orange-400" : "text-slate-400"}`}>
                        <Dumbbell size={12} /> {guide ? "Illustrated guide available" : "Guide unavailable"}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
