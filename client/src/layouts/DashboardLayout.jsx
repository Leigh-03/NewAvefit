import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Bell,
  Dumbbell,
  Home,
  Settings,
  UserCheck,
  Users,
} from "lucide-react";
import AppShell from "../components/layout/AppShell";
import useUnreadCount from "../components/layout/useUnreadCount";

const NAV = [
  { to: "/admin/dashboard", icon: Home, label: "Dashboard" },
  { to: "/admin/members", icon: Users, label: "Members" },
  { to: "/admin/trainers", icon: UserCheck, label: "Trainers" },
  { to: "/admin/workouts", icon: Dumbbell, label: "Exercises" },
  { to: "/admin/analytics", icon: BarChart3, label: "Analytics" },
  { to: "/admin/notifications", icon: Bell, label: "Notifications", badge: true },
  { to: "/admin/settings", icon: Settings, label: "Settings" },
];

const PAGE_TITLES = {
  "/admin/dashboard": "Dashboard",
  "/admin/members": "Members",
  "/admin/trainers": "Trainers",
  "/admin/workouts": "Exercises",
  "/admin/nutrition": "Meal Plans",
  "/admin/analytics": "Analytics",
  "/admin/notifications": "Notifications",
  "/admin/settings": "Settings",
};

export default function DashboardLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const unread = useUnreadCount(location.pathname, "admin");
  const admin = JSON.parse(localStorage.getItem("avefit_admin") || "{}");

  const nav = useMemo(
    () =>
      NAV.map((item) => (item.badge ? { ...item, badge: unread } : item)),
    [unread]
  );

  const handleLogout = () => {
    sessionStorage.removeItem("avefit_token");
    localStorage.removeItem("avefit_admin");
    navigate("/login", { replace: true });
  };

  return (
    <AppShell
      nav={nav}
      subtitle="Admin portal"
      user={{
        name: admin.name || "Administrator",
        meta: admin.email || "Administrator",
        avatarUrl: admin.photo_url || null,
        initials: (admin.name || "A").charAt(0).toUpperCase(),
      }}
      onLogout={handleLogout}
      search
      searchPlaceholder="Search…"
      topbarLeft={
        <span className="flex items-center gap-2 truncate text-sm">
          <span className="hidden text-slate-500 sm:inline">Admin</span>
          <span className="hidden text-slate-300 sm:inline dark:text-slate-600">/</span>
          <span className="truncate font-semibold text-slate-900 dark:text-white">
            {PAGE_TITLES[location.pathname] || "AveFit"}
          </span>
        </span>
      }
      actions={
        <button
          type="button"
          onClick={() => navigate("/admin/notifications")}
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
          className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <Bell size={20} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-[#0b0b0b]">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      }
    >
      {children}
    </AppShell>
  );
}
