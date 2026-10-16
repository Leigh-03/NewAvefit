import { Activity, ArrowRight, Clock3, Dumbbell, ExternalLink, MapPin, Phone, Star, Target, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useState } from "react";
import userApi from "../userApi";

const GYM_ADDRESS = "34 A Mabini Tanauan Batangas, Mabini Ave, Tanauan City, Batangas";

const APP_FEATURES = [
  {
    icon: Dumbbell,
    title: "Your training plan",
    description: "See workouts assigned by your coach and mark each session as complete.",
  },
  {
    icon: Activity,
    title: "Progress insights",
    description: "Record body measurements and follow your weight and BMI trends over time.",
  },
  {
    icon: Target,
    title: "Personal goals",
    description: "Keep your fitness goal and profile details together as your routine evolves.",
  },
  {
    icon: UsersRound,
    title: "Coach connection",
    description: "View available coaches and find support for your fitness journey.",
  },
];

const GYM_INFO = [
  { icon: MapPin, label: "Location", value: GYM_ADDRESS },
  { icon: Phone, label: "Contact", value: "+63 (0) 912 345 6789" },
  { icon: Clock3, label: "Hours", value: "Mon–Sat: 5:00 AM – 10:00 PM\nSunday: 7:00 AM – 6:00 PM" },
];

export default function AboutUs() {
  const mapQuery = encodeURIComponent(GYM_ADDRESS);
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [feedback, setFeedback] = useState({ message: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");

  const handleSubmit = async () => {
    if (!feedback.message.trim() || rating === 0 || submitting) return;
    setSubmitting(true);
    setFeedbackError("");
    setSubmitted(false);
    try {
      await userApi.post("/feedback", { rating, message: feedback.message.trim() });
      setSubmitted(true);
      setFeedback({ message: "" });
      setRating(0);
      setHovered(0);
    } catch (error) {
      setFeedbackError(error.response?.data?.message || "Unable to email your feedback right now. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#fffaf5] text-slate-900 dark:bg-[#080808] dark:text-white">
      <header className="ave-page-hero border-b border-orange-100 px-5 pb-8 pt-8 dark:border-white/5 sm:px-8 sm:pb-10">
        <div className="mx-auto max-w-5xl">
          <p className="hero-muted text-sm font-semibold">Avenue Power and Fitness Gym</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
            Your fitness journey, <span className="text-orange-500">supported.</span>
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
            AveFit is your digital companion for following your training plan, staying connected with your goals, and seeing how far you&apos;ve come.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="rounded-full border border-orange-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-orange-700 dark:border-orange-500/30 dark:bg-black/20 dark:text-orange-300">
              Train with purpose
            </span>
            <span className="rounded-full border border-orange-200 bg-white/70 px-3 py-1.5 text-xs font-semibold text-orange-700 dark:border-orange-500/30 dark:bg-black/20 dark:text-orange-300">
              Track your progress
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-5 px-5 py-6 sm:px-8 lg:grid-cols-[1.4fr_1fr]">
        <section className="flex flex-col rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111] sm:p-6">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Made for members</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">Everything you need to stay on track</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {APP_FEATURES.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
              </article>
            ))}
          </div>

          <div className="mt-5 flex-1 rounded-2xl border border-orange-200 bg-orange-50/70 p-4 dark:border-orange-500/20 dark:bg-orange-500/[0.06] sm:p-5">
            <div className="mb-4">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">A simple routine that works</p>
              <h3 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Make every visit count</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                Use AveFit before and after your workout to stay focused and see your effort add up.
              </p>
            </div>
            <div className="space-y-2">
              {[
                { number: "01", title: "Check your plan", description: "Know what you want to work on today.", to: "/user/workout", action: "Open workouts" },
                { number: "02", title: "Show up consistently", description: "Complete sessions at a pace that works for you.", to: "/user/workout", action: "View schedule" },
                { number: "03", title: "Celebrate your progress", description: "Log a check-in and notice your trends over time.", to: "/user/progress", action: "Track progress" },
              ].map((step) => (
                <Link
                  key={step.number}
                  to={step.to}
                  className="group flex items-center gap-3 rounded-xl border border-orange-100/80 bg-white/80 p-3 transition hover:border-orange-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-orange-500/40 dark:hover:bg-white/[0.06]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-500 text-xs font-black text-white">{step.number}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">{step.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">{step.description}</span>
                  </span>
                  <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-orange-700 group-hover:text-orange-800 dark:text-orange-300 sm:flex">
                    {step.action} <ArrowRight size={14} />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111] sm:p-6">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Visit the gym</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">Gym information</h2>
            <div className="mt-5 space-y-5">
              {GYM_INFO.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400">
                    <Icon size={17} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-500">{label}</p>
                    <p className="mt-1 whitespace-pre-line text-sm font-medium leading-relaxed text-slate-800 dark:text-slate-200">{value}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm dark:border-white/5 dark:bg-[#111]">
            <div className="flex items-center justify-between gap-3 p-5 sm:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Find us</p>
                <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Gym location</h2>
              </div>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-orange-200 px-3 text-xs font-semibold text-orange-700 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-orange-500/30 dark:text-orange-300 dark:hover:bg-orange-500/10"
              >
                Directions <ExternalLink size={14} />
              </a>
            </div>
            <iframe
              title="Map showing Avenue Power and Fitness Gym in Tanauan City, Batangas"
              src={`https://maps.google.com/maps?q=${mapQuery}&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="h-64 w-full border-0 sm:h-72"
            />
            <p className="px-5 py-3 text-xs leading-relaxed text-slate-500 sm:px-6">
              Map results are based on the gym address listed above. Confirm the pin before traveling.
            </p>
          </section>

          <section className="rounded-2xl border border-orange-200 bg-orange-50/80 p-5 dark:border-orange-500/20 dark:bg-orange-500/[0.07] sm:p-6">
            <h2 className="font-bold text-slate-900 dark:text-white">Small steps add up</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Check your plan, show up consistently, and log your progress when you can. Your journey is personal—focus on steady progress.
            </p>
          </section>
        </aside>

        <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111] sm:p-6 lg:col-span-2">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Your voice matters</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">Share your feedback</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tell us about your experience. Your feedback will be emailed to the gym admin using your account email.</p>
          </div>

          <div className="mb-4">
            <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Your rating</p>
            <div className="flex gap-1" role="group" aria-label="Rate your experience">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
                  aria-pressed={rating === star}
                  onMouseEnter={() => setHovered(star)}
                  onMouseLeave={() => setHovered(0)}
                  onClick={() => setRating(star)}
                  className="grid h-10 w-10 place-items-center rounded-lg transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:hover:bg-white/5"
                >
                  <Star
                    size={22}
                    className={star <= (hovered || rating) ? "fill-orange-400 text-orange-400" : "text-slate-400"}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300 sm:col-span-2">
              Message *
              <textarea
                rows={4}
                value={feedback.message}
                maxLength={5000}
                onChange={(event) => setFeedback({ message: event.target.value })}
                placeholder="Share your experience..."
                className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </label>
          </div>

          {submitted && (
            <p role="status" className="mt-4 rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-300">
              Thank you. Your feedback has been emailed to the gym admin.
            </p>
          )}
          {feedbackError && (
            <p role="alert" className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {feedbackError}
            </p>
          )}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!feedback.message.trim() || rating === 0 || submitting}
            className="mt-4 w-full rounded-xl bg-orange-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            {submitting ? "Sending feedback…" : "Submit feedback"}
          </button>
        </section>

        <p className="text-center text-xs text-slate-500 lg:col-span-2">
          AveFit · Batangas State University Capstone Project 2026
        </p>
      </main>
    </div>
  );
}
