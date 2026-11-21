import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Clock3,
  Database,
  HardDrive,
  RefreshCw,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import api from "../services/api";

const formatDuration = (seconds = 0) => {
  const totalMinutes = Math.floor(Number(seconds) / 60);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  return [
    days ? `${days}d` : null,
    hours ? `${hours}h` : null,
    `${minutes}m`,
  ].filter(Boolean).join(" ");
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
};

const getStatusStyle = (status) => {
  if (status === "healthy" || status === "connected") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300";
  }
  if (status === "not_configured") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300";
  }
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
};

function StatusCard({ icon: Icon, title, status, description, detail }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          <Icon size={20} aria-hidden="true" />
        </span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getStatusStyle(status)}`}>
          {status.replaceAll("_", " ")}
        </span>
      </div>
      <h2 className="mt-4 font-bold text-slate-900 dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{description}</p>
      {detail && <p className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">{detail}</p>}
    </section>
  );
}

function eventLabel(event) {
  if (event.event_type === "admin_login") {
    return Number(event.status_code) < 400 ? "Admin sign-in succeeded" : "Admin sign-in failed";
  }
  return "Admin action";
}

export default function AdminSystemHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/admin/system-health");
      setHealth(data.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load system health. Try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  const pool = health?.database?.pool;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Security &amp; operations</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">System Health</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Review service availability, backup monitoring, and recent admin activity.</p>
        </div>
        <button
          type="button"
          onClick={loadHealth}
          disabled={loading}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard
          icon={Activity}
          title="API service"
          status={health?.service?.status || "unknown"}
          description="The protected system health request is reaching the API."
          detail={health ? `Process uptime: ${formatDuration(health.service.uptime_seconds)}` : "Waiting for a status check"}
        />
        <StatusCard
          icon={Database}
          title="Database"
          status={health?.database?.status || "unknown"}
          description="PostgreSQL connection verified by a live query."
          detail={pool ? `Connections: ${pool.open} open · ${pool.idle} idle · ${pool.waiting} waiting` : "Waiting for a status check"}
        />
        <StatusCard
          icon={HardDrive}
          title="Backup monitoring"
          status={health?.backup?.status || "unknown"}
          description={health?.backup?.message || "Backup provider status is not available."}
          detail="No backup or restore action is available from this page."
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div className="flex items-start gap-3">
            <ShieldCheck size={20} className="mt-0.5 text-orange-500" aria-hidden="true" />
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white">Admin activity audit</h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Records admin sign-ins and authenticated admin changes. Request bodies and passwords are never stored.
              </p>
            </div>
          </div>
          {health?.checked_at && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <Clock3 size={14} /> Checked {formatDateTime(health.checked_at)}
            </span>
          )}
        </div>
        {loading && !health ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading system status…</p>
        ) : health?.audit?.events?.length ? (
          <div className="max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950">
                <tr>
                  <th scope="col" className="px-5 py-3 font-semibold">Activity</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Admin</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Request</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Result</th>
                  <th scope="col" className="px-5 py-3 font-semibold">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {health.audit.events.map((event) => (
                  <tr key={event.audit_id} className="text-slate-700 dark:text-slate-200">
                    <td className="px-5 py-3 font-medium">{eventLabel(event)}</td>
                    <td className="px-5 py-3">{event.admin_name || "Unverified sign-in"}</td>
                    <td className="max-w-[22rem] truncate px-5 py-3 font-mono text-xs">
                      {event.request_method} {event.request_path}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold ${Number(event.status_code) < 400 ? getStatusStyle("healthy") : "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300"}`}>
                        {event.status_code}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">{formatDateTime(event.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No admin activity recorded yet.</p>
            <p className="mt-1 text-xs text-slate-500">Sign-ins and admin changes will appear here.</p>
          </div>
        )}
      </section>

      <section className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-500/20 dark:bg-amber-500/[0.05]">
        <Wrench size={19} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-bold text-amber-900 dark:text-amber-200">Maintenance controls are not enabled</h2>
          <p className="mt-1 text-sm leading-relaxed text-amber-800 dark:text-amber-300">
            {health?.maintenance?.message || "This dashboard is read-only. Configure backups and maintenance procedures with your hosting provider; verify restores regularly."}
          </p>
        </div>
      </section>
    </div>
  );
}
