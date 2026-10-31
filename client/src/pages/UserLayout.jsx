import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Dumbbell, Home, Info, TrendingUp, User, UsersRound } from "lucide-react";
import AppShell from "../components/layout/AppShell";
import useUnreadCount from "../components/layout/useUnreadCount";
import { useUserAuth } from "../context/UserAuthContext";

const NAV = [
  { to: "/user/workout", icon: Home, label: "Home" },
  { to: "/user/exercises", icon: Dumbbell, label: "Exercises" },
  { to: "/user/progress", icon: TrendingUp, label: "Progress" },
  { to: "/coach", icon: UsersRound, label: "Coaches" },
  { to: "/user/about", icon: Info, label: "About" },
  { to: "/user/profile", icon: User, label: "Profile" },
];

export default function UserLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logoutUser } = useUserAuth();
  const unread = useUnreadCount(location.pathname, "user");

  const handleLogout = () => {
    logoutUser();
    navigate("/user/login", { replace: true });
  };

  const fullName = user ? `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim() : "";

  return (
    <AppShell
      portalClassName="user-portal"
      nav={NAV}
      subtitle="Avenue Power &amp; Fitness"
      bottomNav
      user={
        user
          ? {
              name: fullName || "Member",
              meta: user.email || "Member",
              avatarUrl: user.profile_image || null,
              initials: (user.first_name || "M").charAt(0).toUpperCase(),
            }
          : null
      }
      onLogout={handleLogout}
      actions={
        <button
          type="button"
          onClick={() => navigate("/user/notifications")}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <Bell size={20} />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">{unread > 9 ? "9+" : unread}</span>}
        </button>
      }
      topbarLeft={
        <span className="block min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
            {fullName || "AveFit"}
          </span>
          <span className="hidden truncate text-[11px] text-slate-500 sm:block">
            Avenue Power and Fitness Gym
          </span>
        </span>
      }
      contentClassName=""
      contentWidth="max-w-6xl"
    >
      {children}
    </AppShell>
  );
}
