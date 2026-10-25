import { useLocation, useNavigate } from "react-router-dom";
import { Bell, CalendarClock, ClipboardList, Dumbbell, User, Users } from "lucide-react";
import AppShell from "../components/layout/AppShell";
import useUnreadCount from "../components/layout/useUnreadCount";
import { useTrainerAuth } from "../context/TrainerAuthContext";

const NAV = [
  { to: "/trainer/roster", icon: Users, label: "My Roster" },
  { to: "/trainer/workout-plans", icon: ClipboardList, label: "Workout Plans" },
  { to: "/trainer/availability", icon: CalendarClock, label: "Availability" },
  { to: "/trainer/exercises", icon: Dumbbell, label: "Exercises" },
  { to: "/trainer/profile", icon: User, label: "My Profile" },
];

export default function TrainerLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { trainer, logoutTrainer } = useTrainerAuth();
  const unread = useUnreadCount(location.pathname, "trainer");

  const handleLogout = () => {
    logoutTrainer();
    navigate("/trainer/login", { replace: true });
  };

  return (
    <AppShell
      portalClassName="trainer-portal"
      nav={NAV}
      subtitle="Coach portal"
      onLogout={handleLogout}
      actions={
        <button
          type="button"
          onClick={() => navigate("/trainer/notifications")}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <Bell size={20} />
          {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">{unread > 9 ? "9+" : unread}</span>}
        </button>
      }
      user={
        trainer
          ? {
              name: trainer.full_name || "Coach",
              meta: trainer.email || "Coach",
              avatarUrl: trainer.photo_url || null,
              initials: (trainer.full_name || "C").charAt(0).toUpperCase(),
            }
          : null
      }
      topbarLeft={
        <span className="block min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
            {trainer?.full_name || "AveFit Coach"}
          </span>
          <span className="hidden truncate text-[11px] text-slate-500 sm:block">
            Avenue Power and Fitness Gym
          </span>
        </span>
      }
      contentWidth="max-w-7xl"
    >
      {children}
    </AppShell>
  );
}
