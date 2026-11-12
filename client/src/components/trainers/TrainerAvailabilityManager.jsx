import { useEffect, useRef, useState } from "react";
import { CalendarClock, Check, ChevronDown, Clock3, Plus, Save, Trash2, X } from "lucide-react";
import api from "../../services/api";
import trainerApi from "../../trainerApi";
import ConfirmDialog from "../ui/ConfirmDialog";

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
const DEFAULT_MEMBER_LIMIT = 1;

const toClockParts = (value) => {
  const [hours, minutes] = String(value || "").slice(0, 5).split(":").map(Number);
  const hour = Number.isFinite(hours) ? hours : 6;
  return {
    hour: String(hour % 12 || 12),
    minute: String(Number.isFinite(minutes) ? minutes : 0).padStart(2, "0"),
    period: hour >= 12 ? "PM" : "AM",
  };
};

const fromClockParts = ({ hour, minute, period }) => {
  let hours = Number(hour) % 12;
  if (period === "PM") hours += 12;
  return `${String(hours).padStart(2, "0")}:${String(Number(minute)).padStart(2, "0")}`;
};

const formatTime = (value) => {
  const parts = toClockParts(value);
  return `${parts.hour}:${parts.minute} ${parts.period}`;
};

const getCapacityStatus = (assignedMembers, maxMembers, status = "Active") => {
  const assigned = Number(assignedMembers) || 0;
  const capacity = Number(maxMembers) || 0;
  if (status !== "Active") return "Inactive";
  if (capacity > 0 && assigned >= capacity) return "Full";
  if (capacity > 0 && assigned / capacity >= 0.8) return "Near Capacity";
  return "Available";
};

const parseMemberLimit = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  return parsed;
};

function MemberLimitInput({ id, value, onChange }) {
  const [draft, setDraft] = useState(String(value ?? DEFAULT_MEMBER_LIMIT));

  useEffect(() => {
    setDraft(String(value ?? DEFAULT_MEMBER_LIMIT));
  }, [value]);

  return (
    <label htmlFor={id} className="flex min-w-[7.5rem] flex-col gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
      <span>Members</span>
      <input
        id={id}
        type="number"
        min={1}
        max={5}
        step={1}
        inputMode="numeric"
        value={draft}
        onChange={(event) => {
          const nextValue = event.target.value;
          setDraft(nextValue);
          const parsed = parseMemberLimit(nextValue);
          if (parsed === null) return;
          onChange(parsed);
        }}
        onBlur={() => {
          const parsed = parseMemberLimit(draft);
          const safeValue = Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : DEFAULT_MEMBER_LIMIT;
          setDraft(String(safeValue));
          onChange(safeValue);
        }}
        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 dark:border-gray-700 dark:bg-[#111] dark:text-white"
      />
    </label>
  );
}

function AvailabilityRangePicker({ id, value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative w-full max-w-[24rem]">
      <button
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3.5 text-left text-sm text-slate-800 shadow-sm transition hover:border-orange-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 dark:border-gray-700 dark:bg-[#111] dark:text-white dark:hover:border-orange-500/60"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Clock3 size={16} aria-hidden="true" className="shrink-0 text-orange-500" />
          <span className="truncate font-semibold">{selectedOption?.label || "Choose availability"}</span>
        </span>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <ul id={`${id}-options`} role="listbox" aria-label="Availability time range" className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[95] space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-[#141414] dark:ring-white/10">
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm transition ${
                    selected
                      ? "bg-orange-50 font-semibold text-orange-800 ring-1 ring-inset ring-orange-200 dark:bg-orange-500/10 dark:text-orange-200 dark:ring-orange-500/25"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                  }`}
                >
                  <span>{option.label}</span>
                  {selected && <Check size={16} aria-hidden="true" className="shrink-0 text-orange-600 dark:text-orange-400" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TimeOfDaySelect({ id, label, value, onChange }) {
  const parts = toClockParts(value);
  const selectClass = "rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-800 dark:border-gray-700 dark:bg-[#111] dark:text-white";
  const update = (key, nextValue) => {
    onChange(fromClockParts({ ...parts, [key]: nextValue }));
  };

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1 text-[11px] font-medium text-slate-500">{label}</legend>
      <div className="flex items-center gap-1">
        <label className="sr-only" htmlFor={`${id}-hour`}>{label} hour</label>
        <select id={`${id}-hour`} value={parts.hour} onChange={(event) => update("hour", event.target.value)} className={`${selectClass} min-w-0 flex-1`}>
          {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((hour) => (
            <option key={hour} value={hour}>{hour}</option>
          ))}
        </select>
        <span aria-hidden="true">:</span>
        <label className="sr-only" htmlFor={`${id}-minute`}>{label} minute</label>
        <select id={`${id}-minute`} value={parts.minute} onChange={(event) => update("minute", event.target.value)} className={`${selectClass} min-w-0 flex-1`}>
          {Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, "0")).map((minute) => (
            <option key={minute} value={minute}>{minute}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor={`${id}-period`}>{label} AM or PM</label>
        <select id={`${id}-period`} value={parts.period} onChange={(event) => update("period", event.target.value)} className={selectClass}>
          <option value="AM">AM</option>
          <option value="PM">PM</option>
        </select>
      </div>
    </fieldset>
  );
}

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

const findNextCustomRange = (daySlots) => {
  for (let start = MIN_AVAILABILITY_TIME; start + 60 <= MAX_AVAILABILITY_TIME; start += 15) {
    const end = start + 60;
    const overlaps = daySlots.some((slot) => (
      start < timeToMinutes(slot.end_time) &&
      timeToMinutes(slot.start_time) < end
    ));
    if (!overlaps) {
      return {
        start_time: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
        end_time: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
      };
    }
  }
  return null;
};

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
  const [slotToRemove, setSlotToRemove] = useState(null);
  const [capacity, setCapacity] = useState({ max_members: 15, assigned_member_count: 0, status: "Active" });
  const [capacityModalOpen, setCapacityModalOpen] = useState(false);
  const [capacityDraft, setCapacityDraft] = useState("15");
  const [capacityError, setCapacityError] = useState("");
  const [capacitySaving, setCapacitySaving] = useState(false);
  const hoursError = getHoursError(slots);

  useEffect(() => {
    let active = true;
    const loadAvailability = isAdmin
      ? api.get(`/trainers/${trainerId}/availability`)
      : trainerApi.get("/me/availability");
    const loadCapacity = isAdmin
      ? Promise.resolve({ data: { data: { max_members: 15, assigned_member_count: 0, status: "Active" } } })
      : trainerApi.get("/me/capacity");

    loadAvailability
      .then(({ data }) => {
        if (!active) return;
        const loadedSlots = (data.data || []).map((slot) => ({
          ...slot,
          id: freshId(),
          member_limit: Number.isInteger(Number(slot.member_limit)) && Number(slot.member_limit) >= 1 && Number(slot.member_limit) <= 5
            ? Number(slot.member_limit)
            : DEFAULT_MEMBER_LIMIT,
          custom: !AVAILABILITY_RANGES.some((range) => (
            range.start_time === String(slot.start_time).slice(0, 5) &&
            range.end_time === String(slot.end_time).slice(0, 5)
          )),
          start_time: String(slot.start_time).slice(0, 5),
          end_time: String(slot.end_time).slice(0, 5),
        }));
        setSlots(loadedSlots);
        setError(getHoursError(loadedSlots));
        setHasChanges(false);
      })
      .catch((err) => {
        if (active) setError(err.response?.data?.message || "Unable to load coach availability.");
      });

    loadCapacity
      .then(({ data }) => {
        if (!active) return;
        const nextCapacity = data?.data || { max_members: 15, assigned_member_count: 0, status: "Active" };
        setCapacity({
          max_members: Number(nextCapacity.max_members) || 15,
          assigned_member_count: Number(nextCapacity.assigned_member_count) || 0,
          status: nextCapacity.status || "Active",
        });
        setCapacityDraft(String(Number(nextCapacity.max_members) || 15));
      })
      .catch(() => {
        if (active) setCapacity({ max_members: 15, assigned_member_count: 0, status: "Active" });
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
    const customRange = nextRange ? null : findNextCustomRange(daySlots);
    const newRange = nextRange || customRange;
    if (!newRange) {
      setError("No additional non-overlapping time ranges are available for this day.");
      return;
    }
    const updatedSlots = [
      ...slots,
      {
        id: freshId(),
        day_of_week: dayOfWeek,
        start_time: newRange.start_time,
        end_time: newRange.end_time,
        member_limit: DEFAULT_MEMBER_LIMIT,
        custom: !nextRange,
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
    if (rangeValue === "custom") {
      const updatedSlots = slots.map((slot) => slot.id === id ? { ...slot, custom: true } : slot);
      setSlots(updatedSlots);
      setHasChanges(true);
      setError(getHoursError(updatedSlots));
      setSuccess("");
      return;
    }
    const selectedRange = AVAILABILITY_RANGES.find((range) => range.value === rangeValue);
    if (!selectedRange) return;
    const updatedSlots = slots.map((slot) => slot.id === id
      ? { ...slot, start_time: selectedRange.start_time, end_time: selectedRange.end_time, custom: false }
      : slot);
    setSlots(updatedSlots);
    setHasChanges(true);
    setError(getHoursError(updatedSlots));
    setSuccess("");
  };

  const updateSlotTime = (id, field, value) => {
    const updatedSlots = slots.map((slot) => slot.id === id ? { ...slot, [field]: value, custom: true } : slot);
    setSlots(updatedSlots);
    setHasChanges(true);
    setError(getHoursError(updatedSlots));
    setSuccess("");
  };

  const updateSlotMemberLimit = (id, value) => {
    const safeValue = Number.isInteger(value) && value >= 1 && value <= 5 ? value : DEFAULT_MEMBER_LIMIT;
    const updatedSlots = slots.map((slot) => slot.id === id ? { ...slot, member_limit: safeValue } : slot);
    setSlots(updatedSlots);
    setHasChanges(true);
    setError(getHoursError(updatedSlots));
    setSuccess("");
  };

  const updateCapacityValue = async () => {
    const nextValue = Number(capacityDraft);
    if (!Number.isInteger(nextValue) || nextValue < 1 || nextValue > 10000) {
      setCapacityError("Enter a whole-number capacity between 1 and 10,000.");
      return;
    }
    if (nextValue < capacity.assigned_member_count) {
      setCapacityError(`Capacity cannot be lower than the ${capacity.assigned_member_count} members already assigned.`);
      return;
    }
    setCapacitySaving(true);
    setCapacityError("");
    try {
      const response = await trainerApi.put("/me/capacity", { max_members: nextValue });
      const nextCapacity = response.data?.data || { max_members: nextValue, assigned_member_count: capacity.assigned_member_count, status: capacity.status };
      setCapacity({
        max_members: Number(nextCapacity.max_members) || nextValue,
        assigned_member_count: Number(nextCapacity.assigned_member_count) || capacity.assigned_member_count,
        status: nextCapacity.status || capacity.status,
      });
      setCapacityDraft(String(Number(nextCapacity.max_members) || nextValue));
      setCapacityModalOpen(false);
    } catch (err) {
      setCapacityError(err.response?.data?.message || "Unable to update your capacity.");
    } finally {
      setCapacitySaving(false);
    }
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
      const availability = slots.map(({ day_of_week, start_time, end_time, member_limit }) => ({
        day_of_week: Number(day_of_week),
        start_time,
        end_time,
        member_limit: Number.isInteger(Number(member_limit)) && Number(member_limit) >= 1 && Number(member_limit) <= 5
          ? Number(member_limit)
          : DEFAULT_MEMBER_LIMIT,
      }));
      const response = isAdmin
        ? await api.put(`/trainers/${trainerId}/availability`, { availability })
        : await trainerApi.put("/me/availability", { availability });
      setSlots((response.data.data || []).map((slot) => ({
        ...slot,
        id: freshId(),
        member_limit: Number.isInteger(Number(slot.member_limit)) && Number(slot.member_limit) >= 1 && Number(slot.member_limit) <= 5
          ? Number(slot.member_limit)
          : DEFAULT_MEMBER_LIMIT,
        custom: !AVAILABILITY_RANGES.some((range) => (
          range.start_time === String(slot.start_time).slice(0, 5) &&
          range.end_time === String(slot.end_time).slice(0, 5)
        )),
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
      {!isAdmin && (
        <div className="rounded-2xl border border-slate-800 bg-[#171717] p-4 text-white shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-300">Member capacity</p>
          <div className="mt-4 flex items-center justify-between gap-4">
            <div className="text-2xl font-black tracking-tight text-white sm:text-[2rem]">
              {capacity.assigned_member_count}/{capacity.max_members} members
            </div>
            <button
              type="button"
              onClick={() => {
                setCapacityDraft(String(capacity.max_members || 15));
                setCapacityError("");
                setCapacityModalOpen(true);
              }}
              className="rounded-lg bg-transparent px-2.5 py-1.5 text-sm font-bold text-orange-400 hover:bg-orange-500/10"
            >
              Edit
            </button>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-700">
            <div
              className={`h-full rounded-full ${getCapacityStatus(capacity.assigned_member_count, capacity.max_members, capacity.status) === "Full" ? "bg-red-500" : getCapacityStatus(capacity.assigned_member_count, capacity.max_members, capacity.status) === "Near Capacity" ? "bg-orange-500" : "bg-green-500"}`}
              style={{ width: `${Math.min((Number(capacity.assigned_member_count || 0) / Math.max(Number(capacity.max_members) || 1, 1)) * 100, 100)}%` }}
            />
          </div>
          <div className="mt-3 inline-flex rounded-full bg-green-500/15 px-3 py-1.5 text-sm font-bold text-green-300">
            {getCapacityStatus(capacity.assigned_member_count, capacity.max_members, capacity.status)}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2">
          <CalendarClock size={20} className="text-orange-500" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {isAdmin ? `${trainerName}'s availability` : "My availability"}
          </h2>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {isAdmin
            ? "View the coach's recurring weekly working hours."
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
                  {!isAdmin && <button
                    type="button"
                    onClick={() => addSlot(dayOfWeek)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-500/10"
                  >
                    <Plus size={14} /> Add time
                  </button>}
                </div>
                {daySlots.length === 0 ? (
                  <p className="text-xs text-slate-400">Not available</p>
                ) : (
                  <div className="space-y-2">
                    {daySlots.map((slot) => (
                      <div key={slot.id} className="flex flex-wrap items-start gap-2">
                        <div className="min-w-0 flex-1 space-y-2">
                          {isAdmin ? (
                            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
                              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                {formatTime(slot.start_time)} – {formatTime(slot.end_time)}
                              </p>
                              <span className="rounded-full bg-orange-100 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
                                {slot.member_limit ?? DEFAULT_MEMBER_LIMIT} members max
                              </span>
                            </div>
                          ) : (
                            <>
                              <label className="sr-only" htmlFor={`range-${slot.id}`}>{day} availability time</label>
                              <AvailabilityRangePicker
                                id={`range-${slot.id}`}
                                value={slot.custom ? "custom" : AVAILABILITY_RANGES.find((range) => range.start_time === slot.start_time && range.end_time === slot.end_time)?.value || "custom"}
                                options={[
                                  { value: "custom", label: `Custom · ${formatTime(slot.start_time)}–${formatTime(slot.end_time)}` },
                                  ...AVAILABILITY_RANGES,
                                ]}
                                onChange={(value) => updateSlotRange(slot.id, value)}
                              />
                            </>
                          )}
                          {!isAdmin && (slot.custom || AVAILABILITY_RANGES.every((range) => range.start_time !== slot.start_time || range.end_time !== slot.end_time)) && (
                            <div className="grid max-w-[24rem] grid-cols-1 gap-2 sm:grid-cols-2">
                              <TimeOfDaySelect
                                id={`range-${slot.id}-start`}
                                label="Start time"
                                value={slot.start_time}
                                onChange={(value) => updateSlotTime(slot.id, "start_time", value)}
                              />
                              <TimeOfDaySelect
                                id={`range-${slot.id}-end`}
                                label="End time"
                                value={slot.end_time}
                                onChange={(value) => updateSlotTime(slot.id, "end_time", value)}
                              />
                            </div>
                          )}
                          {!isAdmin && (
                            <div className="flex items-end justify-end">
                              <MemberLimitInput
                                id={`member-limit-${slot.id}`}
                                value={slot.member_limit ?? DEFAULT_MEMBER_LIMIT}
                                onChange={(value) => updateSlotMemberLimit(slot.id, value)}
                              />
                            </div>
                          )}
                        </div>
                        {!isAdmin && <button
                          type="button"
                          onClick={() => setSlotToRemove(slot)}
                          aria-label={`Remove ${day} time slot`}
                          className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                        >
                          <Trash2 size={16} />
                        </button>}
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
        {!isAdmin && <button
          type="button"
          onClick={save}
          disabled={loading || saving || Boolean(hoursError) || !hasChanges}
          className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          <Save size={16} /> {saving ? "Saving…" : hasChanges ? "Save changes" : "Saved"}
        </button>}
      </div>
    </div>
  );

  return (
    <>
      {slotToRemove && (
        <ConfirmDialog
          title={`Remove ${DAYS[Number(slotToRemove.day_of_week)]} availability?`}
          description={`${formatTime(slotToRemove.start_time)}–${formatTime(slotToRemove.end_time)} will be removed from your unsaved availability changes.`}
          confirmLabel="Remove time slot"
          onCancel={() => setSlotToRemove(null)}
          onConfirm={() => {
            removeSlot(slotToRemove.id);
            setSlotToRemove(null);
          }}
        />
      )}
      {!isAdmin && capacityModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={() => setCapacityModalOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="coach-capacity-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#151515]" onClick={(event) => event.stopPropagation()}>
            <h2 id="coach-capacity-title" className="text-xl font-bold text-slate-900 dark:text-white">Coach member capacity</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">You currently have {capacity.assigned_member_count} assigned member(s).</p>
            <label htmlFor="coach-max-members" className="mt-5 block text-sm font-semibold text-slate-700 dark:text-slate-200">Maximum members</label>
            <input
              id="coach-max-members"
              type="number"
              min={1}
              max={10000}
              step={1}
              value={capacityDraft}
              onChange={(event) => setCapacityDraft(event.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-orange-500 dark:border-white/10 dark:bg-[#111] dark:text-white"
            />
            {capacityError && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{capacityError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setCapacityModalOpen(false)} disabled={capacitySaving} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50 dark:border-white/10 dark:text-slate-300">Cancel</button>
              <button type="button" onClick={updateCapacityValue} disabled={capacitySaving} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{capacitySaving ? "Saving..." : "Save capacity"}</button>
            </div>
          </div>
        </div>
      )}
      {!isAdmin ? (
        <div className="mx-auto max-w-3xl">{content}</div>
      ) : (
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
      )}
    </>
  );
}
