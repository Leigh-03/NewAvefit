import { useEffect, useState } from "react";
import { Dumbbell, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import trainerApi from "../trainerApi";
import { ExerciseDetail } from "./ExerciseLibrary";
import { getWorkoutGuideExercise } from "../utils/workoutGuide";

const DIFFICULTIES = ["All", "Beginner", "Intermediate", "Advanced"];

export default function TrainerExercises() {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("All");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let active = true;
    trainerApi.get("/me/exercises")
      .then((response) => {
        if (active) setExercises(response.data.data || []);
      })
      .catch((error) => {
        console.error("Failed to load trainer exercise catalog:", error);
        if (active) setLoadError(error.response?.data?.message || "Unable to load exercises. Please try again.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filtered = exercises.filter((exercise) => {
    const query = search.trim().toLowerCase();
    const matchesQuery = !query || [
      exercise.exercise_name,
      exercise.muscle_group,
      exercise.equipment,
    ].some((value) => value?.toLowerCase().includes(query));
    return matchesQuery &&
      (difficulty === "All" || exercise.difficulty === difficulty);
  });

  return (
    <div className="min-h-full bg-[#fffaf5] text-slate-900 dark:bg-[#080808] dark:text-white">
      {selected && <ExerciseDetail exercise={selected} onClose={() => setSelected(null)} />}
      <header className="ave-page-hero border-b border-orange-100 px-5 py-8 dark:border-white/5 sm:px-8">
        <div className="mx-auto max-w-5xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">
            <Sparkles size={14} /> Coach resource library
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">Exercise library</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
            Browse the same exercise guides members use, with details ready to support your coaching and workout plans.
          </p>
          {!loading && <p className="mt-3 text-xs font-medium text-slate-500">{exercises.length} exercises available</p>}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-5 py-6 sm:px-8">
        {loadError && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{loadError}</div>}

        <label className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm focus-within:ring-2 focus-within:ring-orange-500 dark:border-white/10 dark:bg-[#111]">
          <Search size={18} className="shrink-0 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search exercises, muscles, or equipment..."
            aria-label="Search exercises"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500 dark:text-white"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2" aria-label="Exercise filters">
          <SlidersHorizontal size={16} className="mr-1 text-orange-500" aria-hidden="true" />
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by difficulty">
            {DIFFICULTIES.map((item) => (
              <button key={item} type="button" aria-pressed={difficulty === item} onClick={() => setDifficulty(item)}
                className={`min-h-10 rounded-lg border px-3 text-xs font-semibold transition ${difficulty === item ? "border-orange-500 bg-orange-500 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-orange-300 dark:border-white/10 dark:bg-[#111] dark:text-slate-300"}`}>
                {item}
              </button>
            ))}
          </div>
          <p aria-live="polite" className="ml-auto text-xs font-medium text-slate-500">
            {loading ? "Loading exercises..." : `${filtered.length} ${filtered.length === 1 ? "exercise" : "exercises"} found`}
          </p>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-2xl bg-white dark:bg-[#111]" />)}</div>
        ) : loadError ? null : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-orange-200 bg-white px-5 py-14 text-center dark:border-white/10 dark:bg-[#111]">
            <Search size={28} className="mx-auto mb-3 text-orange-500" />
            <p className="font-semibold text-slate-900 dark:text-white">No exercises match these filters</p>
            <p className="mt-1 text-sm text-slate-500">Try a different search or reset the filters.</p>
            <button type="button" onClick={() => { setSearch(""); setDifficulty("All"); }} className="mt-4 rounded-lg px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50 dark:text-orange-300 dark:hover:bg-orange-500/10">Reset filters</button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((exercise) => {
              const guide = getWorkoutGuideExercise(exercise.exercise_name);
              return (
                <button key={exercise.exercise_id} type="button" onClick={() => setSelected(exercise)}
                  className="group w-full rounded-2xl border border-orange-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-white/5 dark:bg-[#111] dark:hover:border-orange-500/40">
                  <div className="flex items-start gap-3">
                    {guide ? (
                      <img src={`/workout-guide/${guide.frames[1].path}`} alt="" aria-hidden="true" className="h-16 w-16 shrink-0 rounded-xl border border-slate-100 bg-slate-50 object-contain dark:border-white/5 dark:bg-white/[0.03]" />
                    ) : (
                      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400"><Dumbbell size={23} aria-hidden="true" /></span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h2 className="font-bold text-slate-900 group-hover:text-orange-700 dark:text-white dark:group-hover:text-orange-300">{exercise.exercise_name}</h2>
                        <span className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">{exercise.difficulty || "Not specified"}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{exercise.muscle_group || "Muscle group not specified"}</p>
                      {exercise.equipment && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">Equipment: {exercise.equipment}</p>}
                      <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${guide ? "text-orange-600 dark:text-orange-400" : "text-slate-400"}`}><Dumbbell size={12} />{guide ? "Illustrated guide available" : "Guide unavailable"}</p>
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
