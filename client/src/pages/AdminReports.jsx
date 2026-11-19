import { useMemo, useState } from "react";
import { BarChart3, CalendarDays, ClipboardList, Download, FileText, Printer, RefreshCw, Users } from "lucide-react";
import api from "../services/api";

const REPORT_TYPES = [
  { id: "operational", label: "Operational", description: "Member activity, membership dates, and completed workouts." },
  { id: "statistical", label: "Statistical", description: "Registration and workout trends, plus trainer workload." },
];

const getManilaDate = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getInitialRange = () => {
  const endDate = getManilaDate();
  const start = new Date(`${endDate}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 89);
  return { startDate: start.toISOString().slice(0, 10), endDate };
};

const formatDate = (value) => value ? String(value).slice(0, 10) : "—";
const formatNumber = (value) => new Intl.NumberFormat().format(Number(value) || 0);

const safeCsvCell = (value) => {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

const downloadCsv = (rows, filename) => {
  const csv = rows.map((row) => row.map(safeCsvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const buildOperationalCsv = (report) => [
  ["Operational report", `${report.period.start_date} to ${report.period.end_date}`],
  [],
  ["Summary", "Count"],
  ["Active accounts", report.summary.active_accounts],
  ["Pending accounts", report.summary.pending_accounts],
  ["Memberships ending in range", report.summary.memberships_ending],
  ["Completed workouts in range", report.summary.completed_workouts],
  [],
  ["Registrations", "Member", "Email", "Account status", "Joined", "Membership ends", "Trainer"],
  ...report.registrations.map((row) => [
    "Registration", row.member_name, row.email, row.account_status, formatDate(row.joined_date),
    formatDate(row.membership_end_date), row.trainer_name,
  ]),
  [],
  ["Memberships ending", "Member", "Email", "Membership starts", "Membership ends", "Account status", "Trainer"],
  ...report.memberships_ending.map((row) => [
    "Membership ending", row.member_name, row.email, formatDate(row.membership_start_date),
    formatDate(row.membership_end_date), row.account_status, row.trainer_name,
  ]),
  [],
  ["Completed workouts", "Member", "Plan", "Trainer", "Completed"],
  ...report.completed_workouts.map((row) => [
    "Completed workout", row.member_name, row.plan_name, row.trainer_name, formatDate(row.completed_date),
  ]),
];

const buildStatisticalCsv = (report) => [
  ["Statistical report", `${report.period.start_date} to ${report.period.end_date}`],
  [],
  ["Monthly trends", "Registrations", "Completed workouts"],
  ...report.monthly_trends.map((row) => [row.period, row.registrations, row.completed_workouts]),
  [],
  ["Trainer workload"],
  ["Trainer", "Status", "Active members", "Completed workouts"],
  ...report.trainer_workload.map((row) => [
    row.trainer_name, row.trainer_status, row.active_members, row.completed_workouts,
  ]),
];

function ReportTable({ title, description, columns, rows, emptyMessage }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-5">
        <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </div>
      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/60">
              <tr>{columns.map((column) => <th key={column.key} scope="col" className="px-4 py-3 font-semibold">{column.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, index) => (
                <tr key={row.user_id || row.session_id || row.trainer_id || `${title}-${index}`} className="text-slate-700 dark:text-slate-200">
                  {columns.map((column) => (
                    <td key={column.key} className="max-w-xs px-4 py-3 align-top">
                      {column.render ? column.render(row[column.key], row) : (row[column.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-8 text-center text-sm text-slate-500">{emptyMessage}</p>
      )}
    </section>
  );
}

function SummaryCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500/10 text-orange-500"><Icon size={18} /></span>
      </div>
      <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white">{formatNumber(value)}</p>
    </div>
  );
}

export default function AdminReports() {
  const [range, setRange] = useState(getInitialRange);
  const [type, setType] = useState("operational");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const reportRows = useMemo(() => {
    if (!report) return [];
    return report.type === "operational" ? buildOperationalCsv(report) : buildStatisticalCsv(report);
  }, [report]);

  const handleGenerate = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await api.get("/admin/reports", {
        params: {
          type,
          start_date: range.startDate,
          end_date: range.endDate,
        },
      });
      setReport(response.data.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to generate the report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (field, value) => {
    setRange((current) => ({ ...current, [field]: value }));
  };

  const exportReport = () => {
    if (!report || !reportRows.length) return;
    downloadCsv(reportRows, `avefit-${report.type}-report-${report.period.start_date}-to-${report.period.end_date}.csv`);
  };

  const totalRegistrations = report?.type === "statistical"
    ? report.monthly_trends.reduce((total, row) => total + Number(row.registrations || 0), 0)
    : 0;
  const totalCompletedWorkouts = report?.type === "statistical"
    ? report.monthly_trends.reduce((total, row) => total + Number(row.completed_workouts || 0), 0)
    : 0;
  const maxTrendValue = report?.type === "statistical"
    ? Math.max(1, ...report.monthly_trends.flatMap((row) => [Number(row.registrations), Number(row.completed_workouts)]))
    : 1;

  return (
    <div className="admin-reports-page space-y-6">
      <header className="admin-report-controls ave-page-hero rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-orange-500/10 text-orange-600 dark:text-orange-400"><FileText size={23} /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Admin tools</p>
            <h1 className="mt-1 text-3xl font-black text-slate-900 dark:text-white">Reports</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">Generate operational snapshots or statistical trends when you need them, then export a CSV or print/save as PDF.</p>
          </div>
        </div>
      </header>

      <section className="admin-report-controls rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
        <div role="tablist" aria-label="Report type" className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-950">
          {REPORT_TYPES.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={type === option.id}
              onClick={() => {
                setType(option.id);
                setReport(null);
                setError("");
              }}
              className={`rounded-lg px-3 py-2.5 text-sm font-bold transition ${
                type === option.id
                  ? "bg-white text-orange-600 shadow-sm dark:bg-slate-800 dark:text-orange-300"
                  : "text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">{REPORT_TYPES.find((option) => option.id === type)?.description}</p>
        <form onSubmit={handleGenerate} className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <label className="flex-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            Start date
            <span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
              <CalendarDays size={16} className="text-slate-400" />
              <input
                type="date"
                required
                value={range.startDate}
                onChange={(event) => handleDateChange("startDate", event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none dark:text-white"
              />
            </span>
          </label>
          <label className="flex-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            End date
            <span className="mt-1.5 flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
              <CalendarDays size={16} className="text-slate-400" />
              <input
                type="date"
                required
                value={range.endDate}
                onChange={(event) => handleDateChange("endDate", event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none dark:text-white"
              />
            </span>
          </label>
          <button type="submit" disabled={loading} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-bold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60">
            {loading ? <RefreshCw size={17} className="animate-spin" /> : <ClipboardList size={17} />}
            {loading ? "Generating..." : "Generate report"}
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-500">Choose a range of up to 366 days. Reports are generated only when requested. Workout completions reflect recorded workouts, not separate gym check-ins.</p>
      </section>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

      {report && (
        <section aria-live="polite" className="admin-report-print space-y-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">{report.type === "operational" ? "Operational report" : "Statistical report"}</h2>
              <p className="mt-1 text-xs text-slate-500">{formatDate(report.period.start_date)} – {formatDate(report.period.end_date)}</p>
            </div>
            <div className="admin-report-export flex flex-wrap gap-2">
              <button type="button" onClick={exportReport} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-orange-300">
                <Download size={16} /> Export CSV
              </button>
              <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:text-orange-300">
                <Printer size={16} /> Print / Save PDF
              </button>
            </div>
          </div>

          {report.type === "operational" ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Active accounts" value={report.summary.active_accounts} icon={Users} />
                <SummaryCard label="Pending accounts" value={report.summary.pending_accounts} icon={Users} />
                <SummaryCard label="Memberships ending in range" value={report.summary.memberships_ending} icon={CalendarDays} />
                <SummaryCard label="Completed workouts in range" value={report.summary.completed_workouts} icon={BarChart3} />
              </div>
              <p className="text-xs text-slate-500">Active and pending account totals are current snapshots; the remaining report rows and counts use the selected date range.</p>
              <ReportTable
                title="New registrations"
                description="Accounts created within the selected period."
                rows={report.registrations}
                emptyMessage="No registrations were recorded during this period."
                columns={[
                  { key: "member_name", label: "Member" },
                  { key: "email", label: "Email" },
                  { key: "account_status", label: "Account status" },
                  { key: "joined_date", label: "Joined", render: formatDate },
                  { key: "membership_end_date", label: "Membership ends", render: formatDate },
                  { key: "trainer_name", label: "Trainer" },
                ]}
              />
              <ReportTable
                title="Memberships ending"
                description="Membership terms with an end date inside the selected period."
                rows={report.memberships_ending}
                emptyMessage="No membership end dates fall in this period."
                columns={[
                  { key: "member_name", label: "Member" },
                  { key: "email", label: "Email" },
                  { key: "membership_start_date", label: "Started", render: formatDate },
                  { key: "membership_end_date", label: "Ends", render: formatDate },
                  { key: "account_status", label: "Account status" },
                  { key: "trainer_name", label: "Trainer" },
                ]}
              />
              <ReportTable
                title="Completed workouts"
                description="Completed workout sessions with a recorded completion or scheduled date in this period."
                rows={report.completed_workouts}
                emptyMessage="No dated completed workouts were recorded during this period."
                columns={[
                  { key: "member_name", label: "Member" },
                  { key: "plan_name", label: "Workout plan" },
                  { key: "trainer_name", label: "Trainer" },
                  { key: "completed_date", label: "Completed", render: formatDate },
                ]}
              />
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryCard label="Registrations in period" value={totalRegistrations} icon={Users} />
                <SummaryCard label="Completed workouts in period" value={totalCompletedWorkouts} icon={BarChart3} />
              </div>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
                <div className="mb-4">
                  <h3 className="font-bold text-slate-900 dark:text-white">Monthly activity trends</h3>
                  <p className="mt-1 text-xs text-slate-500">Registrations and completed workouts grouped by calendar month.</p>
                </div>
                {report.monthly_trends.length ? (
                  <div className="space-y-4">
                    {report.monthly_trends.map((row) => (
                      <div key={row.period} className="grid gap-2 sm:grid-cols-[100px_1fr] sm:items-center">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{row.period}</p>
                        <div className="space-y-1.5">
                          {[
                            ["Registrations", Number(row.registrations), "bg-orange-500"],
                            ["Completed workouts", Number(row.completed_workouts), "bg-emerald-500"],
                          ].map(([label, count, color]) => (
                            <div key={label} className="flex items-center gap-2">
                              <span className="w-32 shrink-0 text-[11px] text-slate-500">{label}</span>
                              <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, (count / maxTrendValue) * 100)}%` }} />
                              </div>
                              <span className="w-10 text-right text-xs font-bold text-slate-700 dark:text-slate-200">{formatNumber(count)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-slate-500">No trend data is available for this period.</p>
                )}
              </section>
              <ReportTable
                title="Trainer workload"
                description="Current active assigned members compared with completed workouts in the selected period."
                rows={report.trainer_workload}
                emptyMessage="No trainer records are available."
                columns={[
                  { key: "trainer_name", label: "Trainer" },
                  { key: "trainer_status", label: "Status" },
                  { key: "active_members", label: "Active assigned members", render: formatNumber },
                  { key: "completed_workouts", label: "Completed workouts", render: formatNumber },
                ]}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}
