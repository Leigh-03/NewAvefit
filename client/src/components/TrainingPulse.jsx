import { useEffect, useState } from "react";
import { CalendarDays, Clock3, Dumbbell } from "lucide-react";
import api from "../services/api";
import trainerApi from "../trainerApi";
import userApi from "../userApi";

const API_BY_AUDIENCE = {
  admin: api,
  trainer: trainerApi,
  user: userApi,
};

const PATH_BY_AUDIENCE = {
  admin: "/analytics/training-pulse",
  trainer: "/me/training-pulse",
  user: "/training-pulse",
};

const periodLabel = (label) => ({
  Morning: "Morning · 6 AM–12 PM",
  Afternoon: "Afternoon · 12–5 PM",
  Evening: "Evening · 5–10 PM",
}[label] || label);

export default function TrainingPulse({ audience }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    API_BY_AUDIENCE[audience].get(PATH_BY_AUDIENCE[audience])
      .then(({ data: response }) => {
        if (active) {
          setData(response.data);
          setError("");
        }
      })
      .catch((requestError) => {
        console.error(requestError);
        if (active) setError(requestError.response?.data?.message || "Unable to load today's training overview.");
      });
    return () => { active = false; };
  }, [audience]);

  const busiestPeriod = data?.todayAvailability?.reduce((highest, current) => (
    !highest || Number(current.count) > Number(highest.count) ? current : highest
  ), null);

  return (
    <section aria-labelledby={`training-pulse-${audience}`} className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111]">
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">Today · {data?.today || "—"}</p>
        <h2 id={`training-pulse-${audience}`} className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Training overview</h2>
        <p className="mt-1 text-xs text-slate-500">Based on members&apos; preferred workout days and saved availability.</p>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/[0.04]">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Dumbbell size={15} /> Most scheduled program today</p>
            {data?.busiestProgram ? (
              <>
                <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">
                  {data.busiestProgram.program}
                  <span className="ml-2 text-sm font-medium text-slate-500">{data.busiestProgram.count} {data.busiestProgram.count === 1 ? "member" : "members"}</span>
                </p>
                {audience !== "user" && data.busiestProgram.members?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-500">Members on this program today</p>
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {data.busiestProgram.members.map((name, index) => (
                        <li key={`${name}-${index}`} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
                          {name}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : <p className="mt-2 text-sm text-slate-500">No members selected today as a workout day.</p>}
            {!!data?.todayPrograms?.length && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {data.todayPrograms.map((program) => (
                  <li key={program.program} className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
                    {program.program}: {program.count}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/[0.04]">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Clock3 size={15} /> Busiest availability today</p>
            {busiestPeriod && Number(busiestPeriod.count) > 0 ? (
              <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">
                {periodLabel(busiestPeriod.label)}
                <span className="ml-2 text-sm font-medium text-slate-500">{busiestPeriod.count} {Number(busiestPeriod.count) === 1 ? "member" : "members"}</span>
              </p>
            ) : <p className="mt-2 text-sm text-slate-500">No availability recorded for today.</p>}
            <ul className="mt-3 space-y-1">
              {(data?.todayAvailability || []).map((period) => (
                <li key={period.label} className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1"><CalendarDays size={13} /> {periodLabel(period.label)}</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{period.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 md:col-span-2 dark:bg-white/[0.04]">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Dumbbell size={15} /> Most scheduled equipment today</p>
            {data?.mostUsedEquipment?.length ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                {data.mostUsedEquipment.map((item) => (
                  <li key={item.equipment} className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-white/10">
                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">{item.equipment}</span>
                    <span className="shrink-0 text-xs font-semibold text-slate-500">{item.count} {Number(item.count) === 1 ? "planned use" : "planned uses"}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-500">No equipment is scheduled in approved workouts today.</p>}
            <p className="mt-2 text-xs text-slate-500">Based on equipment listed on approved workout plans, not live check-ins.</p>
          </div>
        </div>
      )}
    </section>
  );
}
