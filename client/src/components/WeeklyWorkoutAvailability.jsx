import { useEffect, useState } from "react";
import userApi from "../userApi";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIME_OPTIONS = [
  { value: "Morning", label: "Morning", detail: "6:00 AM – 12:00 PM" },
  { value: "Afternoon", label: "Afternoon", detail: "12:00 PM – 5:00 PM" },
  { value: "Evening", label: "Evening", detail: "5:00 PM – 10:00 PM" },
  { value: "Flexible", label: "Flexible", detail: "6:00 AM – 10:00 PM" },
];
const DURATION_OPTIONS = [
  { value: 30, label: "30 minutes", detail: "Short session" },
  { value: 45, label: "45 minutes", detail: "Moderate session" },
  { value: 60, label: "60 minutes", detail: "Standard session" },
  { value: 75, label: "75 minutes", detail: "Extended session" },
  { value: 90, label: "90 minutes", detail: "Extended session" },
];
const EXPERIENCE_RANGES = {
  Beginner: { min: 2, max: 3 },
  Intermediate: { min: 3, max: 5 },
  Advanced: { min: 4, max: 6 },
};
const normalizeDuration = (value) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return DURATION_OPTIONS.some((option) => option.value === parsed) ? parsed : "";
};

const readDraft = () => {
  try {
    const raw = sessionStorage.getItem("avefit_availability");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export default function WeeklyWorkoutAvailability({ onContinue, experienceLevel, className = "" }) {
  const hasContinue = Boolean(onContinue);
  const [availability, setAvailability] = useState([]);
  const [daysPerWeek, setDaysPerWeek] = useState("");
  const [duration, setDuration] = useState("");
  const [level, setLevel] = useState(experienceLevel || "Beginner");
  const [setupComplete, setSetupComplete] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([
      userApi.get("/profile/availability"),
      userApi.get("/profile/change-requests"),
    ])
      .then(([{ data }, requestsResponse]) => {
        if (!active) return;
        const saved = data.data || {};
        setPendingRequest((requestsResponse.data?.data || []).some((request) => (
          request.status === "Pending" && Boolean(request.payload?.weekly_availability)
        )));
        const draft = hasContinue ? readDraft() : null;
        const savedLevel = experienceLevel || saved.activity_level || "Beginner";
        const range = EXPERIENCE_RANGES[savedLevel] || EXPERIENCE_RANGES.Beginner;
        setSetupComplete(saved.setup_completed === true);
        setLevel(savedLevel);
        setAvailability(draft?.availability || saved.availability || []);
        setDaysPerWeek(String(
          draft?.daysPerWeek ??
          saved.workout_days_per_week ??
          range.min
        ));
        setDuration(normalizeDuration(draft?.duration ?? saved.workout_duration));
      })
      .catch((err) => {
        console.error("Weekly availability load failed:", err);
        if (active) setError(err.response?.data?.message || "Unable to load your weekly availability.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [experienceLevel, hasContinue]);

  useEffect(() => {
    if (experienceLevel) setLevel(experienceLevel);
  }, [experienceLevel]);

  const range = EXPERIENCE_RANGES[level] || EXPERIENCE_RANGES.Beginner;
  const frequency = Number(daysPerWeek);
  const frequencyOptions = Array.from(
    { length: range.max - range.min + 1 },
    (_, index) => range.min + index
  );
  const isLegacyFrequency = daysPerWeek && !frequencyOptions.includes(frequency);
  const frequencyMessage = isLegacyFrequency
    ? `${level} users should select ${range.min}–${range.max} workout days per week. Please choose a valid frequency.`
    : frequency > availability.length
      ? `You selected ${frequency} workout days per week, but you are only available on ${availability.length} days. Please update your availability or workout frequency.`
      : "";

  const toggleDay = (day) => {
    setError("");
    setNotice("");
    setAvailability((current) => current.some((slot) => slot.day_of_week === day)
      ? current.filter((slot) => slot.day_of_week !== day)
      : [...current, { day_of_week: day, time_preference: "Flexible" }]
    );
  };

  const updateDayTime = (day, timePreference) => {
    setAvailability((current) => current.map((slot) => (
      slot.day_of_week === day ? { ...slot, time_preference: timePreference } : slot
    )));
    setError("");
    setNotice("");
  };

  const save = async () => {
    setError("");
    setNotice("");
    if (frequencyMessage) {
      setError(frequencyMessage);
      return;
    }
    if (!duration) {
      setError("Choose a preferred workout session duration.");
      return;
    }
    if (availability.length === 0) {
      setError("Select at least one day when you are available to work out.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workout_days_per_week: frequency,
        workout_duration: Number(duration),
        availability,
        activity_level: level,
      };
      const { data } = await userApi.put("/profile/availability", payload);
      if (data.request) {
        setPendingRequest(true);
        setNotice(data.message || "Your weekly availability change was submitted for admin approval.");
        return;
      }
      const savedAvailability = data.data.availability;
      const draft = {
        daysPerWeek: String(frequency),
        duration: `${duration} mins`,
        availability: savedAvailability,
        days: savedAvailability.map((slot) => slot.day_of_week),
      };
      sessionStorage.setItem("avefit_availability", JSON.stringify(draft));
      if (onContinue) {
        onContinue(draft);
      } else {
        setAvailability(savedAvailability);
        setNotice(data.message || "Weekly availability saved.");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save your weekly availability.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={`space-y-5 ${className}`} aria-labelledby="weekly-availability-heading">
      <div>
        <h2 id="weekly-availability-heading" className="text-xl font-bold text-slate-900 dark:text-white">
          Weekly workout availability
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Choose when you can train on each day. Workouts will only be scheduled on available days.
        </p>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-300">{notice}</p>}
      {setupComplete && (
        <p role="status" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
          Changes to your workout schedule and experience level take effect after admin approval.
        </p>
      )}
      {pendingRequest && (
        <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-200">
          You already have a weekly availability change waiting for admin review.
        </p>
      )}

      {loading ? (
        <div className="space-y-3" aria-label="Loading weekly availability">
          {DAYS.slice(0, 4).map((day) => <div key={day} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />)}
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {DAYS.map((day) => {
              const selected = availability.find((slot) => slot.day_of_week === day);
              return (
                <div
                  key={day}
                  className={`rounded-xl border p-3 transition ${
                    selected
                      ? "border-orange-500/50 bg-orange-500/[0.06]"
                      : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      <input
                        type="checkbox"
                        checked={Boolean(selected)}
                        onChange={() => toggleDay(day)}
                        className="h-4 w-4 accent-orange-500"
                      />
                      {day}
                    </label>
                    <span className={`text-xs font-medium ${selected ? "text-orange-600 dark:text-orange-300" : "text-slate-500"}`}>
                      {selected ? "Available" : "Unavailable"}
                    </span>
                  </div>
                  {selected && (
                    <label className="mt-2 block">
                      <span className="sr-only">{day} time preference</span>
                      <select
                        value={selected.time_preference}
                        onChange={(event) => updateDayTime(day, event.target.value)}
                        className="min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 dark:border-white/10 dark:bg-[#111] dark:text-slate-200"
                      >
                        {TIME_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label} ({option.detail})</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              );
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Workout days per week
              <select
                value={daysPerWeek}
                onChange={(event) => {
                  setDaysPerWeek(event.target.value);
                  setError("");
                }}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 dark:border-white/10 dark:bg-[#111] dark:text-white"
              >
                {isLegacyFrequency && <option value={daysPerWeek}>{daysPerWeek} days (update to match your experience level)</option>}
                {frequencyOptions.map((count) => (
                  <option key={count} value={count}>{count} days per week</option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal text-slate-500">
                {level}: {range.min}–{range.max} days per week
              </span>
            </label>

            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Preferred Workout Session Duration
              <select
                value={duration}
                required
                onChange={(event) => {
                  setDuration(normalizeDuration(event.target.value));
                  setError("");
                }}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-900 dark:border-white/10 dark:bg-[#111] dark:text-white"
              >
                <option value="" disabled>Choose a session duration</option>
                {DURATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label} – {option.detail}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal text-slate-500">Maximum preferred time for each workout session.</span>
            </label>
          </div>

          <p className="text-xs text-slate-500">
            {availability.length} {availability.length === 1 ? "day" : "days"} available · {frequency || "—"} workout days requested
          </p>
          {onContinue && (
            <button type="button" onClick={save} disabled={saving} className="w-full rounded-xl bg-orange-500 py-3 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Saving…" : "Continue to Coach Selection →"}
            </button>
          )}
          {!onContinue && (
            <button type="button" onClick={save} disabled={saving || pendingRequest} className="min-h-11 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "Saving…" : "Save availability"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
