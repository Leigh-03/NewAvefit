import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Briefcase, ChevronLeft, ChevronRight, Sparkles, User, X } from "lucide-react";
import ScrollReveal from "../components/ScrollReveal";
import userApi from "../userApi";

const aliases = {
  "Weight Loss": ["weight loss", "weight management", "hiit", "circuit training", "group fitness", "conditioning"],
  "Muscle Gain": ["muscle", "bodybuilding", "physique", "powerlifting", "olympic weightlifting", "kettlebell training", "calisthenics"],
  "Maintain Weight": ["wellness", "maintenance", "functional fitness", "group fitness", "conditioning"],
  "General Fitness": ["general fitness", "fitness", "functional fitness", "group fitness", "hiit", "circuit training", "conditioning"],
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function score(t, goal) {
  const text = `${(t.specializations || []).join(" ")} ${t.bio || ""} ${t.goal_specialty || ""}`.toLowerCase();
  return (t.goal_specialty === goal ? 100 : 0) +
    (aliases[goal] || aliases["General Fitness"]).reduce((n, w) => n + (text.includes(w) ? 15 : 0), 0);
}

function expertise(t) {
  return [...new Set([...(t.specializations || []), t.goal_specialty].filter(Boolean))].slice(0, 8);
}

function TrainerPhoto({ trainer, className = "", fit = "contain" }) {
  return (
    <div className={`relative overflow-hidden ${fit === "contain" ? "bg-slate-950" : "bg-transparent"} ${className}`}>
      {trainer.photo_url ? (
        <img src={trainer.photo_url} alt={trainer.full_name} className={`absolute inset-0 h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`} />
      ) : (
        <div className="w-full h-full flex items-center justify-center"><User size={96} className="text-orange-500" /></div>
      )}
    </div>
  );
}

function TrainerProfileModal({ trainer, goal, assigned, onClose }) {
  const [photoOpen, setPhotoOpen] = useState(false);
  if (!trainer) return null;
  const items = [...new Set([...(trainer.specializations || []), trainer.goal_specialty].filter(Boolean))];

  return (
    <div className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="coach-profile-title"
        className="relative grid max-h-[94vh] w-full max-w-5xl grid-rows-[minmax(210px,30vh)_minmax(0,1fr)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white shadow-lg transition hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          aria-label="Close coach profile"
        >
          <X size={20} />
        </button>

        <div className="relative flex min-h-0 items-center justify-center overflow-hidden bg-slate-950">
          {trainer.photo_url ? (
            <button
              type="button"
              onClick={() => setPhotoOpen(true)}
              className="flex h-full w-full items-center justify-center p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400"
              aria-label="View full profile photo"
            >
              <img src={trainer.photo_url} alt={trainer.full_name} className="h-full w-full object-contain" />
            </button>
          ) : (
            <User size={96} className="text-orange-500" aria-hidden="true" />
          )}
          {assigned && (
            <span className="absolute bottom-4 left-4 inline-flex items-center gap-1.5 rounded-full bg-green-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg">
              <BadgeCheck size={14} /> Your assigned coach
            </span>
          )}
        </div>

        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-7 lg:p-8">
          <header className="border-b border-slate-200 pb-5 pr-12 dark:border-white/10">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Coach profile</p>
            <h2 id="coach-profile-title" className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">
              {trainer.full_name}
            </h2>
            <p className="mt-1 text-sm font-semibold text-orange-600 dark:text-orange-400">
              {trainer.goal_specialty || "General Fitness Coach"}
            </p>
            {assigned && (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300">
                <BadgeCheck size={14} /> This is your currently assigned coach
              </p>
            )}
          </header>

          <section className="mt-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">About the coach</h3>
            <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600 dark:text-slate-300">
              {trainer.bio || "This coach has not added a profile description yet."}
            </p>
          </section>

          <section className="mt-6">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Specialties &amp; expertise</h3>
            <div className="flex flex-wrap gap-2">
              {items.length
                ? items.map((item) => (
                    <span key={item} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300">
                      {item}
                    </span>
                  ))
                : <span className="text-sm text-slate-400">No specializations listed.</span>}
            </div>
          </section>

          <section className="mt-6">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Weekly availability</h3>
            {trainer.availability?.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {trainer.availability.map((slot, index) => (
                  <div key={`${slot.day_of_week}-${slot.start_time}-${index}`} className="flex justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm dark:border-white/10 dark:bg-white/[0.03]">
                    <span className="font-medium text-slate-700 dark:text-slate-200">{DAY_NAMES[Number(slot.day_of_week)] || "Day"}</span>
                    <span className="text-right text-slate-500 dark:text-slate-400">{slot.start_time}–{slot.end_time}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Availability has not been posted yet.</p>
            )}
          </section>

          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-orange-200 bg-orange-50/70 p-4 dark:border-orange-500/20 dark:bg-orange-500/[0.06]">
            <Briefcase size={18} className="mt-0.5 shrink-0 text-orange-500" />
            <div>
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">Your fitness goal</p>
              <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{goal || "General Fitness"}</p>
            </div>
          </div>

          <p className="mt-5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Coach changes are managed by the gym administrator. Contact the gym if you need to request a change.
          </p>
        </div>
      </div>
      {photoOpen && trainer.photo_url && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
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
            className="max-w-full max-h-full w-auto h-auto object-contain rounded-lg shadow-2xl cursor-zoom-out"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

export default function Coaches() {
  const [coaches, setCoaches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [i, setI] = useState(0);
  const [touch, setTouch] = useState(null);
  const [goal, setGoal] = useState("General Fitness");
  const [assignedTrainerId, setAssignedTrainerId] = useState(null);
  const [profileTrainer, setProfileTrainer] = useState(null);
  const [error, setError] = useState("");

  const swipeStart = (e) => setTouch(e.touches?.[0]?.clientX ?? null);
  const swipeEnd = (e) => {
    if (touch == null || !ranked.length) return;
    const d = (e.changedTouches?.[0]?.clientX ?? touch) - touch;
    if (Math.abs(d) > 55) setI((n) => (n + (d < 0 ? 1 : -1) + ranked.length) % ranked.length);
    setTouch(null);
  };

  useEffect(() => {
    let mounted = true;
    Promise.all([userApi.get("/trainers"), userApi.get("/profile")])
      .then(([trainerRes, profileRes]) => {
        if (!mounted) return;
        const list = trainerRes.data?.data || [];
        const profile = profileRes?.data?.data || profileRes?.data?.user || profileRes?.data;
        setCoaches(list);
        if (profile?.fitness_goal) setGoal(profile.fitness_goal);
        if (profile?.trainer_id) setAssignedTrainerId(profile.trainer_id);
      })
      .catch((err) => {
        console.error("Failed to load coaches:", err);
        if (mounted) setError("Unable to load coach profiles. Please try again.");
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const ranked = useMemo(() => [...coaches].sort((a, b) => score(b, goal) - score(a, goal)), [coaches, goal]);
  const t = ranked[i];

  useEffect(() => { if (i >= ranked.length && ranked.length) setI(0); }, [ranked.length, i]);

  return (
    <div className="min-h-full bg-[#fffaf5] p-5 text-slate-900 dark:bg-[#080808] dark:text-white sm:p-8">
      <header className="ave-page-hero mb-6 overflow-hidden rounded-3xl border border-orange-100 bg-white px-5 py-6 shadow-sm dark:border-white/5 dark:bg-[#111] sm:px-7 sm:py-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600 dark:text-orange-400">Your AveFit team</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">Meet your coaches</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
              Get to know the people who can help you move forward. Browse their profiles and specialties, matched to your fitness goal.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className="coach-goal-badge inline-flex max-w-full shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-xs">
              <Briefcase size={14} className="shrink-0 text-orange-700 dark:text-orange-300" />
              <span className="coach-goal-label">Goal</span>
              <span className="coach-goal-value font-bold">{goal}</span>
            </span>
          </div>
        </div>
      </header>
      {assignedTrainerId && <div className="mb-5 flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 dark:border-green-500/20 dark:bg-green-500/[0.08] dark:text-green-300"><BadgeCheck size={19} className="mt-0.5 shrink-0" /><p>Your designated coach is marked as <b>Assigned Coach</b>. Coach changes are managed by the gym administrator.</p></div>}
      {error && <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>}
      {loading ? (
        <div className="mx-auto max-w-3xl animate-pulse overflow-hidden rounded-3xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111]" aria-label="Loading coach profiles">
          <div className="h-[360px] bg-slate-200 dark:bg-slate-800 sm:h-[440px]" />
          <div className="space-y-4 p-6"><div className="h-6 w-1/3 rounded bg-slate-200 dark:bg-slate-800" /><div className="h-4 w-1/2 rounded bg-slate-100 dark:bg-slate-900" /><div className="h-16 rounded bg-slate-100 dark:bg-slate-900" /></div>
        </div>
      ) : !t ? (
        <div className="mx-auto max-w-2xl rounded-3xl border border-dashed border-orange-200 bg-white px-6 py-14 text-center dark:border-white/10 dark:bg-[#111]">
          <User size={32} className="mx-auto text-orange-500" />
          <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">No active coaches yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500 dark:text-slate-400">Coach profiles will appear here when they are available. Please check back later or contact the gym team for help.</p>
        </div>
      ) : (
        <section aria-label="Browse coach profiles" aria-roledescription="carousel" className="mx-auto max-w-3xl">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Coach spotlight</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Swipe, use the arrows, or choose a dot to browse.</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 dark:bg-white/5 dark:text-slate-300" aria-live="polite">
              {i + 1} / {ranked.length}
            </span>
          </div>
          <div className="relative px-2 sm:px-5">
          <button type="button" onClick={() => setI((i - 1 + ranked.length) % ranked.length)} disabled={ranked.length < 2} aria-label="Show previous coach" className="absolute left-0 top-[38%] z-20 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white text-orange-600 shadow-lg transition hover:scale-105 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-orange-400 dark:hover:bg-[#282828]"><ChevronLeft /></button>
          <button type="button" onClick={() => setI((i + 1) % ranked.length)} disabled={ranked.length < 2} aria-label="Show next coach" className="absolute right-0 top-[38%] z-20 flex h-11 w-11 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white text-orange-600 shadow-lg transition hover:scale-105 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-[#1b1b1b] dark:text-orange-400 dark:hover:bg-[#282828]"><ChevronRight /></button>
          <ScrollReveal key={t.trainer_id}>
          <div onTouchStart={swipeStart} onTouchEnd={swipeEnd} onClick={() => setProfileTrainer(t)} role="group" aria-label={`Coach profile: ${t.full_name}`} className="coach-card-interactive group cursor-pointer overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#111] md:grid md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <div className="relative">
              <TrainerPhoto trainer={t} className="h-[300px] sm:h-[360px] md:h-full md:min-h-[440px]" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/75 to-transparent md:hidden" />
              <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2 sm:left-6 sm:top-6">
                {i === 0 && <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg"><Sparkles size={13} /> Best match</span>}
                {assignedTrainerId === t.trainer_id && <span className="inline-flex items-center gap-1.5 rounded-full bg-green-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg"><BadgeCheck size={14} /> Assigned Coach</span>}
              </div>
              <p className="absolute bottom-4 left-5 right-5 z-10 text-xs font-semibold text-white drop-shadow-md sm:bottom-5 sm:left-7 md:hidden">{t.goal_specialty || "General Fitness Coach"}</p>
            </div>
            <div className="flex flex-col justify-center p-5 sm:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Coach profile</p>
                  <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">{t.full_name}</h2>
                  <p className="mt-1 text-sm font-semibold text-orange-600 dark:text-orange-400">{t.goal_specialty || "General Fitness Coach"}</p>
                </div>
                <span className="hidden shrink-0 rounded-xl bg-orange-50 p-3 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400 sm:grid"><Briefcase size={20} /></span>
              </div>
              <p className="mt-4 line-clamp-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{t.bio || "Learn more about this coach's training approach and areas of expertise by viewing their full profile."}</p>
              <div className="mt-5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Areas of expertise</p>
                <div className="flex flex-wrap gap-2">
                  {expertise(t).length > 0 ? expertise(t).map((x) => <span key={x} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">{x}</span>) : <span className="text-xs text-slate-500">General coaching</span>}
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-5 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">Matched with your <b className="text-slate-700 dark:text-slate-200">{goal}</b> goal</p>
                <button type="button" onClick={(e) => { e.stopPropagation(); setProfileTrainer(t); }} className="min-h-11 w-full rounded-xl bg-orange-500 px-5 text-sm font-bold text-white transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111] sm:w-auto">View coach profile</button>
              </div>
            </div>
          </div>
          </ScrollReveal>
          </div>
          <div className="mt-5 flex items-center justify-center gap-2" role="group" aria-label="Choose a coach profile">{ranked.map((x, n) => <button key={x.trainer_id} type="button" onClick={() => setI(n)} aria-label={`Show ${x.full_name}`} aria-current={n === i ? "true" : undefined} className={`h-2.5 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#080808] ${n === i ? "w-8 bg-orange-500" : "w-2.5 bg-slate-300 hover:bg-orange-300 dark:bg-slate-700 dark:hover:bg-orange-500/60"}`} />)}</div>
          <p className="mt-3 text-center text-xs text-slate-400">Coach {i + 1} of {ranked.length} · Select a profile to learn more</p>
        </section>
      )}
      {profileTrainer && <TrainerProfileModal trainer={profileTrainer} goal={goal} assigned={profileTrainer.trainer_id === assignedTrainerId} onClose={() => setProfileTrainer(null)} />}
    </div>
  );
}
