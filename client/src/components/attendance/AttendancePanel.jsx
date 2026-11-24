import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Clock3, MapPin } from "lucide-react";

const formatAttendanceDate = (date) => {
  if (!date) return "Date unavailable";
  const [year, month, day] = String(date).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "Date unavailable";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
};

const formatAttendanceTime = (date) => {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
};

export default function AttendancePanel({
  client,
  endpoint,
  checkInEndpoint,
  showCheckIn = true,
  weeklyTarget,
  monthlyTarget,
  onAttendanceChange,
}) {
  const [attendance, setAttendance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadAttendance = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError("");
    }
    try {
      const response = await client.get(endpoint);
      const data = response.data?.data;
      setAttendance(data || null);
      setError("");
      onAttendanceChange?.(Boolean(data?.checked_in_today));
    } catch (requestError) {
      console.error("Unable to load attendance:", requestError);
      setError(requestError.response?.data?.message || "Unable to load attendance history.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [client, endpoint, onAttendanceChange]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  useEffect(() => {
    const refreshAttendance = () => {
      if (!document.hidden && !checkingIn) loadAttendance({ silent: true });
    };
    const intervalId = window.setInterval(refreshAttendance, 60_000);
    window.addEventListener("focus", refreshAttendance);
    document.addEventListener("visibilitychange", refreshAttendance);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshAttendance);
      document.removeEventListener("visibilitychange", refreshAttendance);
    };
  }, [checkingIn, loadAttendance]);

  const handleCheckIn = async () => {
    setCheckingIn(true);
    setError("");
    setNotice("");
    try {
      const response = await client.post(checkInEndpoint);
      setNotice(response.data?.message || "Your attendance has been recorded.");
      await loadAttendance();
    } catch (requestError) {
      console.error("Unable to record gym attendance:", requestError);
      setError(requestError.response?.data?.message || "Unable to record attendance. Please try again.");
    } finally {
      setCheckingIn(false);
    }
  };

  const recentVisits = Array.isArray(attendance?.recent_visits) ? attendance.recent_visits : [];
  const getTargetLabel = (target, count, period) => {
    const goal = Number(target);
    if (!Number.isFinite(goal) || goal < 1) return "Set your workout schedule to see a check-in target.";
    const remaining = Math.max(0, goal - (Number(count) || 0));
    return remaining
      ? `Need ${remaining} more check-in${remaining === 1 ? "" : "s"} ${period}.`
      : `${period[0].toUpperCase()}${period.slice(1)} check-in target met.`;
  };

  return (
    <section aria-labelledby="gym-attendance-heading" className="rounded-2xl border border-orange-200 bg-white p-4 shadow-sm dark:border-orange-500/20 dark:bg-[#111] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="gym-attendance-heading" className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
            <CalendarCheck size={19} className="text-orange-500" /> Gym attendance
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Visits are recorded once per day using Philippines time. Weekly and monthly targets follow your workout schedule.
          </p>
        </div>
        {checkInEndpoint && showCheckIn && (
          <button
            type="button"
            onClick={handleCheckIn}
            disabled={loading || checkingIn || Boolean(attendance?.checked_in_today)}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          >
            <MapPin size={16} />
            {checkingIn ? "Checking in..." : attendance?.checked_in_today ? "Checked in today" : "Check in at gym"}
          </button>
        )}
      </div>

      {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-300">{notice}</p>}

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["This week", attendance?.visits_this_week, weeklyTarget, "this week"],
          ["This month", attendance?.visits_this_month, monthlyTarget, "this month"],
          ["All visits", attendance?.total_visits, null, null],
        ].map(([label, count, target, period]) => (
          <div key={label} className="rounded-xl bg-orange-50 p-3 dark:bg-orange-500/[0.08]">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</p>
            <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">
              {loading ? "—" : `${Number(count) || 0}${Number(target) > 0 ? ` / ${Number(target)}` : ""}`}
            </p>
            {label !== "All visits" && !loading && (
              <p className="mt-1 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                {target
                  ? getTargetLabel(target, count, period)
                  : checkInEndpoint
                    ? "Set your workout schedule to see a check-in target."
                    : null}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Clock3 size={14} /> Recent visits
        </div>
        {loading ? (
          <p role="status" className="mt-2 text-sm text-slate-500">Loading attendance...</p>
        ) : recentVisits.length ? (
          <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
            {recentVisits.map((visit) => (
            <li key={`${visit.attendance_date}-${visit.is_simulated ? "sample" : "recorded"}`} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-white/[0.04]">
                <span className="font-medium text-slate-700 dark:text-slate-200">{formatAttendanceDate(visit.attendance_date)}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                {visit.is_simulated && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">Demo</span>}
                {formatAttendanceTime(visit.checked_in_at)} PH
              </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No gym visits recorded yet.</p>
        )}
      </div>
    </section>
  );
}
