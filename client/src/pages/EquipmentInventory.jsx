import { useEffect, useMemo, useState } from "react";
import { Boxes, Dumbbell, Search } from "lucide-react";
import api from "../services/api";

export default function EquipmentInventory() {
  const [equipment, setEquipment] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api.get("/workouts/equipment")
      .then(({ data }) => {
        if (active) setEquipment(Array.isArray(data.data) ? data.data : []);
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || "Unable to load equipment inventory.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const filteredEquipment = useMemo(() => {
    const query = search.trim().toLowerCase();
    return equipment.filter((item) => item.equipment.toLowerCase().includes(query));
  }, [equipment, search]);
  const exerciseCount = equipment.reduce((total, item) => total + Number(item.exercise_count || 0), 0);

  return (
    <div className="space-y-6">
      <header className="ave-page-hero rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Gym equipment</p>
        <div className="mt-2">
          <h1 className="text-3xl font-black text-slate-900 dark:text-white">Equipment Inventory</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Equipment options from the exercise catalog, including items not yet used by an exercise. This tracks catalog usage, not physical stock quantities.</p>
        </div>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Equipment options</p>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{loading ? "—" : equipment.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111]">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exercise catalog entries</p>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{loading ? "—" : exerciseCount}</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#111]">
        <div className="border-b border-slate-200 p-4 dark:border-white/10 sm:p-5">
          <label className="flex max-w-md items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-white/10">
            <Search size={17} className="text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search equipment..." className="w-full border-0 bg-transparent text-sm outline-none focus:ring-0 dark:text-white" aria-label="Search equipment inventory" />
          </label>
        </div>
        {loading ? <p className="p-8 text-center text-sm text-slate-500">Loading equipment...</p> : filteredEquipment.length ? (
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {filteredEquipment.map((item) => (
              <article key={item.equipment} className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400"><Dumbbell size={18} /></span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-bold text-slate-900 dark:text-white">{item.equipment}</h2>
                    <p className="text-xs text-slate-500">{item.exercise_count} {Number(item.exercise_count) === 1 ? "exercise" : "exercises"} in catalog</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-right">
                  <Boxes size={16} className="text-slate-400" />
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{item.usage_count}</p>
                    <p className="text-[11px] text-slate-500">completed uses</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="p-8 text-center text-sm text-slate-500">No equipment matches your search.</p>}
      </section>
    </div>
  );
}
