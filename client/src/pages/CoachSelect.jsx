import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import OnboardingShell from "../components/layout/OnboardingShell";
import ScrollReveal from "../components/ScrollReveal";
import { useNavigate } from "react-router-dom";
import { AlertCircle, Briefcase, CalendarDays, Search, Sparkles, User, X } from "lucide-react";
import userApi from "../userApi";
import {
  coachSlotMatchesMemberSlot,
  evaluateCoachAvailability,
  getMemberAvailabilitySlots,
  timeToMinutes,
} from "../utils/availabilityMatching";

const GOAL_ALIASES = {
  "Weight Loss": ["weight loss", "weight management", "cardio", "conditioning", "hiit", "circuit training", "group fitness"],
  "Gain Weight": ["muscle", "bodybuilding", "physique", "hypertrophy", "powerlifting", "olympic weightlifting", "kettlebell training", "calisthenics"],
  "Muscle Gain": ["muscle", "bodybuilding", "physique", "hypertrophy", "powerlifting", "olympic weightlifting", "kettlebell training", "calisthenics"],
  "Maintain Weight": ["general fitness", "wellness", "maintenance", "functional fitness", "conditioning", "group fitness"],
  "General Fitness": ["general fitness", "fitness", "functional fitness", "group fitness", "conditioning", "hiit", "circuit training"],
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const formatGoalSpecialty = (goal) => goal === "Muscle Gain" ? "Gain Weight" : goal;

function formatTime(value) {
  const minutes = timeToMinutes(value);
  if (minutes === null) return "Time not set";
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

function scoreTrainer(t, goal) {
  const text = `${(t.specializations || []).join(" ")} ${t.bio || ""} ${t.goal_specialty || ""}`.toLowerCase();
  return (t.goal_specialty === goal || (goal === "Gain Weight" && t.goal_specialty === "Muscle Gain") ? 100 : 0) +
    (GOAL_ALIASES[goal] || GOAL_ALIASES["General Fitness"]).reduce((n, word) => n + (text.includes(word) ? 15 : 0), 0);
}

function expertiseFor(t) {
  return [...new Set([...(t.specializations || []), formatGoalSpecialty(t.goal_specialty)].filter(Boolean))].slice(0, 5);
}

function Photo({ trainer, compact = false, fit = "contain", className = "" }) {
  return (
    <div className={`relative overflow-hidden ${className || (compact ? "h-40" : "h-64 sm:h-72")} ${fit === "contain" ? "bg-black" : "bg-transparent"}`}>
      {trainer.photo_url ? (
        <img
          src={trainer.photo_url}
          alt={trainer.full_name}
          className={`absolute inset-0 h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
        />
      ) : (
        <div className="relative z-10 w-full h-full flex items-center justify-center">
          <User size={compact ? 58 : 78} className="text-orange-500" />
        </div>
      )}
    </div>
  );
}

function ProfileModal({ trainer, memberAvailability, onClose, onEditAvailability }) {
  const [photoOpen, setPhotoOpen] = useState(false);
  if (!trainer) return null;
  const memberSlots = getMemberAvailabilitySlots(memberAvailability);
  const workoutDuration = Number.parseInt(String(memberAvailability.duration ?? 60), 10);
  const assignedMembers = Number(trainer.assigned_member_count) || 0;
  const maxMembers = Number(trainer.max_members) || 0;
  const memberCapacityFull = maxMembers > 0 && assignedMembers >= maxMembers;
  const capacityPercent = maxMembers > 0
    ? Math.min((assignedMembers / maxMembers) * 100, 100)
    : 0;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="selection-coach-profile-title"
            className="relative grid h-[92vh] max-h-[48rem] w-full max-w-5xl grid-rows-[minmax(200px,28vh)_minmax(0,1fr)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-1"
            onClick={(e) => e.stopPropagation()}
      >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-orange-600 text-white shadow-lg hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
              aria-label="Close coach profile"
            >
              <X size={18} />
            </button>
            <div className="relative flex min-h-0 items-center justify-center overflow-hidden bg-slate-950">
              {trainer.photo_url ? (
                <button type="button" onClick={() => setPhotoOpen(true)} className="flex h-full w-full items-center justify-center p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400" aria-label="View full profile photo">
                  <img src={trainer.photo_url} alt={trainer.full_name} className="h-full w-full object-contain" />
                </button>
              ) : (
                <User size={84} className="text-orange-500" aria-hidden="true" />
              )}
            </div>
            <div className="flex min-h-0 flex-col">
              <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5 sm:p-7 lg:p-8">
                <header className="border-b border-slate-200 pb-5 pr-12 dark:border-white/10">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Coach profile</p>
                  <h2 id="selection-coach-profile-title" className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">{trainer.full_name}</h2>
                  <p className="mt-1 text-sm font-semibold text-orange-600 dark:text-orange-400">{formatGoalSpecialty(trainer.goal_specialty) || "General Fitness Coach"}</p>
                </header>
                <section>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">About the coach</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600 dark:text-slate-300">
                    {trainer.bio || "No profile description has been added yet."}
                  </p>
                </section>
                <section>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Expertise</h3>
                  <div className="flex flex-wrap gap-2">
                    {expertiseFor(trainer).length ? expertiseFor(trainer).map((item) => (
                      <span key={item} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300">{item}</span>
                    )) : <p className="text-sm text-slate-500 dark:text-slate-400">No specializations listed.</p>}
                  </div>
                </section>
                <section aria-label="Coach member capacity" className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Total member capacity</h3>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {maxMembers > 0 ? `${assignedMembers} / ${maxMembers} members` : `${assignedMembers} members · Capacity not set`}
                    </span>
                  </div>
                  {maxMembers > 0 && (
                    <>
                      <div
                        role="progressbar"
                        aria-label="Coach member capacity used"
                        aria-valuemin={0}
                        aria-valuemax={maxMembers}
                        aria-valuenow={Math.min(assignedMembers, maxMembers)}
                        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
                      >
                        <div
                          className={`h-full rounded-full transition-all ${assignedMembers >= maxMembers ? "bg-red-500" : "bg-orange-500"}`}
                          style={{ width: `${capacityPercent}%` }}
                        />
                      </div>
                      <p className={`mt-2 text-xs font-semibold ${assignedMembers >= maxMembers ? "text-red-600 dark:text-red-300" : "text-slate-500 dark:text-slate-400"}`}>
                        {assignedMembers >= maxMembers ? "Capacity full" : `${maxMembers - assignedMembers} member spots available`}
                      </p>
                    </>
                  )}
                </section>
                <section>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Weekly availability</h3>
                    <button
                      type="button"
                      onClick={() => onEditAvailability(trainer)}
                      className="inline-flex items-center gap-2 rounded-lg border border-orange-500 px-3 py-2 text-xs font-bold text-orange-700 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:text-orange-300 dark:hover:bg-orange-500/10"
                    >
                      <CalendarDays size={15} aria-hidden="true" />
                      Edit my weekly workout availability
                    </button>
                  </div>
                  <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                    A green border means your schedule matches and this time still has member capacity.
                  </p>
                  {trainer.availability?.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {trainer.availability.map((slot, index) => {
                        const slotMembers = Number(slot.assigned_member_count) || 0;
                        const slotLimit = Number(slot.member_limit) || 0;
                        const slotPercent = slotLimit > 0
                          ? Math.min((slotMembers / slotLimit) * 100, 100)
                          : 0;
                        const slotFull = slotLimit > 0 && slotMembers >= slotLimit;
                        const slotMatchesSchedule = Number.isInteger(workoutDuration) && workoutDuration > 0 &&
                          memberSlots.some((memberSlot) => coachSlotMatchesMemberSlot(slot, memberSlot, workoutDuration));
                        const slotMatchesAndHasCapacity = slotMatchesSchedule &&
                          slotLimit > slotMembers &&
                          !memberCapacityFull;
                        const slotMatchesButIsFull = slotMatchesSchedule && (memberCapacityFull || slotFull);
                        return (
                        <div
                          key={`${slot.day_of_week}-${slot.start_time}-${index}`}
                          className={`rounded-xl px-3 py-3 ${
                            slotMatchesAndHasCapacity
                              ? "border-2 border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-500/20 dark:border-emerald-400 dark:bg-emerald-500/10"
                              : slotMatchesButIsFull
                                ? "border-2 border-red-400 bg-red-50/50 dark:border-red-400 dark:bg-red-500/10"
                                : "border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]"
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-slate-700 dark:text-slate-200">{DAY_NAMES[Number(slot.day_of_week)] || "Day"}</span>
                            <span className="text-sm text-slate-500 dark:text-slate-400">{formatTime(slot.start_time)}–{formatTime(slot.end_time)}</span>
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                            <span className="text-slate-500 dark:text-slate-400">Members for this time</span>
                            <span className={`font-semibold ${slotFull ? "text-red-600 dark:text-red-300" : "text-slate-700 dark:text-slate-200"}`}>
                              {slotLimit > 0 ? `${slotMembers} / ${slotLimit}` : `${slotMembers} / —`}
                            </span>
                          </div>
                          {slotLimit > 0 && (
                            <>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                                <div
                                  className={`h-full rounded-full ${slotFull ? "bg-red-500" : "bg-orange-500"}`}
                                  style={{ width: `${slotPercent}%` }}
                                />
                              </div>
                              <p className={`mt-1 text-[11px] ${slotFull ? "font-semibold text-red-600 dark:text-red-300" : "text-slate-500 dark:text-slate-400"}`}>
                                {slotFull ? "Member limit reached" : `${slotLimit - slotMembers} spots available`}
                              </p>
                            </>
                          )}
                          {slotMatchesAndHasCapacity && (
                            <p className="mt-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                              Matches your schedule and has capacity
                            </p>
                          )}
                          {slotMatchesButIsFull && (
                            <p className="mt-2 text-xs font-bold text-red-600 dark:text-red-300">
                              {memberCapacityFull ? "Coach’s total member capacity is full" : "This time has reached its member limit"}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  ) : <p className="text-sm text-slate-500 dark:text-slate-400">Availability has not been posted yet.</p>}
                </section>
              </div>
            </div>
          </div>
      {photoOpen && trainer.photo_url && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 sm:p-8"
          onClick={() => setPhotoOpen(false)}
        >
          <button
            type="button"
            onClick={() => setPhotoOpen(false)}
            className="absolute top-4 right-4 z-[110] w-12 h-12 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/20"
            aria-label="Close full profile photo"
          >
            <X size={24} />
          </button>
          <img
            src={trainer.photo_url}
            alt={trainer.full_name}
            className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>,
    document.body
  );
}

function getCoachLockReason(trainer) {
  if (trainer.member_capacity_full) return "This coach has reached their total member capacity.";
  if (!trainer.schedule_compatible) return "This coach’s schedule does not match your selected workout days and times.";
  if (trainer.day_capacity_full) {
    return trainer.full_days.length
      ? `This coach has reached the member limit on ${trainer.full_days.join(", ")}.`
      : "This coach has reached the member limit for your selected days.";
  }
  return "";
}

function CoachCard({ trainer, recommended, goalMatch, selected, onProfile, onSelect }) {
  const lockReason = getCoachLockReason(trainer);
  const expertise = expertiseFor(trainer);

  return (
    <div className={`coach-card-interactive flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition dark:bg-[#171717] dark:border-slate-800 ${trainer.can_select ? "hover:border-orange-500/60" : "opacity-80"}`}>
      <Photo trainer={trainer} compact />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap gap-2 mb-2">
          {recommended && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500 text-white px-2.5 py-1 text-[11px] font-bold">
              <Sparkles size={11} /> Recommended
            </span>
          )}
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">{trainer.full_name}</h3>
        <p className="text-orange-500 text-sm font-semibold mt-0.5">{formatGoalSpecialty(trainer.goal_specialty) || "General Fitness Coach"}</p>
        {!goalMatch && (
          <p className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            This coach’s specialty may not match your selected goal.
          </p>
        )}
        {lockReason && (
          <p className="mt-2 rounded-lg border border-red-300/50 bg-red-50 px-2.5 py-2 text-xs text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
            {lockReason}
          </p>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 min-h-[32px]">
          {trainer.bio || "This coach has not added a profile description yet."}
        </p>
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Expertise</p>
          {expertise.length ? (
            <div className="flex flex-wrap gap-1.5">
              {expertise.map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300"
                >
                  {item}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">No specializations listed.</p>
          )}
        </div>
        <div className="mt-auto flex gap-2 pt-4">
          <button
            type="button"
            onClick={() => onProfile(trainer)}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:border-orange-500 hover:text-orange-500 transition"
          >
            View Profile
          </button>
          <button
            type="button"
            disabled={!trainer.can_select}
            onClick={() => onSelect(trainer)}
            aria-pressed={selected}
            title={lockReason || undefined}
            className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:border-white/10 dark:disabled:bg-white/[0.04] dark:disabled:text-slate-400 ${selected ? "bg-orange-600 text-white" : "border border-orange-500 text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-500/10"}`}
          >
            {selected ? "Selected" : trainer.can_select ? "Choose Coach" : "Unavailable"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CoachSelect() {
  const navigate = useNavigate();
  const [trainers, setTrainers] = useState([]);
  const [goal, setGoal] = useState("General Fitness");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [availability, setAvailability] = useState({});
  const [search, setSearch] = useState("");
  const [selectedTrainerId, setSelectedTrainerId] = useState("");

  useEffect(() => {
    const readSessionValue = (key, fallback) => {
      try {
        return JSON.parse(sessionStorage.getItem(key) || JSON.stringify(fallback));
      } catch {
        return fallback;
      }
    };
    const goalData = readSessionValue("avefit_goal", {});
    const availabilityData = readSessionValue("avefit_availability", {});
    const selectedTrainer = readSessionValue("avefit_trainer", {});
    setGoal(goalData.goal || "General Fitness");
    setAvailability(availabilityData);
    setSelectedTrainerId(String(selectedTrainer.trainer_id || ""));

    userApi.get("/trainers")
      .then((res) => {
      const nextTrainers = (res.data?.data || []).map((trainer) => ({
        ...trainer,
        ...evaluateCoachAvailability(trainer, availabilityData),
      }));
        setTrainers(nextTrainers);
        const previouslySelected = nextTrainers.find((trainer) => String(trainer.trainer_id) === String(selectedTrainer.trainer_id || ""));
        if (selectedTrainer.trainer_id && !previouslySelected?.can_select) {
          setSelectedTrainerId("");
          sessionStorage.removeItem("avefit_trainer");
        }
      })
      .catch(() => setError("Couldn't load coach profiles right now."))
      .finally(() => setLoading(false));
  }, []);

  const ranked = useMemo(
    () => trainers.slice().sort((a, b) =>
      Number(b.can_select) - Number(a.can_select) ||
      Number(b.schedule_compatible) - Number(a.schedule_compatible) ||
      scoreTrainer(b, goal) - scoreTrainer(a, goal)
    ),
    [trainers, goal]
  );

  const searchTerm = search.trim().toLowerCase();
  const visibleCoaches = ranked.filter((trainer) => !searchTerm || [
    trainer.full_name,
    trainer.goal_specialty,
    trainer.bio,
    ...(trainer.specializations || []),
  ].filter(Boolean).join(" ").toLowerCase().includes(searchTerm));
  const recommended = visibleCoaches[0];
  const otherCoaches = visibleCoaches.slice(1);
  const selectedDays = Array.isArray(availability.days) ? availability.days : [];
  const selectedTrainer = trainers.find((trainer) => String(trainer.trainer_id) === selectedTrainerId);
  const allCoachesLocked = trainers.length > 0 && trainers.every((trainer) => !trainer.can_select);
  const allSchedulesMismatch = allCoachesLocked && trainers.every((trainer) => !trainer.schedule_compatible);
  const allCoachesAtCapacity = allCoachesLocked && trainers.every((trainer) => (
    trainer.member_capacity_full || trainer.day_capacity_full
  ));

  const handleSelectCoach = (trainer) => {
    if (!trainer.can_select) return;
    setSelectedTrainerId(String(trainer.trainer_id));
    sessionStorage.setItem("avefit_trainer", JSON.stringify({
      trainer_id: trainer.trainer_id,
      full_name: trainer.full_name,
      schedule_compatible: trainer.schedule_compatible,
    }));
  };

  const handleContinue = () => {
    if (!selectedTrainer?.can_select) return;
    navigate("/user/confirm");
  };
  const handleEditAvailability = (trainer) => {
    setProfile(null);
    navigate("/user/availability", {
      state: {
        comparisonCoach: {
          trainer_id: trainer.trainer_id,
          full_name: trainer.full_name,
          availability: trainer.availability,
          assigned_member_count: trainer.assigned_member_count,
          max_members: trainer.max_members,
        },
      },
    });
  };
  const canContinue = !loading && Boolean(selectedTrainer?.can_select);

  return (
    <>
      <OnboardingShell step={5} width="max-w-2xl">
        <button onClick={() => navigate("/user/availability")} className="text-slate-500 hover:text-orange-500 text-sm mb-5">
          ← Back
        </button>

        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Your training team</p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Meet Your Coaches</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Coaches can only be selected when their schedule and member limits fit your workout plan.
          </p>
          <p className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm leading-6 text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-200">
            Click "View Full Profile" to compare a coach's available times with your weekly workout schedule. From the profile, you can also edit your own weekly availability.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300">
              Goal · {goal}
            </span>
            {availability.preferredWorkoutTime && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                {availability.preferredWorkoutTime}
              </span>
            )}
            {selectedDays.length > 0 && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
                {selectedDays.join(" · ")}
              </span>
            )}
          </div>
          <label className="mt-5 flex min-h-11 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 dark:border-white/10 dark:bg-white/[0.03]">
            <Search size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search coaches by name or specialty..."
              aria-label="Search coaches by name or specialty"
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
            />
          </label>
        </div>

        {allSchedulesMismatch && (
          <div role="alert" className="mb-6 flex items-start gap-4 rounded-2xl border-2 border-orange-500 bg-orange-50 p-4 shadow-lg shadow-orange-500/10 dark:border-orange-400 dark:bg-orange-950/60 sm:p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white">
              <CalendarDays size={22} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wider text-orange-700 dark:text-orange-300">Action needed</p>
              <h3 className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">No coach matches your weekly workout availability.</h3>
              <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">
                Pick or edit your weekly workout availability to find a coach with a matching schedule.
              </p>
              <button
                type="button"
                onClick={() => navigate("/user/availability")}
                className="mt-3 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-orange-950"
              >
                Pick or edit weekly availability
              </button>
            </div>
          </div>
        )}

        {allCoachesAtCapacity && (
          <div role="alert" className="mb-6 flex items-start gap-4 rounded-2xl border-2 border-red-500 bg-red-50 p-4 shadow-lg shadow-red-500/10 dark:border-red-400 dark:bg-red-950/60 sm:p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
              <AlertCircle size={23} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-red-700 dark:text-red-300">No coaches available</p>
              <h3 className="mt-1 text-lg font-extrabold text-slate-900 dark:text-white">All coaches are at capacity for your selected workout days or their total member limit.</h3>
              <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-200">
                Please go to the gym administrator’s office for assistance.
              </p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <div className="h-[430px] bg-slate-100 dark:bg-slate-900 rounded-2xl animate-pulse" />
            <div className="h-7 w-40 bg-slate-100 dark:bg-slate-900 rounded animate-pulse" />
          </div>
        ) : trainers.length === 0 ? (
          <div className="text-center py-16 text-slate-500 text-sm">
            No active coach profiles are available.
          </div>
        ) : !recommended ? (
          <div className="text-center py-10 text-slate-500 text-sm">
            {searchTerm ? (
              <>
                <p className="font-semibold text-slate-700 dark:text-slate-200">No coaches found for “{search}”.</p>
                <button type="button" onClick={() => setSearch("")} className="mt-4 rounded-xl border border-orange-500 px-4 py-2 font-semibold text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-500/10">
                  Clear search
                </button>
              </>
            ) : (
              <>
                <p className="font-semibold text-slate-700 dark:text-slate-200">No coaches found.</p>
              </>
            )}
          </div>
        ) : (
          <>
            <section className="scroll-mt-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-orange-500 font-bold">
                    {recommended.can_select ? "Your best match" : "Availability check"}
                  </p>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                    {recommended.can_select ? "Recommended Coach" : "Closest Match"}
                  </h3>
                </div>
                <Sparkles className="text-orange-500" size={22} />
              </div>

              <ScrollReveal>
                <div className="coach-card-interactive overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-[#171717] md:grid md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                  <div className="relative">
                    <Photo trainer={recommended} className="h-64 sm:h-72 md:h-full md:min-h-[390px]" />
                    <div className="absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-orange-500 text-white px-3 py-1.5 text-xs font-bold shadow-lg">
                      <Sparkles size={13} /> {recommended.can_select ? "Recommended for You" : "Closest Match"}
                    </div>
                  </div>

                  <div className="flex flex-col justify-center p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{recommended.full_name}</h3>
                      <p className="text-orange-500 font-semibold mt-1">{formatGoalSpecialty(recommended.goal_specialty) || "General Fitness Coach"}</p>
                      {scoreTrainer(recommended, goal) === 0 && (
                        <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                          This coach’s specialty may not match your selected goal.
                        </p>
                      )}
                      {getCoachLockReason(recommended) && (
                        <p className="mt-2 rounded-lg border border-red-300/50 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                          {getCoachLockReason(recommended)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-4">
                    <Briefcase size={14} className="text-orange-500" />
                    Best match for your <b className="text-slate-700 dark:text-slate-200">{goal}</b> goal
                  </div>

                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-4 leading-6 line-clamp-3">
                    {recommended.bio || "This coach has not added a profile description yet."}
                  </p>

                  {expertiseFor(recommended).length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-4">
                      {expertiseFor(recommended).map((item) => (
                        <span key={item} className="px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 text-[11px] font-semibold">
                          {item}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                    <button
                      type="button"
                      onClick={() => setProfile(recommended)}
                      className="w-full py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:border-orange-500 hover:text-orange-500 transition"
                    >
                      View Full Profile
                    </button>
                    <button
                      type="button"
                      disabled={!recommended.can_select}
                      onClick={() => handleSelectCoach(recommended)}
                      aria-pressed={selectedTrainerId === String(recommended.trainer_id)}
                      title={getCoachLockReason(recommended) || undefined}
                      className={`w-full rounded-xl py-3 font-bold transition disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:border-white/10 dark:disabled:bg-white/[0.04] dark:disabled:text-slate-400 ${selectedTrainerId === String(recommended.trainer_id) ? "bg-orange-600 text-white" : "border border-orange-500 text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-500/10"}`}
                    >
                      {selectedTrainerId === String(recommended.trainer_id) ? "Selected Coach" : recommended.can_select ? "Choose This Coach" : "Unavailable"}
                    </button>
                  </div>
                  </div>
                </div>
                </ScrollReveal>
            </section>

            {otherCoaches.length > 0 && (
              <section className="mt-8 scroll-mt-6">
                <div className="mb-4">
                  <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Your options</p>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">Other Available Coaches</h3>
                </div>

                <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 sm:grid sm:grid-cols-2 sm:[grid-auto-rows:1fr] sm:overflow-visible">
                  {otherCoaches.map((trainer, index) => (
                    <ScrollReveal key={trainer.trainer_id} delay={Math.min(index + 1, 4) * 100} className="h-full w-[min(85vw,22rem)] shrink-0 snap-start sm:w-auto sm:shrink">
                      <CoachCard
                        trainer={trainer}
                        recommended={false}
                        goalMatch={scoreTrainer(trainer, goal) > 0}
                        selected={selectedTrainerId === String(trainer.trainer_id)}
                        onProfile={setProfile}
                        onSelect={handleSelectCoach}
                      />
                    </ScrollReveal>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {error && <p className="text-red-500 text-xs mt-4">{error}</p>}
        <button
          type="button"
          disabled={!canContinue}
          onClick={handleContinue}
          className={`w-full font-bold py-3.5 rounded-xl transition mt-7 ${canContinue ? "bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/10" : "cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-400"}`}
        >
          Continue to Confirmation →
        </button>
        <p className="text-center text-xs text-slate-400 mt-3">
          {selectedTrainer ? `Preferred coach: ${selectedTrainer.full_name}.` : "Choose an available coach to continue to confirmation."}
        </p>
      </OnboardingShell>

      {profile && (
        <ProfileModal
          trainer={profile}
          memberAvailability={availability}
          onClose={() => setProfile(null)}
          onEditAvailability={handleEditAvailability}
        />
      )}
    </>
  );
}
