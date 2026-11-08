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

export default function TrainingPulse({ audience, date }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const params = audience === "user" && date ? { date } : undefined;
    API_BY_AUDIENCE[audience].get(PATH_BY_AUDIENCE[audience], { params })
      .then(({ data: response }) => {
        if (active) {
          setData(response.data);
          setError("");
        }
      })
      .catch((requestError) => {
        console.error(requestError);
        if (active) setError(requestError.response?.data?.message || "Unable to load the training overview.");
      });
    return () => { active = false; };
  }, [audience, date]);

  const busiestPeriod = data?.todayAvailability?.reduce((highest, current) => (
    !highest || Number(current.count) > Number(highest.count) ? current : highest
  ), null);

  return (
    <section aria-labelledby={`training-pulse-${audience}`} className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111]">
      <div className="mb-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-600 dark:text-orange-400">{data?.dateLabel || `Today · ${data?.today || "—"}`}</p>
        <h2 id={`training-pulse-${audience}`} className="mt-1 text-lg font-bold text-slate-900 dark:text-white">Training overview</h2>
        <p className="mt-1 text-xs text-slate-500">Based on members&apos; preferred workout days and saved availability.</p>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/[0.04]">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Dumbbell size={15} /> Most scheduled program {data?.dayLabel || "today"}</p>
            {data?.busiestProgram ? (
              <>
                <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">
                  {data.busiestProgram.program}
                  <span className="ml-2 text-sm font-medium text-slate-500">{data.busiestProgram.count} {data.busiestProgram.count === 1 ? "member" : "members"}</span>
                </p>
                {audience !== "user" && data.busiestProgram.members?.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-slate-500">Members on this program {data?.dayLabel || "today"}</p>
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
            ) : <p className="mt-2 text-sm text-slate-500">No members selected {data?.dayLabel || "today"} as a workout day.</p>}
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
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Clock3 size={15} /> Busiest availability {data?.dayLabel || "today"}</p>
            {busiestPeriod && Number(busiestPeriod.count) > 0 ? (
              <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">
                {periodLabel(busiestPeriod.label)}
                <span className="ml-2 text-sm font-medium text-slate-500">{busiestPeriod.count} {Number(busiestPeriod.count) === 1 ? "member" : "members"}</span>
              </p>
            ) : <p className="mt-2 text-sm text-slate-500">No availability recorded for {data?.dayLabel || "today"}.</p>}
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
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Dumbbell size={15} /> Most scheduled equipment {data?.dayLabel || "today"}</p>
            {data?.mostUsedEquipment?.length ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {data.mostUsedEquipment.map((item) => (
                  <li key={item.equipment} className="flex min-w-0 flex-col items-start gap-2 rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-sm shadow-slate-900/[0.03] dark:border-white/10 dark:bg-white/[0.06]">
                    <span className="w-full break-words text-sm font-semibold leading-snug text-slate-800 dark:text-slate-100">{item.equipment}</span>
                    <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-semibold text-orange-700 dark:bg-orange-500/10 dark:text-orange-300">{item.count} {Number(item.count) === 1 ? "planned use" : "planned uses"}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-500">No equipment is scheduled in approved workouts {data?.dayLabel || "today"}.</p>}
            <p className="mt-2 text-xs text-slate-500">Based on equipment listed on approved workout plans, not live check-ins.</p>
          </div>
        </div>
      )}
    </section>
  );
}
