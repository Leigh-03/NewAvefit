import { useEffect, useState } from "react";
import { CalendarClock, Plus, Save, Trash2, X } from "lucide-react";
import api from "../../services/api";
import trainerApi from "../../trainerApi";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const AVAILABILITY_RANGES = [
  { value: "06:00|12:00", label: "Morning · 6:00 AM–12:00 PM", start_time: "06:00", end_time: "12:00" },
  { value: "12:00|17:00", label: "Afternoon · 12:00 PM–5:00 PM", start_time: "12:00", end_time: "17:00" },
  { value: "17:00|22:00", label: "Evening · 5:00 PM–10:00 PM", start_time: "17:00", end_time: "22:00" },
  { value: "06:00|22:00", label: "Flexible · 6:00 AM–10:00 PM", start_time: "06:00", end_time: "22:00" },
];

const freshId = () => `${Date.now()}-${Math.random()}`;
const MIN_AVAILABILITY_TIME = 6 * 60;
const MAX_AVAILABILITY_TIME = 22 * 60;

const getHoursError = (slots) => {
  const invalidRange = slots.some((slot) => {
    const start = timeToMinutes(slot.start_time);
    const end = timeToMinutes(slot.end_time);
    return start === null || end === null ||
      start < MIN_AVAILABILITY_TIME || start > MAX_AVAILABILITY_TIME ||
      end < MIN_AVAILABILITY_TIME || end > MAX_AVAILABILITY_TIME;
  });
  if (invalidRange) return "Coach availability must be between 6:00 AM and 10:00 PM.";
  if (slots.some((slot) => timeToMinutes(slot.end_time) <= timeToMinutes(slot.start_time))) {
    return "Each availability slot must end after it starts.";
  }

  for (let i = 0; i < slots.length; i += 1) {
    for (let j = i + 1; j < slots.length; j += 1) {
      const first = slots[i];
      const second = slots[j];
      if (
        Number(first.day_of_week) === Number(second.day_of_week) &&
        timeToMinutes(first.start_time) < timeToMinutes(second.end_time) &&
        timeToMinutes(second.start_time) < timeToMinutes(first.end_time)
      ) {
        return "Availability time slots on the same day must not overlap.";
      }
    }
  }
  return "";
};

function timeToMinutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export default function TrainerAvailabilityManager({
  mode = "trainer",
  trainerId,
  trainerName = "Coach",
  onClose,
}) {
  const isAdmin = mode === "admin";
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const hoursError = getHoursError(slots);

  useEffect(() => {
    let active = true;
    const request = isAdmin
      ? api.get(`/trainers/${trainerId}/availability`)
      : trainerApi.get("/me/availability");
    request
      .then(({ data }) => {
        if (active) {
          const loadedSlots = (data.data || []).map((slot) => ({
            ...slot,
            id: freshId(),
            start_time: String(slot.start_time).slice(0, 5),
            end_time: String(slot.end_time).slice(0, 5),
          }));
          setSlots(loadedSlots);
          setError(getHoursError(loadedSlots));
          setHasChanges(false);
        }
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.message || "Unable to load coach availability.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [isAdmin, trainerId]);

  const addSlot = (dayOfWeek) => {
    const daySlots = slots.filter((slot) => Number(slot.day_of_week) === dayOfWeek);
    const nextRange = AVAILABILITY_RANGES.find((range) => daySlots.every((slot) => (
      timeToMinutes(range.start_time) >= timeToMinutes(slot.end_time) ||
      timeToMinutes(slot.start_time) >= timeToMinutes(range.end_time)
    )));
    if (!nextRange) {
      setError("No additional non-overlapping time ranges are available for this day.");
      return;
    }
    const updatedSlots = [
      ...slots,
      {
        id: freshId(),
        day_of_week: dayOfWeek,
        start_time: nextRange.start_time,
        end_time: nextRange.end_time,
      },
    ];
    setSlots(updatedSlots);
    setHasChanges(true);
    setError(getHoursError(updatedSlots));
    setSuccess("");
  };

  const removeSlot = (id) => {
    const updatedSlots = slots.filter((slot) => slot.id !== id);
    setSlots(updatedSlots);
    setHasChanges(true);
    setError(getHoursError(updatedSlots));
    setSuccess("");
  };

  const updateSlotRange = (id, rangeValue) => {
    const selectedRange = AVAILABILITY_RANGES.find((range) => range.value === rangeValue);
    if (!selectedRange) return;
    const updatedSlots = slots.map((slot) => slot.id === id
      ? { ...slot, start_time: selectedRange.start_time, end_time: selectedRange.end_time }
      : slot);
    setSlots(updatedSlots);
    setHasChanges(true);
    setError(getHoursError(updatedSlots));
    setSuccess("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    if (hoursError) {
      setError(hoursError);
      setSaving(false);
      return;
    }
    try {
      const availability = slots.map(({ day_of_week, start_time, end_time }) => ({
        day_of_week: Number(day_of_week),
        start_time,
        end_time,
      }));
      const response = await trainerApi.put("/me/availability", { availability });
      setSlots((response.data.data || []).map((slot) => ({
        ...slot,
        id: freshId(),
        start_time: String(slot.start_time).slice(0, 5),
        end_time: String(slot.end_time).slice(0, 5),
      })));
      setHasChanges(false);
      setError("");
      setSuccess("Availability saved.");
    } catch (err) {
      setError(err.response?.data?.message || "Unable to save coach availability.");
    } finally {
      setSaving(false);
    }
  };

  const content = (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <CalendarClock size={20} className="text-orange-500" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isAdmin ? `${trainerName}'s availability` : "My availability"}
          </h2>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {isAdmin
            ? "View the coach's recurring weekly availability. Only the coach can change these hours."
            : "Choose recurring weekly time windows. You can add more than one non-overlapping time range per day."}
        </p>
      </div>

      {(error || hoursError) && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error || hoursError}</p>}
      {success && <p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700 dark:bg-green-500/10 dark:text-green-300">{success}</p>}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading availability…</p>
      ) : (
        <div className="space-y-3">
          {DAYS.map((day, dayOfWeek) => {
            const daySlots = slots.filter((slot) => Number(slot.day_of_week) === dayOfWeek);
            return (
              <section key={day} className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800 dark:text-white">{day}</h3>
                  {!isAdmin && (
                    <button
                      type="button"
                      onClick={() => addSlot(dayOfWeek)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-500/10"
                    >
                      <Plus size={14} /> Add time
                    </button>
                  )}
                </div>
                {daySlots.length === 0 ? (
                  <p className="text-xs text-slate-400">Not available</p>
                ) : (
                  <div className="space-y-2">
                    {daySlots.map((slot) => (
                      <div key={slot.id} className="flex flex-wrap items-center gap-2">
                        {isAdmin ? (
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                            {AVAILABILITY_RANGES.find((range) => range.start_time === slot.start_time && range.end_time === slot.end_time)?.label
                              || `${slot.start_time}–${slot.end_time}`}
                          </p>
                        ) : (
                          <>
                            <label className="sr-only" htmlFor={`range-${slot.id}`}>{day} availability time</label>
                            <select
                              id={`range-${slot.id}`}
                              value={AVAILABILITY_RANGES.find((range) => range.start_time === slot.start_time && range.end_time === slot.end_time)?.value || "custom"}
                              onChange={(event) => updateSlotRange(slot.id, event.target.value)}
                              className="max-w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 dark:border-gray-700 dark:bg-[#111] dark:text-white"
                            >
                              <option value="custom" disabled>Custom saved time · {slot.start_time}–{slot.end_time}</option>
                              {AVAILABILITY_RANGES.map((range) => (
                                <option key={range.value} value={range.value}>{range.label}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => removeSlot(slot.id)}
                              aria-label={`Remove ${day} time slot`}
                              className="grid h-9 w-9 place-items-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className={`flex items-center justify-between gap-3 ${isAdmin ? "justify-end" : "sticky bottom-3 z-10 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur dark:border-white/10 dark:bg-[#111]/95"}`}>
        {!isAdmin && (
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {hasChanges ? "Unsaved changes" : success || "Availability is up to date"}
          </p>
        )}
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 dark:border-gray-700 dark:text-slate-300">
            Close
          </button>
        )}
        {!isAdmin && (
          <button
            type="button"
            onClick={save}
            disabled={loading || saving || Boolean(hoursError) || !hasChanges}
            className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <Save size={16} /> {saving ? "Saving…" : hasChanges ? "Save changes" : "Saved"}
          </button>
        )}
      </div>
    </div>
  );

  if (!isAdmin) return <div className="mx-auto max-w-3xl">{content}</div>;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-[#151515] sm:p-7" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={onClose} aria-label="Close availability editor" className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
            <X size={18} />
          </button>
        </div>
        {content}
      </div>
    </div>
  );
}
