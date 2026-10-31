import { useEffect, useState } from "react";
import { Users, Clock, Dumbbell, BarChart3, UserCheck } from "lucide-react";
import { Link } from "react-router-dom";
import StatCard from "../components/dashboard/StatCard";
import GrowthChart from "../components/dashboard/GrowthChart";
import ActivityList from "../components/dashboard/ActivityList";
import api from "../services/api";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  useEffect(() => {
    api.get("/analytics/dashboard")
      .then((res) => setStats(res.data.data))
      .catch((err) => {
        console.error(err);
        setFetchError(err.response?.data?.message || err.message || "Couldn't load dashboard stats.");
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <header className="ave-page-hero rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Admin overview</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white">Dashboard</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Welcome back. Here’s the latest at Avenue Power and Fitness Gym.
        </p>
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