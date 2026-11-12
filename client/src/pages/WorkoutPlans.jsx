import { useEffect, useState } from "react";
import { Plus, Trash2, Search, X, ClipboardList } from "lucide-react";
import api from "../services/api";
import ConfirmDialog from "../components/ui/ConfirmDialog";

function PlanModal({ members, trainers, onClose, onSave }) {
  const [form, setForm] = useState({ user_id: "", trainer_id: "", plan_name: "", goal: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!form.plan_name) { setError("Plan name is required."); return; }
    setSaving(true);
    try {
      await api.post("/workouts/plans", form);
      onSave();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">Create Workout Plan</h2>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Plan Name *</label>
            <input type="text" value={form.plan_name} onChange={(e) => setForm({ ...form, plan_name: e.target.value })}
              placeholder="e.g. Beginner Strength Program"
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Goal</label>
            <select value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">Select goal...</option>
              {["Weight Loss", "Gain Weight", "General Fitness", "Endurance", "Flexibility"].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Assign to Member</label>
            <select value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">No member (template)</option>
              {members.map((m) => (
                <option key={m.member_id} value={m.member_id}>{m.full_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Assign Trainer</label>
            <select value={form.trainer_id} onChange={(e) => setForm({ ...form, trainer_id: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
              <option value="">No trainer</option>
              {trainers.map((t) => (
                <option key={t.trainer_id} value={t.trainer_id}>{t.full_name}</option>
              ))}
            </select>
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>
        <div className="p-6 border-t flex gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border text-slate-600 hover:bg-slate-50 text-sm font-medium">Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium disabled:opacity-50">
            {saving ? "Creating..." : "Create Plan"}
          </button>
        </div>
      </div>
    </div>
  );
}

const statusColors = {
  Active: "border-green-200 bg-green-50 text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-300",
  Inactive: "border-slate-200 bg-slate-100 text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
  Completed: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300",
};

export default function WorkoutPlans() {
  const [plans, setPlans] = useState([]);
  const [members, setMembers] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [deletePlan, setDeletePlan] = useState(null);
  const [deletingPlan, setDeletingPlan] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const fetchData = () => {
    setLoading(true);
    setFetchError("");
    Promise.all([
      api.get("/workouts/plans"),
      api.get("/members"),
      api.get("/trainers"),
    ])
      .then(([plansRes, memRes, trainerRes]) => {
        setPlans(plansRes.data.data);
        setMembers(memRes.data.data);
        setTrainers(trainerRes.data.data);
      })
      .catch((err) => {
        console.error(err);
        setFetchError(err.response?.data?.message || err.message || "Couldn't load workout plans.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async () => {
    if (!deletePlan) return;
    setFetchError("");
    setDeleteError("");
    setDeletingPlan(true);
    try {
      await api.delete(`/workouts/plans/${deletePlan.workout_plan_id}`);
      setDeletePlan(null);
      await fetchData();
    } catch (err) {
      const message = err.response?.data?.message || "Failed to delete workout plan.";
      setFetchError(message);
      setDeleteError(message);
    } finally {
      setDeletingPlan(false);
    }
  };

  const filtered = plans.filter((p) =>
    p.plan_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.member_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.trainer_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.goal?.toLowerCase().includes(search.toLowerCase())
  ).filter((plan) => statusFilter === "All" || plan.status === statusFilter);

  return (
    <div className="space-y-6">
      {deletePlan && (
        <ConfirmDialog
          title={`Delete "${deletePlan.plan_name}"?`}
          description="This workout plan will be permanently deleted. This action cannot be undone."
          confirmLabel="Delete plan"
          isLoading={deletingPlan}
          error={deleteError}
          onCancel={() => {
            if (!deletingPlan) {
              setDeletePlan(null);
              setDeleteError("");
            }
          }}
          onConfirm={handleDelete}
        />
      )}
      {showModal && (
        <PlanModal
          members={members}
          trainers={trainers}
          onClose={() => setShowModal(false)}
          onSave={fetchData}
        />
      )}

      {fetchError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          ⚠️ {fetchError}
        </div>
      )}

      <header className="ave-page-hero flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Training management</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Workout Plans</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Coordinate plan assignments across members and trainers.</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">
          <Plus size={18} /> Create Plan
        </button>
      </header>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: "Total Plans", value: plans.length, color: "text-orange-600" },
          { label: "Active Plans", value: plans.filter((p) => p.status === "Active").length, color: "text-green-600" },
          { label: "Assigned to Members", value: plans.filter((p) => p.member_name).length, color: "text-purple-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111]">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className={`mt-2 text-2xl font-black ${s.color}`}>{loading ? "—" : s.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111] sm:flex-row">
        <label className="flex min-h-10 flex-1 items-center gap-2 rounded-lg bg-slate-100 px-3 dark:bg-white/5 sm:max-w-sm">
          <Search size={16} className="text-gray-400" />
          <input type="search" aria-label="Search workout plans" placeholder="Search plans, goals, members, trainers..." value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none dark:text-white" />
        </label>
        <label className="sr-only" htmlFor="admin-plan-status">Filter workout plans by status</label>
        <select id="admin-plan-status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-white/10 dark:bg-[#111] dark:text-slate-200">
          {["All","Active","Inactive","Completed"].map((status) => <option key={status} value={status}>{status === "All" ? "All statuses" : status}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#111]">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Plan Name</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Goal</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Member</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Trainer</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Status</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Created</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <ClipboardList size={36} className="mx-auto text-slate-200 mb-2" />
                    <p className="font-semibold text-slate-700 dark:text-slate-200">{plans.length ? "No plans match these filters." : "No workout plans yet."}</p>
                  </td>
                </tr>
              ) : (
                filtered.map((plan) => (
                  <tr key={plan.workout_plan_id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 font-semibold text-slate-800">{plan.plan_name}</td>
                    <td className="px-6 py-4 text-slate-600">{plan.goal || "—"}</td>
                    <td className="px-6 py-4 text-slate-600">{plan.member_name || <span className="text-slate-300">Unassigned</span>}</td>
                    <td className="px-6 py-4 text-slate-600">{plan.trainer_name || <span className="text-slate-300">None</span>}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusColors[plan.status] || statusColors.Inactive}`}>
                        {plan.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {plan.created_at ? new Date(plan.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-4">
                      <button onClick={() => { setDeleteError(""); setDeletePlan(plan); }}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition" title="Delete" aria-label={`Delete ${plan.plan_name}`}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
        <div className="border-t border-slate-100 px-6 py-3 text-sm text-slate-500 dark:border-white/10">
          Showing {filtered.length} of {plans.length} plans
        </div>
      </div>
    </div>
  );
}