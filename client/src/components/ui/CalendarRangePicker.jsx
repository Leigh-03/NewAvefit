import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addPhilippinesDays,
  describeDateRange,
  formatPhilippinesDate,
  philippinesDateString,
  philippinesWeekStart,
} from "../../utils/philippinesDate";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const monthTitle = (year, month) =>
  new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "long",
    year: "numeric",
  }).format(new Date(`${year}-${String(month).padStart(2, "0")}-01T12:00:00+08:00`));

const buildMonthGrid = (year, month) => {
  const gridStart = philippinesWeekStart(`${year}-${String(month).padStart(2, "0")}-01`);
  return Array.from({ length: 42 }, (_, index) => {
    const dateKey = addPhilippinesDays(gridStart, index);
    return { dateKey, inMonth: Number(dateKey.slice(5, 7)) === month };
  });
};

/**
 * Calendar style period picker for the member's progress.
 *
 * The member picks the day the period starts from and the day it ends on. The
 * period always ends on or before the current day, the end day can never be
 * the same day as the start day, and the start day always falls before the
 * current day. The default end day is the current day.
 */
export default function CalendarRangePicker({
  value,
  onChange,
  checkInDates = [],
  workoutDates = [],
  minDate = "",
  className = "",
}) {
  const today = philippinesDateString();
  const yesterday = addPhilippinesDays(today, -1);
  const [open, setOpen] = useState(false);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [view, setView] = useState(() => {
    const start = value?.start || yesterday;
    return { year: Number(start.slice(0, 4)), month: Number(start.slice(5, 7)) };
  });
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);

  const checkIns = useMemo(() => new Set(checkInDates), [checkInDates]);
  const workouts = useMemo(() => new Set(workoutDates), [workoutDates]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const grid = useMemo(() => buildMonthGrid(view.year, view.month), [view]);

  // The earliest day a period may start from.
  const earliest = minDate && minDate < today ? minDate : yesterday;

  const pickDay = (dateKey) => {
    if (dateKey > today || dateKey < earliest) return;
    const current = value || {};

    if (!pickingEnd) {
      // Choosing the "from" day. It always falls before the current day so the
      // period still has a valid end.
      if (dateKey >= today) return;
      onChange({ start: dateKey, end: today });
      setPickingEnd(true);
      return;
    }

    // Choosing the "to" day. It may never be the same day as the "from" day.
    if (dateKey <= current.start) {
      if (dateKey >= today) return;
      onChange({ start: dateKey, end: today });
      setPickingEnd(false);
      return;
    }
    onChange({ start: current.start, end: dateKey });
    setPickingEnd(false);
  };

  const moveMonth = (offset) => {
    setView((current) => {
      const next = current.month + offset;
      if (next < 1) return { year: current.year - 1, month: 12 };
      if (next > 12) return { year: current.year + 1, month: 1 };
      return { year: current.year, month: next };
    });
  };

  const startBeforeToday = (dateKey) => (dateKey < today ? dateKey : yesterday);

  const quickRanges = [
    { label: "This week", range: { start: startBeforeToday(philippinesWeekStart(today)), end: today } },
    { label: "This month", range: { start: startBeforeToday(`${today.slice(0, 7)}-01`), end: today } },
    { label: "This year", range: { start: startBeforeToday(`${today.slice(0, 4)}-01-01`), end: today } },
    { label: "All time", range: { start: earliest, end: today } },
  ];

  const label = describeDateRange(value);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setPickingEnd(false);
        }}
        className="inline-flex min-h-10 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:border-orange-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-white/10 dark:bg-[#111] dark:text-slate-200"
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDays size={16} className="shrink-0 text-orange-500" aria-hidden="true" />
          <span className="whitespace-nowrap">{label}</span>
        </span>
        <span className="shrink-0 text-xs font-medium text-slate-400">Change</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose the progress period"
          className="absolute left-0 z-[70] mt-2 w-[min(20rem,calc(100vw-2.5rem))] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-white/10 dark:bg-[#151515]"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label="Previous month"
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-bold text-slate-800 dark:text-white">{monthTitle(view.year, view.month)}</p>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              aria-label="Next month"
              className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:hover:bg-white/10"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <p className="mb-2 rounded-lg bg-orange-50 px-2.5 py-1.5 text-[11px] font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
            {pickingEnd
              ? "Now pick the day the period ends on"
              : "Pick the day the period starts from"}
          </p>

          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {WEEKDAY_LABELS.map((day) => (
              <span key={day} className="py-1">{day.slice(0, 1)}</span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {grid.map(({ dateKey, inMonth }) => {
              const isStart = value?.start === dateKey;
              const isEnd = value?.end === dateKey;
              const inRange = Boolean(value?.start && value?.end
                && dateKey > value.start && dateKey < value.end);
              const isToday = dateKey === today;
              const disabled = dateKey > today || dateKey < earliest;
              const hasCheckIn = checkIns.has(dateKey);
              const hasWorkout = workouts.has(dateKey);
              return (
                <button
                  key={dateKey}
                  type="button"
                  disabled={disabled}
                  onClick={() => pickDay(dateKey)}
                  aria-pressed={isStart || isEnd}
                  aria-label={`${formatPhilippinesDate(dateKey, { weekday: "long", month: "long", day: "numeric", year: "numeric" })}${isToday ? " (today)" : ""}`}
                  className={`relative flex h-9 flex-col items-center justify-center rounded-lg text-xs font-semibold transition ${
                    isStart || isEnd
                      ? "bg-orange-500 text-white"
                      : disabled
                        ? "cursor-not-allowed text-slate-300 dark:text-slate-700"
                        : inRange
                          ? "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300"
                          : inMonth
                            ? "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
                            : "text-slate-300 hover:bg-slate-50 dark:text-slate-600 dark:hover:bg-white/5"
                  } ${isToday ? "ring-1 ring-inset ring-orange-400" : ""}`}
                >
                  <span>{Number(dateKey.slice(8, 10))}</span>
                  <span className="flex h-1 items-center gap-0.5">
                    {hasCheckIn && !disabled && <span className={`h-1 w-1 rounded-full ${isStart || isEnd ? "bg-white" : "bg-orange-500"}`} aria-hidden="true" />}
                    {hasWorkout && !disabled && <span className={`h-1 w-1 rounded-full ${isStart || isEnd ? "bg-white" : "bg-green-500"}`} aria-hidden="true" />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 dark:border-white/10">
            {quickRanges.map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => {
                  onChange(option.range);
                  setPickingEnd(false);
                  setOpen(false);
                }}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-orange-300 hover:text-orange-600 dark:border-white/10 dark:text-slate-300"
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-white/10">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" aria-hidden="true" /> Check-in
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" aria-hidden="true" /> Workout
              </span>
            </span>
            <span>
              Today is{" "}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {formatPhilippinesDate(today, { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
