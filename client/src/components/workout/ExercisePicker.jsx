import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Dumbbell, Search } from "lucide-react";

export default function ExercisePicker({
  id,
  options,
  value,
  onChange,
  disabled = false,
  placeholder = "Choose an exercise",
  getBadges,
  ariaInvalid,
  ariaDescribedby,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const optionRefs = useRef([]);

  const selectedExercise = options.find((exercise) => String(exercise.exercise_id) === String(value));
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter((exercise) => (
      [exercise.exercise_name, exercise.muscle_group, exercise.difficulty]
        .some((field) => String(field || "").toLowerCase().includes(normalizedQuery))
    ));
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    searchRef.current?.focus();
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  const selectExercise = (exercise) => {
    if (!exercise.disabled) {
      onChange(String(exercise.exercise_id));
      setOpen(false);
      setQuery("");
    }
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = filteredOptions.length
        ? (activeIndex + direction + filteredOptions.length) % filteredOptions.length
        : 0;
      setActiveIndex(nextIndex);
      optionRefs.current[nextIndex]?.focus();
    }
    if (event.key === "Enter" && filteredOptions[activeIndex]) {
      event.preventDefault();
      selectExercise(filteredOptions[activeIndex]);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={() => {
          setOpen((current) => !current);
          setQuery("");
          setActiveIndex(Math.max(0, options.findIndex((exercise) => String(exercise.exercise_id) === String(value))));
        }}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-left shadow-sm transition hover:border-orange-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-[#171717] dark:hover:border-orange-500/60 ${className}`}
      >
        {selectedExercise ? (
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{selectedExercise.exercise_name}</span>
            <span className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">{selectedExercise.muscle_group || "Muscle group not set"}</span>
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-800 dark:bg-orange-500/15 dark:text-orange-300">{selectedExercise.difficulty || "Difficulty not set"}</span>
            </span>
          </span>
        ) : (
          <span className="flex min-w-0 items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Dumbbell size={16} className="shrink-0 text-orange-500" />
            <span className="truncate">{placeholder}</span>
          </span>
        )}
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[95] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-[#141414] dark:ring-white/10">
          <div className="border-b border-slate-100 p-3 dark:border-slate-800">
            <label htmlFor={`${id}-search`} className="sr-only">Search exercises</label>
            <div className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-500/20 dark:border-slate-700 dark:bg-black/20">
              <Search size={16} aria-hidden="true" className="shrink-0 text-slate-400" />
              <input
                ref={searchRef}
                id={`${id}-search`}
                type="search"
                role="combobox"
                aria-expanded="true"
                aria-controls={`${id}-options`}
                aria-activedescendant={filteredOptions[activeIndex] ? `${id}-option-${filteredOptions[activeIndex].exercise_id}` : undefined}
                placeholder="Search name, muscle, or difficulty..."
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                className="min-w-0 flex-1 bg-transparent py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
              />
            </div>
            <p className="mt-2 px-1 text-[11px] font-medium text-slate-400">{filteredOptions.length} exercise{filteredOptions.length === 1 ? "" : "s"} available</p>
          </div>
          <ul id={`${id}-options`} role="listbox" aria-label="Available exercises" className="max-h-64 space-y-1 overflow-y-auto p-2">
            {filteredOptions.length ? filteredOptions.map((exercise, index) => {
              const isSelected = String(exercise.exercise_id) === String(value);
              const badges = getBadges?.(exercise) || [];
              return (
                <li key={exercise.exercise_id} role="presentation">
                  <button
                    ref={(element) => { optionRefs.current[index] = element; }}
                    id={`${id}-option-${exercise.exercise_id}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={exercise.disabled}
                    onClick={() => selectExercise(exercise)}
                    onMouseEnter={() => setActiveIndex(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setOpen(false);
                        return;
                      }
                      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        const direction = event.key === "ArrowDown" ? 1 : -1;
                        const nextIndex = (index + direction + filteredOptions.length) % filteredOptions.length;
                        setActiveIndex(nextIndex);
                        optionRefs.current[nextIndex]?.focus();
                      }
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectExercise(exercise);
                      }
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                      exercise.disabled
                        ? "cursor-not-allowed opacity-40"
                        : isSelected
                          ? "bg-orange-50 ring-1 ring-inset ring-orange-200 dark:bg-orange-500/10 dark:ring-orange-500/25"
                          : "hover:bg-slate-50 focus-visible:bg-slate-50 dark:hover:bg-white/[0.06] dark:focus-visible:bg-white/[0.06]"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{exercise.exercise_name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">{exercise.muscle_group || "Muscle group not set"}</span>
                        <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800 dark:bg-orange-500/15 dark:text-orange-300">{exercise.difficulty || "Difficulty not set"}</span>
                        {badges.map((badge) => (
                          <span key={badge.label} className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                            {badge.label}
                          </span>
                        ))}
                      </span>
                    </span>
                    {isSelected && <Check size={16} aria-hidden="true" className="shrink-0 text-orange-600 dark:text-orange-400" />}
                  </button>
                </li>
              );
            }) : (
              <li className="px-4 py-8 text-center">
                <Dumbbell size={22} aria-hidden="true" className="mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No exercises found</p>
                <p className="mt-1 text-xs text-slate-500">Try another name, muscle group, or difficulty.</p>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
