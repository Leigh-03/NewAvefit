import { useEffect, useMemo, useState } from "react";
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from "chart.js";
import { Line } from "react-chartjs-2";
import { X } from "lucide-react";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

function formatDate(value) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T12:00:00Z`)
    : new Date(value);
  return new Intl.DateTimeFormat("en-PH", { dateStyle: "medium" }).format(date);
}

export default function ProgressHistoryModal({ member, fetchProgress, onClose }) {
  const memberId = member?.member_id ?? member?.user_id;
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    fetchProgress(memberId)
      .then((response) => {
        const rows = Array.isArray(response) ? response : response?.data?.data ?? response?.data ?? [];
        if (active) {
          setEntries(Array.isArray(rows)
            ? [...rows].sort((first, second) => String(first.log_date).localeCompare(String(second.log_date)))
            : []);
        }
      })
      .catch((requestError) => {
        if (active) setError(requestError.response?.data?.message || "Unable to load progress history.");
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [fetchProgress, memberId]);

  const chartData = useMemo(() => ({
    labels: entries.map((entry) => formatDate(entry.log_date)),
    datasets: [
      {
        label: "Weight (kg)",
        data: entries.map((entry) => entry.weight === null ? null : Number(entry.weight)),
        borderColor: "#f97316",
        backgroundColor: "#f97316",
        tension: 0.3,
        spanGaps: true,
        yAxisID: "weight",
      },
      {
        label: "BMI",
        data: entries.map((entry) => entry.bmi === null ? null : Number(entry.bmi)),
        borderColor: "#38bdf8",
        backgroundColor: "#38bdf8",
        tension: 0.3,
        spanGaps: true,
        yAxisID: "bmi",
      },
    ],
  }), [entries]);

  if (!member) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="member-progress-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-[#151515] sm:p-7" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="member-progress-title" className="text-xl font-bold text-slate-900 dark:text-white">{member.full_name || `${member.first_name || ""} ${member.last_name || ""}`.trim()}'s Progress</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Recorded body measurements and progress history.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close progress history" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"><X size={20} /></button>
        </div>
        {loading ? <p className="py-12 text-center text-sm text-slate-500">Loading progress history…</p>
          : error ? <p role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>
            : entries.length ? (
              <>
                <div className="mt-6 h-72 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                  <Line data={chartData} options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { intersect: false, mode: "index" },
                    plugins: { legend: { position: "bottom", labels: { color: "#94a3b8", usePointStyle: true } } },
                    scales: {
                      x: { ticks: { color: "#94a3b8", maxRotation: 45, minRotation: 0 }, grid: { color: "rgba(148,163,184,0.12)" } },
                      weight: { type: "linear", position: "left", title: { display: true, text: "Weight (kg)", color: "#94a3b8" }, ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.12)" } },
                      bmi: { type: "linear", position: "right", title: { display: true, text: "BMI", color: "#94a3b8" }, ticks: { color: "#94a3b8" }, grid: { drawOnChartArea: false } },
                    },
                  }} />
                </div>
                <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-white/5">
                      <tr>
                        {["Date", "Weight", "BMI", "Body fat"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {[...entries].reverse().map((entry, index) => (
                        <tr key={entry.log_id || `${entry.log_date}-${entry.weight}-${index}`}>
                          <td className="px-4 py-3">{formatDate(entry.log_date)}</td>
                          <td className="px-4 py-3">{entry.weight ?? "—"}{entry.weight != null ? " kg" : ""}</td>
                          <td className="px-4 py-3">{entry.bmi ?? "—"}</td>
                          <td className="px-4 py-3">{entry.body_fat ?? "—"}{entry.body_fat != null ? "%" : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : <p className="mt-6 rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500 dark:bg-white/5">No progress entries have been recorded yet.</p>}
      </section>
    </div>
  );
}
