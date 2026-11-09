import {
  Home, Users, Dumbbell, Salad, BarChart3,
  Settings, LogOut, Bell, UserCheck, ClipboardList,
} from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import api from "../services/api";

const navItems = [
  { to: "/admin/dashboard", icon: <Home size={20} />, label: "Dashboard" },
  { to: "/admin/members", icon: <Users size={20} />, label: "Members" },
  { to: "/admin/trainers", icon: <UserCheck size={20} />, label: "Trainers" },
  { to: "/admin/workouts", icon: <Dumbbell size={20} />, label: "Exercises" },
  { to: "/admin/workout-plans", icon: <ClipboardList size={20} />, label: "Workout Plans" },
  { to: "/admin/nutrition", icon: <Salad size={20} />, label: "Meal Plans" },
  { to: "/admin/analytics", icon: <BarChart3 size={20} />, label: "Analytics" },
  { to: "/admin/notifications", icon: <Bell size={20} />, label: "Notifications" },
  { to: "/admin/settings", icon: <Settings size={20} />, label: "Settings" },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    api.get("/notifications/unread-count")
      .then((res) => setUnreadCount(res.data.count))
      .catch(() => {});
  }, [location.pathname]);

  const handleLogout = () => {
    sessionStorage.removeItem("avefit_token");
    localStorage.removeItem("avefit_admin");
    navigate("/login");
  };

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-screen sticky top-0">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-3xl font-bold text-blue-400">AveFit</h1>
        <p className="text-slate-400 text-sm">Admin Panel</p>
      </div>

      <nav className="flex-1 py-6 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location.pathname === item.to;
          return (
            <Link key={item.to} to={item.to}
              className={`flex items-center gap-3 px-6 py-3 transition
                ${isActive ? "bg-blue-600 text-white border-r-4 border-blue-400" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
              {item.icon}
              <span className="font-medium flex-1">{item.label}</span>
              {item.label === "Notifications" && unreadCount > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-6 border-t border-slate-700">
        <button onClick={handleLogout}
          className="flex items-center justify-center gap-2 w-full bg-red-600 hover:bg-red-700 py-2 rounded-lg transition font-medium">
          <LogOut size={18} /> Logout
        </button>
      </div>
    </aside>
  );
}