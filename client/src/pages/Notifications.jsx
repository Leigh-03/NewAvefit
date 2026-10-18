import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Trash2, Circle } from "lucide-react";
import { Link } from "react-router-dom";
import { createNotificationsApi } from "../services/notificationsApi";
import BrowserPushSettings from "../components/notifications/BrowserPushSettings";

const typeColors = {
  workout: "border-green-200 bg-green-50 text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300",
  membership: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300",
  payment: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300",
  alert: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
  bmi_reminder: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300",
  general: "border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
};

const notificationTypeLabel = (type) => ({
  bmi_reminder: "BMI reminder",
}[type] || type.replaceAll("_", " "));

export default function Notifications({ audience = "admin" }) {
  const notificationsApi = useMemo(() => createNotificationsApi(audience), [audience]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [fetchError, setFetchError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const fetchNotifications = useCallback(() => {
    setLoading(true);
    setFetchError("");
    notificationsApi.get("/")
      .then((res) => setNotifications(res.data.data))
      .catch((err) => {
        console.error(err);
        setFetchError(err.response?.data?.message || err.message || "Couldn't load notifications.");
      })
      .finally(() => setLoading(false));
  }, [notificationsApi]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleMarkRead = async (id) => {
    setActionError("");
    setBusyAction(String(id));
    try {
      await notificationsApi.put(`/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.notification_id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      setActionError(err.response?.data?.message || "Unable to mark this notification as read.");
    } finally {
      setBusyAction("");
    }
  };

  const handleMarkAllRead = async () => {
    setActionError("");
    setBusyAction("all");
    try {
      await notificationsApi.put("/mark-all-read");
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      setActionError(err.response?.data?.message || "Unable to mark notifications as read.");
    } finally {
      setBusyAction("");
    }
  };

  const handleDelete = async (id) => {
    setActionError("");
    setBusyAction(String(id));
    try {
      await notificationsApi.delete(`/${id}`);
      setNotifications((prev) => prev.filter((n) => n.notification_id !== id));
    } catch (err) {
      setActionError(err.response?.data?.message || "Unable to delete this notification.");
    } finally {
      setBusyAction("");
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === "Unread") return !n.is_read;
    if (filter === "Read") return n.is_read;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      {fetchError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          ⚠️ {fetchError}
        </div>
      )}
      {actionError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{actionError}</div>}
      <header className="ave-page-hero flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">{audience === "admin" ? "Admin inbox" : audience === "trainer" ? "Coach inbox" : "Member inbox"}</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Notifications</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}` : "All caught up!"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={busyAction !== ""}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:opacity-50"
          >
            <CheckCheck size={16} />
            Mark All as Read
          </button>
        )}
      </header>

      <BrowserPushSettings audience={audience} />

      {/* Filter tabs */}
      <div className="flex gap-2" role="group" aria-label="Filter notifications">
        {["All", "Unread", "Read"].map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
              filter === f ? "bg-orange-500 text-white" : "border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 dark:border-white/10 dark:bg-[#111] dark:text-slate-300 dark:hover:bg-white/5"
            }`}
          >
            {f}
            {f === "Unread" && unreadCount > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                {unreadCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#111]">
        {loading ? (
          <div className="p-8 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <Bell size={40} className="mx-auto text-slate-200 mb-3" />
            <p className="font-semibold text-slate-700 dark:text-slate-200">{notifications.length ? `No ${filter.toLowerCase()} notifications.` : "You’re all caught up."}</p>
            <p className="mt-1 text-sm text-slate-500">{notifications.length ? "Choose another filter to view your notifications." : "New updates will appear here."}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((notif) => (
              <div
                key={notif.notification_id}
                className={`flex items-start gap-3 px-4 py-4 transition hover:bg-slate-50 dark:hover:bg-white/[0.03] sm:gap-4 sm:px-6 ${
                  !notif.is_read ? "bg-orange-50/70 dark:bg-orange-500/[0.06]" : ""
                }`}
              >
                {/* Type badge */}
                <div className={`mt-1 rounded-lg border p-2 flex-shrink-0 ${typeColors[notif.notification_type] || typeColors.general}`}>
                  <Bell size={16} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {!notif.is_read && (
                      <Circle size={8} className="fill-orange-500 text-orange-500 flex-shrink-0" />
                    )}
                    <p className={`text-sm ${!notif.is_read ? "font-semibold text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-300"}`}>
                      {notif.message}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {notif.user_name && (
                      <span className="text-xs text-slate-400">{notif.user_name}</span>
                    )}
                    {notif.notification_type && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeColors[notif.notification_type] || typeColors.general}`}>
                        {notificationTypeLabel(notif.notification_type)}
                      </span>
                    )}
                    <span className="text-xs text-slate-400">
                      {new Date(notif.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })}
                    </span>
                  </div>
                  {notif.target_url?.startsWith("/") && !notif.target_url.startsWith("//") && (
                    <Link
                      to={notif.target_url}
                      onClick={() => {
                        if (!notif.is_read) handleMarkRead(notif.notification_id);
                      }}
                      className="mt-2 inline-flex text-xs font-semibold text-orange-600 hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
                    >
                      {notif.notification_type === "bmi_reminder" ? "Update BMI and progress" : "View"}
                    </Link>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!notif.is_read && (
                    <button
                      onClick={() => handleMarkRead(notif.notification_id)}
                      disabled={busyAction !== ""}
                      aria-label={`Mark notification as read: ${notif.message}`}
                      className="p-1.5 rounded-lg hover:bg-orange-100 text-orange-500 transition"
                      title="Mark as read"
                    >
                      <CheckCheck size={16} />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(notif.notification_id)}
                    disabled={busyAction !== ""}
                    aria-label={`Delete notification: ${notif.message}`}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}