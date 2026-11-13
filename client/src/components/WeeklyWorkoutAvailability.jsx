import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import userApi from "../userApi";
import {
  coachSlotMatchesMemberSlot,
  getMemberAvailabilitySlots,
} from "../utils/availabilityMatching";
import { formatWorkoutTime } from "../utils/workoutSchedule";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const COACH_DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIME_OPTIONS = [
  { value: "Morning", label: "Morning", detail: "6:00 AM – 12:00 PM" },
  { value: "Afternoon", label: "Afternoon", detail: "12:00 PM – 5:00 PM" },
  { value: "Evening", label: "Evening", detail: "5:00 PM – 10:00 PM" },
  { value: "Flexible", label: "Flexible", detail: "6:00 AM – 10:00 PM" },
];
const EXPERIENCE_RANGES = {
  Beginner: { min: 2, max: 3 },
  Intermediate: { min: 3, max: 5 },
  Advanced: { min: 4, max: 6 },
};

function isCoachDayFull(coach, day) {
  const dayIndex = COACH_DAY_NAMES.indexOf(day);
  const daySlots = (Array.isArray(coach?.availability) ? coach.availability : [])
    .filter((slot) => Number(slot.day_of_week) === dayIndex);

  return daySlots.length > 0 && daySlots.every((slot) => {
    const memberLimit = Number(slot.member_limit);
    return memberLimit > 0 && Number(slot.assigned_member_count) >= memberLimit;
  });
}

const readDraft = () => {
  try {
    const raw = sessionStorage.getItem("avefit_availability");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

function CoachScheduleComparison({ coach, availability, loading }) {
  if (!coach) return null;
  const coachSlots = Array.isArray(coach.availability) ? coach.availability : [];
  const memberSlots = getMemberAvailabilitySlots({ availability });

  return (
    <section
      aria-labelledby="coach-schedule-comparison-heading"
      className="rounded-2xl border border-orange-500/30 bg-orange-500/[0.04] p-4 sm:p-5 dark:bg-white/[0.03]"
    >
      <div className="mb-3">
        <h3 id="coach-schedule-comparison-heading" className="font-bold text-slate-900 dark:text-white">
          Compare your schedule with {coach.full_name}
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Update your days and time preferences below. Green means a schedule match with space available; red means the matching time is full.
        </p>
      </div>
      {coachSlots.length ? (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))" }}
        >
          {coachSlots.map((slot, index) => {
            const matchesSchedule = !loading && memberSlots.some((memberSlot) => (
              coachSlotMatchesMemberSlot(slot, memberSlot, 60)
            ));
            const assignedMembers = Number(slot.assigned_member_count) || 0;
            const memberLimit = Number(slot.member_limit) || 0;
            const hasCapacityInfo = memberLimit > 0;
            const hasCapacity = hasCapacityInfo && assignedMembers < memberLimit;
            const matchesAndHasCapacity = matchesSchedule && hasCapacity;
            const matchesButIsFull = matchesSchedule && hasCapacityInfo && !hasCapacity;
            const day = COACH_DAY_NAMES[Number(slot.day_of_week)] || "Day";
            const startTime = formatWorkoutTime(slot.start_time) || "—";
            const endTime = formatWorkoutTime(slot.end_time) || "—";

            return (
              <div
                key={`${slot.day_of_week}-${slot.start_time}-${index}`}
                className={`rounded-xl border-2 p-3 ${
                  matchesAndHasCapacity
                    ? "border-emerald-500 bg-emerald-50/70 dark:border-emerald-400 dark:bg-emerald-500/10"
                    : matchesButIsFull
                      ? "border-red-400 bg-red-50/60 dark:border-red-400 dark:bg-red-500/10"
                      : "border-slate-200 bg-white dark:border-white/10 dark:bg-[#111]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">{day}</span>
                  <span className="whitespace-nowrap text-sm text-slate-600 dark:text-slate-300">{startTime}–{endTime}</span>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span>Members for this time</span>
                  <span className="whitespace-nowrap font-semibold text-slate-800 dark:text-slate-100">
                    {assignedMembers} / {hasCapacityInfo ? memberLimit : "limit not set"}
                  </span>
                </div>
                <p className={`mt-1 text-xs font-semibold ${
                  loading
                    ? "text-slate-500 dark:text-slate-400"
                    : matchesAndHasCapacity
                      ? "text-emerald-700 dark:text-emerald-300"
                      : matchesButIsFull
                        ? "text-red-600 dark:text-red-300"
                        : matchesSchedule
                          ? "text-amber-700 dark:text-amber-300"
                          : "text-slate-500 dark:text-slate-400"
                }`}>
                  {loading
                    ? "Checking your schedule match…"
                    : matchesAndHasCapacity
                      ? "Matches your schedule and has capacity"
                      : matchesButIsFull
                        ? "Matches your schedule, but this time is full"
                        : matchesSchedule
                          ? "Schedule matches; member limit is not set"
                          : "Does not match your selected schedule"}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          This coach has not posted weekly availability.
        </p>
      )}
    </section>
  );
}

export default function WeeklyWorkoutAvailability({
  onContinue,
  experienceLevel,
  comparisonCoach,
  className = "",
}) {
  const hasContinue = Boolean(onContinue);
  const [availability, setAvailability] = useState([]);
  const [daysPerWeek, setDaysPerWeek] = useState("");
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
    : frequency > 0 && frequency !== availability.length
      ? `Select exactly ${frequency} available days to match your weekly workout frequency. You currently selected ${availability.length}.`
      : "";

  const toggleDay = (day) => {
    const alreadySelected = availability.some((slot) => slot.day_of_week === day);
    if (!alreadySelected && frequency > 0 && availability.length >= frequency) {
      setError(`You can select only ${frequency} available days for your workout frequency.`);
      return;
    }
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
    if (availability.length === 0) {
      setError("Select at least one day when you are available to work out.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workout_days_per_week: frequency,
        availability,
        activity_level: level,
      };
      const { data } = await userApi.put("/profile/availability", payload);
      if (data.request) {
        setPendingRequest(true);
        setNotice(data.message || "Your weekly availability change was submitted for admin approval.");
        if (data.email_sent === false) {
          setError("The schedule request was saved, but the administrator email could not be delivered. Contact the gym administrator to confirm.");
        } else {
          setNotice(`${data.message || "Your weekly availability change was submitted for admin approval."} An email notification was sent to the administrator.`);
        }
        return;
      }
      const savedAvailability = data.data.availability;
      const draft = {
        daysPerWeek: String(frequency),
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
      <CoachScheduleComparison
        coach={comparisonCoach}
        availability={availability}
        loading={loading}
      />

      {loading ? (
        <div role="status" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Loading your saved weekly availability…</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {DAYS.slice(0, 4).map((day) => <div key={day} className="h-16 animate-pulse rounded-xl bg-slate-200 dark:bg-white/10" />)}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {DAYS.map((day) => {
              const selected = availability.find((slot) => slot.day_of_week === day);
              const coachDayFull = Boolean(comparisonCoach) && isCoachDayFull(comparisonCoach, day);
              const dayDisabled = !selected && (
                coachDayFull || (frequency > 0 && availability.length >= frequency)
              );
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
                    <label className={`flex min-h-9 items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100 ${
                      dayDisabled ? "cursor-not-allowed" : "cursor-pointer"
                    }`}>
                      <input
                        type="checkbox"
                        checked={Boolean(selected)}
                        aria-describedby={coachDayFull ? `coach-day-full-${day}` : undefined}
                        disabled={dayDisabled}
                        onChange={() => toggleDay(day)}
                        className="h-4 w-4 accent-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
                      />
                      {day}
                    </label>
                    {coachDayFull ? (
                      <span
                        id={`coach-day-full-${day}`}
                        className="flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-300"
                      >
                        {!selected && <LockKeyhole size={13} aria-hidden="true" />}
                        Coach day full
                      </span>
                    ) : selected ? (
                      <span className="text-xs font-medium text-orange-600 dark:text-orange-300">
                        Available
                      </span>
                    ) : null}
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

          <div className="grid gap-4">
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

          </div>

          <p className="text-xs text-slate-500">
            {availability.length} {availability.length === 1 ? "day" : "days"} available · {frequency || "—"} workout days requested
          </p>
          {onContinue && (
            <button type="button" onClick={save} disabled={saving} className="w-full rounded-xl bg-orange-500 py-3 font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">
             {saving ? "Saving…" : comparisonCoach ? "Continue to Confirmation →" : "Continue to Coach Selection →"}
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
