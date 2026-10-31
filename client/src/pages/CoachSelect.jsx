import { useEffect, useMemo, useState } from "react";
import OnboardingShell from "../components/layout/OnboardingShell";
import ScrollReveal from "../components/ScrollReveal";
import { useNavigate } from "react-router-dom";
import { Briefcase, Search, Sparkles, User, X } from "lucide-react";
import userApi from "../userApi";

const GOAL_ALIASES = {
  "Weight Loss": ["weight loss", "weight management", "cardio", "conditioning", "hiit", "circuit training", "group fitness"],
  "Muscle Gain": ["muscle", "bodybuilding", "physique", "hypertrophy", "powerlifting", "olympic weightlifting", "kettlebell training", "calisthenics"],
  "Maintain Weight": ["general fitness", "wellness", "maintenance", "functional fitness", "conditioning", "group fitness"],
  "General Fitness": ["general fitness", "fitness", "functional fitness", "group fitness", "conditioning", "hiit", "circuit training"],
};

const DAY_INDEX = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

const PREFERRED_TIME_WINDOWS = {
  Morning: [6 * 60, 12 * 60],
  Afternoon: [12 * 60, 17 * 60],
  Evening: [17 * 60, 22 * 60],
  Flexible: [6 * 60, 22 * 60],
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function timeToMinutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isAvailableForMember(trainer, preferences) {
  if (!Array.isArray(trainer.availability)) return false;
  const duration = Number.parseInt(String(preferences.duration ?? ""), 10);
  const requiredDays = Number(preferences.daysPerWeek);

  const memberSlots = Array.isArray(preferences.availability) && preferences.availability.length
    ? preferences.availability.map((slot) => {
      const day = DAY_INDEX[slot.day_of_week];
      const window = PREFERRED_TIME_WINDOWS[slot.time_preference];
      return day === undefined || !window
        ? null
        : { day, start: window[0], end: window[1] };
    }).filter(Boolean)
    : (preferences.days || []).map((day) => {
      const dayOfWeek = DAY_INDEX[day];
      const window = PREFERRED_TIME_WINDOWS[preferences.preferredWorkoutTime];
      return dayOfWeek === undefined || !window
        ? null
        : { day: dayOfWeek, start: window[0], end: window[1] };
    }).filter(Boolean);

  if (!memberSlots.length || !Number.isInteger(duration) || duration < 1) return false;
  const workoutDays = Number.isInteger(requiredDays) && requiredDays > 0
    ? Math.min(requiredDays, memberSlots.length)
    : memberSlots.length;
  const compatibleDays = memberSlots.filter((memberSlot) => trainer.availability.some((slot) => {
    const start = timeToMinutes(slot.start_time);
    const end = timeToMinutes(slot.end_time);
    const overlapStart = start === null ? null : Math.max(memberSlot.start, start);
    const overlapEnd = end === null ? null : Math.min(memberSlot.end, end);
    return Number(slot.day_of_week) === memberSlot.day &&
      overlapStart !== null &&
      overlapEnd !== null &&
      overlapEnd - overlapStart >= duration;
  })).length;

  return compatibleDays >= workoutDays;
}

function scoreTrainer(t, goal) {
  const text = `${(t.specializations || []).join(" ")} ${t.bio || ""} ${t.goal_specialty || ""}`.toLowerCase();
  return (t.goal_specialty === goal ? 100 : 0) +
    (GOAL_ALIASES[goal] || GOAL_ALIASES["General Fitness"]).reduce((n, word) => n + (text.includes(word) ? 15 : 0), 0);
}

function expertiseFor(t) {
  return [...new Set([...(t.specializations || []), t.goal_specialty].filter(Boolean))].slice(0, 5);
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

function ProfileModal({ trainer, onClose }) {
  const [photoOpen, setPhotoOpen] = useState(false);
  if (!trainer) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="selection-coach-profile-title"
            className="relative grid max-h-[92vh] w-full max-w-5xl grid-rows-[minmax(200px,28vh)_minmax(0,1fr)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-1"
            onClick={(e) => e.stopPropagation()}
      >
            <button
              type="button"
              onClick={onClose}
              className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white shadow-lg hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
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
                  <p className="mt-1 text-sm font-semibold text-orange-600 dark:text-orange-400">{trainer.goal_specialty || "General Fitness Coach"}</p>
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
                <section>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Weekly availability</h3>
                  {trainer.availability?.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {trainer.availability.map((slot, index) => (
                        <div key={`${slot.day_of_week}-${slot.start_time}-${index}`} className="flex justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/[0.03]">
                          <span className="font-medium text-slate-700 dark:text-slate-200">{DAY_NAMES[Number(slot.day_of_week)] || "Day"}</span>
                          <span className="text-slate-500 dark:text-slate-400">{slot.start_time}–{slot.end_time}</span>
                        </div>
                      ))}
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
    </div>
  );
}

function CoachCard({ trainer, recommended, goalMatch, onProfile }) {
  return (
    <div className="coach-card-interactive overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-orange-500/60 dark:bg-[#171717] dark:border-slate-800">
      <Photo trainer={trainer} compact />
      <div className="p-4">
        <div className="flex flex-wrap gap-2 mb-2">
          {recommended && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500 text-white px-2.5 py-1 text-[11px] font-bold">
              <Sparkles size={11} /> Recommended
            </span>
          )}
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">{trainer.full_name}</h3>
        <p className="text-orange-500 text-sm font-semibold mt-0.5">{trainer.goal_specialty || "General Fitness Coach"}</p>
        {!goalMatch && (
          <p className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            This coach’s specialty may not match your selected goal.
          </p>
        )}
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2 min-h-[32px]">
          {trainer.bio || "This coach has not added a profile description yet."}
        </p>
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => onProfile(trainer)}
            className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:border-orange-500 hover:text-orange-500 transition"
          >
            View Profile
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
    setGoal(goalData.goal || "General Fitness");
    setAvailability(availabilityData);
    sessionStorage.removeItem("avefit_trainer");

    userApi.get("/trainers")
      .then((res) => setTrainers(res.data?.data || []))
      .catch(() => setError("Couldn't load coach profiles right now."))
      .finally(() => setLoading(false));
  }, []);

  const ranked = useMemo(
    () => trainers
      .filter((trainer) => isAvailableForMember(trainer, availability))
      .sort((a, b) => scoreTrainer(b, goal) - scoreTrainer(a, goal)),
    [trainers, goal, availability]
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

  const handleContinue = () => {
    navigate("/user/confirm");
  };

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
            Browse coach profiles. The gym administrator will assign your designated coach based on your goals, schedule, and coach availability.
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
                <p className="font-semibold text-slate-700 dark:text-slate-200">No coaches match your availability.</p>
                <p className="mt-2">Choose a coach available on every selected workout day during your preferred time.</p>
                <button
                  type="button"
                  onClick={() => navigate("/user/availability")}
                  className="mt-4 rounded-xl border border-orange-500 px-4 py-2 font-semibold text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-500/10"
                >
                  Update availability
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <section className="scroll-mt-6">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-orange-500 font-bold">Your best match</p>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">Recommended Coach</h3>
                </div>
                <Sparkles className="text-orange-500" size={22} />
              </div>

              <ScrollReveal>
                <div className="coach-card-interactive overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-[#171717] md:grid md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                  <div className="relative">
                    <Photo trainer={recommended} className="h-64 sm:h-72 md:h-full md:min-h-[390px]" />
                    <div className="absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-orange-500 text-white px-3 py-1.5 text-xs font-bold shadow-lg">
                      <Sparkles size={13} /> Recommended for You
                    </div>
                  </div>

                  <div className="flex flex-col justify-center p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{recommended.full_name}</h3>
                      <p className="text-orange-500 font-semibold mt-1">{recommended.goal_specialty || "General Fitness Coach"}</p>
                      {scoreTrainer(recommended, goal) === 0 && (
                        <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                          This coach’s specialty may not match your selected goal.
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
                      onClick={() => setProfile(recommended)}
                      className="w-full py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:border-orange-500 hover:text-orange-500 transition"
                    >
                      View Full Profile
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

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {otherCoaches.map((trainer, index) => (
                    <ScrollReveal key={trainer.trainer_id} delay={Math.min(index + 1, 4) * 100}>
                      <CoachCard
                        trainer={trainer}
                        recommended={false}
                        goalMatch={scoreTrainer(trainer, goal) > 0}
                        onProfile={setProfile}
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
          onClick={handleContinue}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl transition mt-7 shadow-lg shadow-orange-500/10"
        >
          Continue to Confirmation →
        </button>
        <p className="text-center text-xs text-slate-400 mt-3">
          Your coach will be assigned by the gym administrator after setup.
        </p>
      </OnboardingShell>

      {profile && (
        <ProfileModal
          trainer={profile}
          onClose={() => setProfile(null)}
        />
      )}
    </>
  );
}
