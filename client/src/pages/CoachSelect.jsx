import { useEffect, useMemo, useState } from "react";
import OnboardingShell from "../components/layout/OnboardingShell";
import { useNavigate } from "react-router-dom";
import { Briefcase, Check, Sparkles, User, X } from "lucide-react";
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

function timeToMinutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isAvailableForMember(trainer, preferences) {
  const window = PREFERRED_TIME_WINDOWS[preferences.preferredWorkoutTime];
  if (!window || !preferences.days?.length || !Array.isArray(trainer.availability)) return false;

  return preferences.days.every((day) => {
    const dayOfWeek = DAY_INDEX[day];
    return trainer.availability.some((slot) => {
      const start = timeToMinutes(slot.start_time);
      const end = timeToMinutes(slot.end_time);
      return Number(slot.day_of_week) === dayOfWeek &&
        start !== null &&
        end !== null &&
        start < window[1] &&
        window[0] < end;
    });
  });
}

function scoreTrainer(t, goal) {
  const text = `${(t.specializations || []).join(" ")} ${t.bio || ""} ${t.goal_specialty || ""}`.toLowerCase();
  return (t.goal_specialty === goal ? 100 : 0) +
    (GOAL_ALIASES[goal] || GOAL_ALIASES["General Fitness"]).reduce((n, word) => n + (text.includes(word) ? 15 : 0), 0);
}

function expertiseFor(t) {
  return [...new Set([...(t.specializations || []), t.goal_specialty].filter(Boolean))].slice(0, 5);
}

function Photo({ trainer, compact = false, fit = "cover" }) {
  return (
    <div className={`relative overflow-hidden ${compact ? "h-40" : "h-64 sm:h-72"} ${fit === "contain" ? "bg-black" : "bg-transparent"}`}>
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

function ProfileModal({ trainer, onClose, onSelect, selected }) {
  const [photoOpen, setPhotoOpen] = useState(false);
  if (!trainer) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-[#111] rounded-3xl max-w-2xl w-full max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex justify-center bg-transparent">
          {trainer.photo_url ? (
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              className="relative inline-flex max-h-[55vh] max-w-full items-center justify-center overflow-hidden cursor-zoom-in"
              aria-label="View full profile photo"
            >
              <img src={trainer.photo_url} alt={trainer.full_name} className="block max-h-[55vh] max-w-full object-contain" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-48 bg-gradient-to-t from-black via-black/85 to-transparent" />
              <div className="pointer-events-none absolute bottom-4 left-5 right-5 z-30 text-left text-white drop-shadow-md sm:bottom-5 sm:left-6 sm:right-6">
                <p className="text-xs font-bold uppercase tracking-wider text-orange-300">Coach Profile</p>
                <h2 className="mt-1 text-2xl font-bold">{trainer.full_name}</h2>
                <p className="mt-1 text-sm font-semibold text-orange-300">{trainer.goal_specialty || "General Fitness Coach"}</p>
              </div>
            </button>
          ) : (
            <div className="relative flex h-64 w-full items-center justify-center bg-slate-950">
              <Photo trainer={trainer} fit="contain" />
              <div className="absolute bottom-4 left-5 right-16 z-20 text-white sm:bottom-5 sm:left-6">
                <p className="text-xs font-bold uppercase tracking-wider text-orange-300">Coach Profile</p>
                <h2 className="mt-1 text-2xl font-bold">{trainer.full_name}</h2>
                <p className="mt-1 text-sm font-semibold text-orange-300">{trainer.goal_specialty || "General Fitness Coach"}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/70 text-white shadow-lg hover:bg-black"
            aria-label="Close profile"
          >
            <X size={18} className="text-white" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm leading-7 text-slate-600 dark:text-slate-300 mt-5 whitespace-pre-line">
            {trainer.bio || "No profile description has been added yet."}
          </p>
          <div className="flex flex-wrap gap-2 mt-5">
            {expertiseFor(trainer).map((item) => (
              <span key={item} className="px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 text-xs font-semibold">
                {item}
              </span>
            ))}
          </div>
          <button
            onClick={() => { onSelect(trainer); onClose(); }}
            className={`w-full mt-6 py-3 rounded-xl font-bold transition ${selected ? "bg-green-500 text-white" : "bg-orange-500 hover:bg-orange-600 text-white"}`}
          >
            {selected ? "Coach Selected ✓" : "Select This Coach"}
          </button>
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

function CoachCard({ trainer, selected, recommended, onSelect, onProfile }) {
  return (
    <div className={`overflow-hidden rounded-2xl border bg-slate-50 dark:bg-[#171717] transition ${selected ? "border-green-500 ring-1 ring-green-500/30" : "border-slate-200 dark:border-slate-800 hover:border-orange-500/70"}`}>
      <Photo trainer={trainer} compact />
      <div className="p-4">
        <div className="flex flex-wrap gap-2 mb-2">
          {recommended && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-500 text-white px-2.5 py-1 text-[11px] font-bold">
              <Sparkles size={11} /> Recommended
            </span>
          )}
          {selected && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500 text-white px-2.5 py-1 text-[11px] font-bold">
              <Check size={11} /> Selected
            </span>
          )}
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white truncate">{trainer.full_name}</h3>
        <p className="text-orange-500 text-sm font-semibold mt-0.5">{trainer.goal_specialty || "General Fitness Coach"}</p>
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
          <button
            onClick={() => onSelect(trainer)}
            className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition ${selected ? "bg-green-500 text-white" : "bg-orange-500 hover:bg-orange-600 text-white"}`}
          >
            {selected ? "Selected ✓" : "Choose"}
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
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState(null);
  const [availability, setAvailability] = useState({});

  useEffect(() => {
    const goalData = JSON.parse(sessionStorage.getItem("avefit_goal") || "{}");
    const availabilityData = JSON.parse(sessionStorage.getItem("avefit_availability") || "{}");
    const savedCoach = JSON.parse(sessionStorage.getItem("avefit_trainer") || "null");
    setGoal(goalData.goal || "General Fitness");
    setAvailability(availabilityData);
    if (savedCoach?.trainer_id) setSelectedId(savedCoach.trainer_id);

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

  const recommended = ranked[0];
  const otherCoaches = ranked.slice(1);

  const chooseCoach = (trainer) => {
    setSelectedId(trainer.trainer_id);
    sessionStorage.setItem("avefit_trainer", JSON.stringify(trainer));
    setError("");
  };

  const handleContinue = () => {
    if (!ranked.some((trainer) => trainer.trainer_id === selectedId)) {
      setError("Please select a coach who matches your workout days and preferred time.");
      return;
    }
    navigate("/user/confirm");
  };

  return (
    <>
      <OnboardingShell step={5} width="max-w-2xl">
        <button onClick={() => navigate("/user/availability")} className="text-slate-500 hover:text-orange-500 text-sm mb-5">
          ← Back
        </button>

        <div className="mb-6">
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Choose Your Coach</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 leading-6">
            Coaches shown match your selected workout days and preferred time, as well as your <b className="text-slate-700 dark:text-slate-200">{goal}</b> goal.
          </p>
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
            <p className="font-semibold text-slate-700 dark:text-slate-200">No coaches match your availability.</p>
            <p className="mt-2">Choose a coach available on every selected workout day during your preferred time.</p>
            <button
              type="button"
              onClick={() => navigate("/user/availability")}
              className="mt-4 rounded-xl border border-orange-500 px-4 py-2 font-semibold text-orange-600 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-500/10"
            >
              Update availability
            </button>
          </div>
        ) : (
          <>
            <section>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-xs uppercase tracking-wider text-orange-500 font-bold">Your best match</p>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">Recommended Coach</h3>
                </div>
                <Sparkles className="text-orange-500" size={22} />
              </div>

              <div className={`overflow-hidden rounded-2xl border-2 bg-slate-50 dark:bg-[#171717] shadow-lg ${selectedId === recommended.trainer_id ? "border-green-500" : "border-orange-500"}`}>
                <div className="relative">
                  <Photo trainer={recommended} />
                  <div className="absolute top-4 left-4 z-20 inline-flex items-center gap-1.5 rounded-full bg-orange-500 text-white px-3 py-1.5 text-xs font-bold shadow-lg">
                    <Sparkles size={13} /> Recommended for You
                  </div>
                </div>

                <div className="p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{recommended.full_name}</h3>
                      <p className="text-orange-500 font-semibold mt-1">{recommended.goal_specialty || "General Fitness Coach"}</p>
                    </div>
                    {selectedId === recommended.trainer_id && (
                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-green-500 text-white px-3 py-1.5 text-xs font-bold">
                        <Check size={13} /> Selected
                      </span>
                    )}
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
                      className="py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:border-orange-500 hover:text-orange-500 transition"
                    >
                      View Full Profile
                    </button>
                    <button
                      onClick={() => chooseCoach(recommended)}
                      className={`py-3 rounded-xl font-bold transition ${selectedId === recommended.trainer_id ? "bg-green-500 text-white" : "bg-orange-500 hover:bg-orange-600 text-white"}`}
                    >
                      {selectedId === recommended.trainer_id ? "Coach Selected ✓" : "Choose This Coach"}
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {otherCoaches.length > 0 && (
              <section className="mt-8">
                <div className="mb-4">
                  <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">Your options</p>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">Other Available Coaches</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {otherCoaches.map((trainer) => (
                    <CoachCard
                      key={trainer.trainer_id}
                      trainer={trainer}
                      selected={selectedId === trainer.trainer_id}
                      recommended={false}
                      onSelect={chooseCoach}
                      onProfile={setProfile}
                    />
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
          You can review your selected coach before completing setup.
        </p>
      </OnboardingShell>

      {profile && (
        <ProfileModal
          trainer={profile}
          onClose={() => setProfile(null)}
          onSelect={chooseCoach}
          selected={selectedId === profile.trainer_id}
        />
      )}
    </>
  );
}
