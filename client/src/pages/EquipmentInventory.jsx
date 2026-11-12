import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Boxes, ChevronDown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import api from "../services/api";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import CustomSelect from "../components/ui/CustomSelect";

const normalizeEquipmentStatus = (status) => {
  const cleaned = String(status || "").trim();
  if (!cleaned || cleaned.toLowerCase() === "all" || cleaned.toLowerCase() === "all statuses") return "";
  return {
    "Under repair": "Under Maintenance",
    "Under Maintenance": "Under Maintenance",
    "Needs replacement": "Needs replacement",
    "In service": "In service",
    "Needs inspection": "Needs inspection",
  }[cleaned] || cleaned;
};

const displayEquipmentStatus = (status) => normalizeEquipmentStatus(status);

const CONDITIONS_BY_STATUS = {
  "Needs inspection": ["Not assessed"],
  "Under Maintenance": ["Damaged"],
  "In service": ["Good", "Rusty"],
  "Needs replacement": ["Poor", "Damaged", "Worn"],
};
const STATUSES = Object.keys(CONDITIONS_BY_STATUS).filter((status) => status !== "Needs inspection");

const emptyForm = {
  equipment_name: "",
  quantity: "1",
  condition: "Good",
  condition_notes: "",
  status: "In service",
};

function EquipmentFormModal({ equipment, onClose, onSaved, onDelete, deleting }) {
  const normalizedEquipmentStatus = equipment ? normalizeEquipmentStatus(equipment.status) : "";
  const fallbackStatus = normalizedEquipmentStatus && CONDITIONS_BY_STATUS[normalizedEquipmentStatus]
    ? normalizedEquipmentStatus
    : "Needs inspection";
  const [form, setForm] = useState(() => equipment ? {
    equipment_name: equipment.equipment_name,
    quantity: String(equipment.quantity),
    condition: CONDITIONS_BY_STATUS[fallbackStatus]?.includes(equipment.condition)
      ? equipment.condition
      : CONDITIONS_BY_STATUS[fallbackStatus]?.[0] || "Not assessed",
    condition_notes: equipment.condition_notes || "",
    status: fallbackStatus,
  } : emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const availableConditions = CONDITIONS_BY_STATUS[form.status] || ["Not assessed"];

  const submit = async (event) => {
    event.preventDefault();
    if (!equipment && !/^[\p{L}\s]+$/u.test(form.equipment_name.trim())) {
      setError("Equipment name is required and can contain letters and spaces only.");
      return;
    }
    if (!/^\d+$/.test(form.quantity) || Number(form.quantity) < 1 || Number(form.quantity) > 50) {
      setError("Quantity must be a whole number from 1 to 50.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = equipment
        ? { ...form, quantity: Number(form.quantity), status: normalizeEquipmentStatus(form.status) }
        : { ...form, quantity: Number(form.quantity), condition: "Good", status: "In service" };
      if (equipment) {
        await api.put(`/workouts/equipment/${equipment.equipment_id}`, payload);
      } else {
        await api.post("/workouts/equipment", payload);
      }
      await onSaved();
      onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to save equipment details.");
    } finally {
      setSaving(false);
    }
  };

  const removeEquipment = () => onDelete(equipment);

  const fieldClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-orange-500 dark:border-white/10 dark:bg-[#111] dark:text-white";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="equipment-form-title" className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111]">
        <header className="border-b border-slate-200 p-5 dark:border-slate-800">
          <h2 id="equipment-form-title" className="text-xl font-bold text-slate-900 dark:text-white">
            {equipment ? "Equipment Details" : "Add Equipment"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">Update stock, condition, and the latest maintenance status.</p>
        </header>
        <form onSubmit={submit} className="space-y-4 p-5">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Equipment name
            <input
              required
              maxLength={120}
              value={form.equipment_name}
              onChange={(event) => setForm({ ...form, equipment_name: event.target.value })}
              className={fieldClass}
              placeholder="e.g. Treadmill"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Quantity
            <input
              required
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              min="1"
              max="50"
              maxLength={2}
              value={form.quantity}
              onChange={(event) => setForm({
                ...form,
                quantity: event.target.value.replace(/\D/g, "").slice(0, 2),
              })}
              onBlur={() => {
                if (!form.quantity) setError("Quantity must be a whole number from 1 to 50.");
              }}
              className={fieldClass}
            />
          </label>
          <div className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            <p>Status</p>
            {equipment ? (
              <div className="mt-1">
                <CustomSelect
                  id="equipment-status"
                  ariaLabel="Equipment status"
                  value={form.status}
                  options={[
                    ...(form.status === "Needs inspection"
                      ? [{ value: "Needs inspection", label: "Needs inspection", disabled: true }]
                      : []),
                    ...STATUSES.map((status) => ({ value: status, label: status })),
                  ]}
                  onChange={(status) => {
                    const nextConditions = CONDITIONS_BY_STATUS[status] || ["Not assessed"];
                    setForm({ ...form, status, condition: nextConditions[0] || "Not assessed" });
                  }}
                />
              </div>
            ) : (
              <span className={`${fieldClass} block cursor-not-allowed opacity-75`}>In service</span>
            )}
          </div>
          <div className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            <p>Condition</p>
            {equipment ? (
              <div className="mt-1">
                <CustomSelect
                  id="equipment-condition"
                  ariaLabel="Equipment condition"
                  value={form.condition}
                  disabled={availableConditions.length === 1}
                  options={availableConditions.map((condition) => ({ value: condition, label: condition }))}
                  onChange={(condition) => setForm({ ...form, condition })}
                />
              </div>
            ) : (
              <span className={`${fieldClass} block cursor-not-allowed opacity-75`}>Good</span>
            )}
          </div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200">
            Condition details
            <textarea
              rows={3}
              maxLength={500}
              value={form.condition_notes}
              onChange={(event) => setForm({ ...form, condition_notes: event.target.value })}
              className={fieldClass}
              placeholder="Optional notes, e.g. rust on the frame"
            />
          </label>
          {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          <footer className="flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
            {equipment && (
              <button
                type="button"
                onClick={removeEquipment}
                disabled={saving || deleting}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
              >
                <Trash2 size={15} /> {deleting ? "Removing..." : "Delete Equipment"}
              </button>
            )}
            <div className="ml-auto flex gap-3">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">Cancel</button>
            <button type="submit" disabled={saving} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50">
              {saving ? "Saving..." : equipment ? "Save Details" : "Add Equipment"}
            </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}

const statusClass = (status) => ({
  "In service": "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  "Needs replacement": "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  "Under Maintenance": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  "Needs inspection": "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
}[normalizeEquipmentStatus(status)] || "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300");

export default function EquipmentInventory() {
  const [equipment, setEquipment] = useState([]);
  const [search, setSearch] = useState("");
  const [expandedEquipment, setExpandedEquipment] = useState(null);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [confirmDeleteEquipment, setConfirmDeleteEquipment] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deletingEquipmentId, setDeletingEquipmentId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usagePeriod, setUsagePeriod] = useState("today");
  const [usageRows, setUsageRows] = useState([]);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedStatusFilter = normalizeEquipmentStatus(searchParams.get("status") || "");

  const fetchEquipment = async () => {
    setError("");
    try {
      const { data } = await api.get("/workouts/equipment");
      setEquipment(Array.isArray(data.data) ? data.data : []);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to load equipment inventory.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEquipment();
  }, []);

  useEffect(() => {
    let active = true;
    setUsageLoading(true);
    api.get("/analytics", { params: { equipment_period: usagePeriod } })
      .then(({ data }) => {
        if (active) {
          const nextRows = Array.isArray(data?.data?.mostUsedEquipment) ? data.data.mostUsedEquipment : [];
          setUsageRows(nextRows);
          setUsageError("");
        }
      })
      .catch((requestError) => {
        console.error(requestError);
        if (active) {
          setUsageRows([]);
          setUsageError(requestError.response?.data?.message || "Unable to load equipment usage.");
        }
      })
      .finally(() => active && setUsageLoading(false));
    return () => { active = false; };
  }, [usagePeriod]);

  const filteredEquipment = useMemo(() => {
    const query = search.trim().toLowerCase();
    return equipment.filter((item) => {
      const matchesQuery = item.equipment_name.toLowerCase().includes(query);
      const matchesStatus = !selectedStatusFilter || normalizeEquipmentStatus(item.status) === selectedStatusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [equipment, search, selectedStatusFilter]);
  const totalQuantity = equipment.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const needReplacementCount = equipment.filter((item) => normalizeEquipmentStatus(item.status) === "Needs replacement").length;
  const underMaintenanceCount = equipment.filter((item) => normalizeEquipmentStatus(item.status) === "Under Maintenance").length;

  const handleDelete = async (item) => {
    setDeletingEquipmentId(item.equipment_id);
    setDeleteError("");
    setError("");
    try {
      await api.delete(`/workouts/equipment/${item.equipment_id}`);
      setEquipment((current) => current.filter((entry) => entry.equipment_id !== item.equipment_id));
      setExpandedEquipment((current) => current === item.equipment_id ? null : current);
      setConfirmDeleteEquipment(null);
      setEditingEquipment((current) => current?.equipment_id === item.equipment_id ? null : current);
      return true;
    } catch (requestError) {
      const message = requestError.response?.data?.message || "Unable to remove equipment.";
      setDeleteError(message);
      setError(message);
      return false;
    } finally {
      setDeletingEquipmentId(null);
    }
  };

  return (
    <div className="space-y-6">
      {(showAddModal || editingEquipment) && (
        <EquipmentFormModal
          equipment={editingEquipment}
          onClose={() => { setShowAddModal(false); setEditingEquipment(null); }}
          onSaved={fetchEquipment}
          onDelete={(item) => {
            setDeleteError("");
            setConfirmDeleteEquipment(item);
          }}
          deleting={deletingEquipmentId === editingEquipment?.equipment_id}
        />
      )}
      {confirmDeleteEquipment && (
        <ConfirmDialog
          title={`Remove "${confirmDeleteEquipment.equipment_name}" from inventory?`}
          description="The equipment will be hidden from inventory but preserved for existing workout references."
          confirmLabel="Remove equipment"
          isLoading={deletingEquipmentId === confirmDeleteEquipment.equipment_id}
          error={deleteError}
          onCancel={() => {
            if (!deletingEquipmentId) {
              setConfirmDeleteEquipment(null);
              setDeleteError("");
            }
          }}
          onConfirm={() => handleDelete(confirmDeleteEquipment)}
        />
      )}
      <header className="ave-page-hero flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Gym equipment</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Equipment Inventory</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Manage physical equipment quantities, conditions, and repair or replacement status.</p>
        </div>
        <button type="button" onClick={() => setShowAddModal(true)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-700">
          <Plus size={18} /> Add Equipment
        </button>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
      {selectedStatusFilter && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-200">
          Showing equipment with status: <span className="font-bold">{selectedStatusFilter}</span>
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Equipment items</p>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{loading ? "—" : equipment.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total quantity</p>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{loading ? "—" : totalQuantity}</p>
        </div>
      </section>

      <details className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#111]">
        <summary className="cursor-pointer list-none text-sm font-bold text-slate-900 marker:hidden dark:text-white">
          <span className="inline-flex items-center gap-2"><Boxes size={16} className="text-orange-500" /> Most used equipment</span>
          <span className="mt-1 block text-xs font-normal text-slate-600 dark:text-slate-400">Open to see the equipment most used in this period.</span>
        </summary>

        <section aria-labelledby="equipment-usage-heading" className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-white/10">
          <div className="flex items-center justify-end gap-2">
            <label htmlFor="equipment-usage-period" className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Period
            </label>
            <select
              id="equipment-usage-period"
              name="equipment-usage-period"
              value={usagePeriod}
              onChange={(event) => setUsagePeriod(event.target.value)}
              className="min-h-9 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-normal text-slate-800 dark:border-white/10 dark:bg-[#111] dark:text-slate-200"
            >
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">This month</option>
            </select>
          </div>

          {usageError ? (
            <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">{usageError}</p>
          ) : usageLoading ? (
            <p className="py-3 text-center text-xs text-slate-500">Loading equipment usage...</p>
          ) : usageRows.length ? (
            <div className="grid gap-2">
              {usageRows.slice(0, 10).map((row, index) => (
                <div key={row.equipment} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800 dark:text-white">{index + 1}. {row.equipment}</p>
                    <p className="text-xs text-slate-500">Used {Number(row.count) || 0} times</p>
                  </div>
                  <span className="inline-flex items-center justify-center rounded-full bg-orange-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">
                    {Number(row.count) || 0}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-3 text-center text-xs text-slate-500">No equipment has been scheduled for this period.</p>
          )}
        </section>
      </details>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#111]">
        <div className="border-b border-slate-200 p-4 dark:border-white/10 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="ave-search flex min-h-12 max-w-md flex-1 items-center gap-3 rounded-xl border px-4">
              <Search size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search equipment..." className="min-w-0 flex-1 border-0 bg-transparent p-0 text-sm outline-none shadow-none focus:border-0 focus:ring-0 dark:text-white" aria-label="Search equipment inventory" />
            </label>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <label htmlFor="equipment-status-filter">Filter by status</label>
              <div className="w-44">
                <CustomSelect
                  id="equipment-status-filter"
                  ariaLabel="Filter by equipment status"
                  value={selectedStatusFilter || "All"}
                  options={[
                    { value: "All", label: "All Status" },
                    ...STATUSES.map((status) => ({ value: status, label: displayEquipmentStatus(status) })),
                  ]}
                  onChange={(status) => {
                    setSearchParams(status !== "All" ? { status } : {});
                  }}
                />
              </div>
            </div>
          </div>
        </div>
        {loading ? <p className="p-8 text-center text-sm text-slate-500">Loading equipment...</p> : filteredEquipment.length ? (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {filteredEquipment.map((item) => {
              const isExpanded = expandedEquipment === item.equipment_id;
              const users = Array.isArray(item.users) ? item.users : [];
              return (
                <article key={item.equipment_id}>
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-5">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpandedEquipment(isExpanded ? null : item.equipment_id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400"><Boxes size={18} /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{item.equipment_name}</span>
                        <span className="mt-1 block text-xs text-slate-500">Status: {displayEquipmentStatus(item.status)} · Condition: {item.condition}{item.condition_notes ? ` · ${item.condition_notes}` : ""}</span>
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Qty: {item.quantity}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}>
                        {displayEquipmentStatus(item.status)}
                        {normalizeEquipmentStatus(item.status) === "Needs inspection" && <span aria-label="Needs attention" title="Needs inspection" className="ml-1 inline-block h-2 w-2 rounded-full bg-red-500 align-middle" />}
                      </span>
                      <button type="button" onClick={() => setEditingEquipment(item)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-orange-500 hover:text-orange-600 dark:border-white/10 dark:text-slate-200" aria-label={`Edit ${item.equipment_name} details`}>
                        <Pencil size={14} /> Details
                      </button>
                      <button type="button" onClick={() => setExpandedEquipment(isExpanded ? null : item.equipment_id)} aria-label={`${isExpanded ? "Hide" : "Show"} ${item.equipment_name} usage`} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10">
                        <ChevronDown size={18} className={`transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="space-y-4 bg-slate-50/70 px-4 py-4 dark:bg-white/[0.02] sm:px-6">
                      <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3 dark:border-white/10 dark:bg-[#111]">
                        <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Quantity:</strong> {item.quantity}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Condition:</strong> {item.condition}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Status:</strong> {displayEquipmentStatus(item.status)}</p>
                        {item.condition_notes && <p className="text-sm text-slate-600 dark:text-slate-300 sm:col-span-3"><strong>Condition details:</strong> {item.condition_notes}</p>}
                        <p className="text-xs text-slate-500 sm:col-span-3">Last updated: {item.updated_at ? new Date(item.updated_at).toLocaleString() : "—"}</p>
                      </div>
                      <section>
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Members using this equipment in approved plans</h3>
                        {users.length ? (
                          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[#111]">
                            <table className="w-full min-w-[560px] text-left text-xs">
                              <thead className="border-b border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
                                <tr>{["Member", "Plan", "Workout date", "Status"].map((heading) => <th key={heading} className="px-3 py-2.5 font-semibold text-slate-500">{heading}</th>)}</tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                {users.map((usage, index) => (
                                  <tr key={`${usage.user_id}-${usage.session_date}-${index}`}>
                                    <td className="px-3 py-2.5 font-semibold text-slate-800 dark:text-slate-200">{usage.member_name || "Member"}</td>
                                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{usage.plan_name || "Workout plan"}</td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600 dark:text-slate-400">{usage.session_date ? new Date(`${String(usage.session_date).slice(0, 10)}T00:00:00`).toLocaleDateString() : "—"}</td>
                                    <td className="px-3 py-2.5"><span className={`rounded-full px-2 py-1 font-semibold ${usage.completed ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300"}`}>{usage.completed ? "Completed" : "Scheduled"}</span></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : <p className="text-sm text-slate-500">No approved member workout plans use this equipment yet.</p>}
                      </section>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : <p className="p-8 text-center text-sm text-slate-500">{equipment.length ? "No equipment matches your search." : "No equipment has been added yet."}</p>}
      </section>
    </div>
  );
}
