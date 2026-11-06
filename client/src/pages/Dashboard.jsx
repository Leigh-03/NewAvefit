import { useEffect, useState } from "react";
import { Users, Clock, Dumbbell, BarChart3, UserCheck, TriangleAlert, Wrench } from "lucide-react";
import { Link } from "react-router-dom";
import StatCard from "../components/dashboard/StatCard";
import GrowthChart from "../components/dashboard/GrowthChart";
import ActivityList from "../components/dashboard/ActivityList";
import api from "../services/api";

const normalizeEquipmentStatus = (status) => ({
  "Under repair": "Under Maintenance",
  "Under Maintenance": "Under Maintenance",
  "Needs replacement": "Needs replacement",
  "In service": "In service",
  "Needs inspection": "Needs inspection",
}[String(status || "").trim()] || String(status || "").trim() || "Needs inspection");

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    Promise.all([
      api.get("/analytics/dashboard"),
      api.get("/workouts/equipment"),
    ])
      .then(([dashboardRes, equipmentRes]) => {
        setStats(dashboardRes.data.data);
        setEquipment(Array.isArray(equipmentRes.data?.data) ? equipmentRes.data.data : []);
      })
      .catch((err) => {
        console.error(err);
        setFetchError(err.response?.data?.message || err.message || "Couldn't load dashboard stats.");
      })
      .finally(() => setLoading(false));
  }, []);

  const needReplacementCount = equipment.filter((item) => normalizeEquipmentStatus(item.status) === "Needs replacement").length;
  const underMaintenanceCount = equipment.filter((item) => normalizeEquipmentStatus(item.status) === "Under Maintenance").length;

  return (
    <div className="space-y-6">
      <header className="ave-page-hero rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Admin overview</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Welcome back. Here’s the latest at Avenue Power and Fitness Gym.
          </p>
        </div>
      </header>
      {fetchError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          ⚠️ {fetchError}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl shadow-md p-6 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <StatCard
            title="Total Members"
            value={stats?.memberTotal ?? stats?.totalMembers ?? 0}
            icon={<Users size={30} />}
            color="bg-orange-500"
            trend="Registered members"
          />
          <StatCard
            title="Pending Approval"
            value={stats?.pendingMembers ?? 0}
            icon={<Clock size={30} />}
            color="bg-yellow-500"
            trend="Needs review"
          />
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
        <Link to="/admin/equipment?status=Needs%20replacement" className="rounded-2xl border border-red-200 bg-red-50 p-3 transition hover:border-red-300 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:hover:bg-red-500/15">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <TriangleAlert size={16} />
              <span className="text-[11px] font-bold uppercase tracking-wide">Need replacement</span>
            </div>
            <span className="text-2xl font-black text-red-700 dark:text-red-300">{loading ? "—" : needReplacementCount}</span>
          </div>
        </Link>
        <Link to="/admin/equipment?status=Under%20Maintenance" className="rounded-2xl border border-amber-200 bg-amber-50 p-3 transition hover:border-amber-300 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:hover:bg-amber-500/15">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <Wrench size={16} />
              <span className="text-[11px] font-bold uppercase tracking-wide">Under Maintenance</span>
            </div>
            <span className="text-2xl font-black text-amber-700 dark:text-amber-300">{loading ? "—" : underMaintenanceCount}</span>
          </div>
        </Link>
      </section>

      <section aria-label="Quick links" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { to: "/admin/members", title: "Review members", description: `${stats?.pendingMembers ?? 0} pending approval`, icon: Users },
          { to: "/admin/trainers", title: "Manage trainers", description: "Profiles and assignments", icon: UserCheck },
          { to: "/admin/workouts", title: "Exercise library", description: "Maintain workout exercises", icon: Dumbbell },
          { to: "/admin/analytics", title: "View analytics", description: "Explore gym activity", icon: BarChart3 },
        ].map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to} className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-orange-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 dark:border-white/10 dark:bg-[#111]">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400"><Icon size={19}/></span>
            <span><span className="block text-sm font-bold text-slate-900 group-hover:text-orange-700 dark:text-white dark:group-hover:text-orange-300">{title}</span><span className="mt-1 block text-xs text-slate-500">{description}</span></span>
          </Link>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <GrowthChart />
        </div>
        <div>
          <ActivityList recentMembers={stats?.recentMembers ?? []} />
        </div>
      </div>
    </div>
  );
}