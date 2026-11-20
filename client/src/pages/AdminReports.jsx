import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CalendarDays, ChevronDown, ClipboardList, Download, FileText, Printer, RefreshCw, Search, Users } from "lucide-react";
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
const formatPercentChange = (current, previous) => {
  const currentValue = Number(current) || 0;
  const previousValue = Number(previous) || 0;
  if (previousValue === 0) return currentValue === 0 ? "0%" : "New";
  const change = ((currentValue - previousValue) / previousValue) * 100;
  return `${change > 0 ? "+" : ""}${change.toFixed(1)}%`;
};

const getComparisonMaximum = (current, previous) => Math.max(Number(current) || 0, Number(previous) || 0, 1);

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
  [],
  ["Equipment status"],
  ["Equipment", "Quantity", "Status", "Condition", "Condition details", "Last updated"],
  ...report.equipment.items.map((row) => [
    row.equipment_name, row.quantity, row.status, row.condition, row.condition_notes, formatDate(row.updated_at),
  ]),
  [],
  ["Coach roster and capacity"],
  ["Coach", "Status", "Assigned roster", "Total capacity", "Available capacity"],
  ...report.coaches.roster.map((row) => [
    row.trainer_name, row.trainer_status, row.roster_count, row.total_capacity, row.available_capacity,
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
  [],
  ["Active member growth comparison", "Selected period", report.member_growth.current_count,
    "Previous period", report.member_growth.previous_count,
    "Change", formatPercentChange(report.member_growth.current_count, report.member_growth.previous_count)],
  [],
  ["Equipment usage comparison", "Equipment", "Selected period", "Previous period", "Change"],
  ...report.equipment_usage.map((row) => [
    "Equipment", row.equipment, row.current_count, row.previous_count, formatPercentChange(row.current_count, row.previous_count),
  ]),
  [],
  ["Workout starts by hour", "Hour", "Selected period", "Previous period", "Change"],
  ...report.busiest_hours.map((row) => [
    "Workout start", formatHour(row.hour), row.current_count, row.previous_count, formatPercentChange(row.current_count, row.previous_count),
  ]),
];

const formatHour = (hour) => {
  const value = Number(hour);
  const suffix = value < 12 ? "AM" : "PM";
  return `${value % 12 || 12} ${suffix}`;
};

function ComparisonBars({ current, previous, currentLabel = "Selected period", previousLabel = "Previous period" }) {
  const maximum = getComparisonMaximum(current, previous);
  return (
    <div className="space-y-2">
      {[
        [currentLabel, Number(current) || 0, "bg-orange-500"],
        [previousLabel, Number(previous) || 0, "bg-slate-400"],
      ].map(([label, count, color]) => (
        <div key={label} className="flex items-center gap-2">
          <span className="w-28 shrink-0 text-[11px] text-slate-500">{label}</span>
          <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${(count / maximum) * 100}%` }} />
          </div>
          <span className="w-10 text-right text-xs font-bold text-slate-700 dark:text-slate-200">{formatNumber(count)}</span>
        </div>
      ))}
    </div>
  );
}

function ReportTable({ title, description, columns, rows, emptyMessage, highlightRow, compact = false }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800 sm:px-5">
        <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
        {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      </div>
      {rows.length ? (
        <div className={`overflow-x-auto ${compact ? "max-h-72 overflow-y-auto" : ""}`}>
          <table className="w-full min-w-[650px] text-left text-sm">
            <thead className={`bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-950/60 ${compact ? "sticky top-0 z-10" : ""}`}>
              <tr>{columns.map((column) => <th key={column.key} scope="col" className={`font-semibold ${compact ? "px-3 py-2" : "px-4 py-3"}`}>{column.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((row, index) => (
                <tr
                  key={row.user_id || row.session_id || row.equipment_id || row.trainer_id || `${title}-${index}`}
                  className={`text-slate-700 dark:text-slate-200 ${highlightRow?.(row) ? "bg-orange-500/10 outline outline-1 outline-orange-400/40" : ""}`}
                >
                  {columns.map((column) => (
                    <td key={column.key} className={`max-w-xs align-top ${compact ? "px-3 py-2" : "px-4 py-3"}`}>
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

function CollapsibleReportList({
  id,
  title,
  description,
  rows,
  columns,
  emptyMessage,
  searchPlaceholder,
  searchFields,
  filters,
}) {
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState({});
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleRows = rows.filter((row) => {
    const matchesSearch = !normalizedSearch || searchFields.some((field) =>
      String(row[field] || "").toLocaleLowerCase().includes(normalizedSearch)
    );
    const matchesFilters = filters.every(({ key }) =>
      !filterValues[key] || String(row[key] ?? "") === filterValues[key]
    );
    return matchesSearch && matchesFilters;
  });
  const hasActiveFilters = Boolean(normalizedSearch) || Object.values(filterValues).some(Boolean);

  return (
    <details id={id} className="group rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:hidden sm:px-5">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-slate-900 dark:text-white">{title}</span>
          <span className="mt-1 block text-xs text-slate-500">{description}</span>
        </span>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {hasActiveFilters ? `${visibleRows.length} / ${rows.length}` : rows.length}
        </span>
        <ChevronDown size={18} className="shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-slate-200 p-3 dark:border-slate-800 sm:p-4">
        <div className={`grid gap-3 ${filters.length ? "sm:grid-cols-2" : ""}`}>
          <label className="relative block">
            <span className="sr-only">{searchPlaceholder}</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
          </label>
          {filters.map(({ key, label, options }) => (
            <label key={key} className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <span className="shrink-0">{label}</span>
              <select
                value={filterValues[key] || ""}
                onChange={(event) => setFilterValues((current) => ({ ...current, [key]: event.target.value }))}
                className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-orange-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">All</option>
                {options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          ))}
        </div>
        <ReportTable
          title={`${title} details`}
          description=""
          rows={visibleRows}
          emptyMessage={rows.length && hasActiveFilters ? "No records match your search and filters." : emptyMessage}
          columns={columns}
          compact
        />
      </div>
    </details>
  );
}

function SummaryCard({ label, value, icon: Icon, onClick }) {
  const className = `rounded-2xl border border-slate-200 bg-white p-4 text-left transition dark:border-slate-800 dark:bg-slate-900 ${
    onClick ? "cursor-pointer hover:border-orange-400 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500" : ""
  }`;
  const contents = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-orange-500/10 text-orange-500"><Icon size={18} /></span>
      </div>
      <p className="mt-3 text-2xl font-black text-slate-900 dark:text-white">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {onClick && <span className="mt-2 block text-[11px] font-semibold text-orange-600 dark:text-orange-300">Click to view details</span>}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className={className} aria-label={`${label}: ${value}. Click to view details.`}>
      {contents}
    </button>
  ) : (
    <div className={className}>{contents}</div>
  );
}

export default function AdminReports() {
  const [range, setRange] = useState(getInitialRange);
  const [type, setType] = useState("operational");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [equipmentAttentionOnly, setEquipmentAttentionOnly] = useState(false);
  const [equipmentDetailsOpen, setEquipmentDetailsOpen] = useState(false);
  const [coachDetailsOpen, setCoachDetailsOpen] = useState(false);
  const [highlightedTarget, setHighlightedTarget] = useState("");
  const equipmentTableRef = useRef(null);
  const coachTableRef = useRef(null);
  const focusTimeoutRef = useRef(null);

  useEffect(() => () => window.clearTimeout(focusTimeoutRef.current), []);

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
      setEquipmentAttentionOnly(false);
      setEquipmentDetailsOpen(false);
      setCoachDetailsOpen(false);
      setHighlightedTarget("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to generate the report. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (field, value) => {
    setRange((current) => ({ ...current, [field]: value }));
  };

  const jumpToReportDetails = (target) => {
    if (target === "equipment") {
      setEquipmentAttentionOnly(true);
      setEquipmentDetailsOpen(true);
    } else {
      setCoachDetailsOpen(true);
    }
    setHighlightedTarget(target);
    window.clearTimeout(focusTimeoutRef.current);
    window.requestAnimationFrame(() => {
      const element = target === "equipment" ? equipmentTableRef.current : coachTableRef.current;
      element?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    focusTimeoutRef.current = window.setTimeout(() => setHighlightedTarget(""), 3000);
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
  const busiestHour = report?.type === "statistical"
    ? report.busiest_hours.reduce((busiest, row) => Number(row.current_count) > Number(busiest?.current_count || 0) ? row : busiest, null)
    : null;
  const registrationStatuses = report?.type === "operational"
    ? [...new Set(report.registrations.map((row) => row.account_status).filter(Boolean))].sort()
    : [];
  const registrationTrainers = report?.type === "operational"
    ? [...new Set(report.registrations.map((row) => row.trainer_name).filter(Boolean))].sort()
    : [];
  const membershipStatuses = report?.type === "operational"
    ? [...new Set(report.memberships_ending.map((row) => row.account_status).filter(Boolean))].sort()
    : [];
  const membershipTrainers = report?.type === "operational"
    ? [...new Set(report.memberships_ending.map((row) => row.trainer_name).filter(Boolean))].sort()
    : [];
  const workoutTrainers = report?.type === "operational"
    ? [...new Set(report.completed_workouts.map((row) => row.trainer_name).filter(Boolean))].sort()
    : [];

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
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard label="Equipment types" value={report.equipment.summary.equipment_types} icon={BarChart3} />
                <SummaryCard label="Equipment units" value={report.equipment.summary.equipment_units} icon={BarChart3} />
                <SummaryCard
                  label="Units not in service"
                  value={report.equipment.summary.equipment_needing_attention}
                  icon={CalendarDays}
                  onClick={() => jumpToReportDetails("equipment")}
                />
                <SummaryCard
                  label="Coach roster / total capacity"
                  value={`${formatNumber(report.coaches.summary.roster_count)} / ${formatNumber(report.coaches.summary.total_capacity)}`}
                  icon={Users}
                  onClick={() => jumpToReportDetails("coaches")}
                />
              </div>
              <p className="text-xs text-slate-500">Active and pending account totals are current snapshots; the remaining report rows and counts use the selected date range.</p>
              <CollapsibleReportList
                key={`registrations-${report.period.start_date}-${report.period.end_date}`}
                id="new-registrations"
                title="New registrations"
                description="Accounts created within the selected period."
                rows={report.registrations}
                emptyMessage="No registrations were recorded during this period."
                searchPlaceholder="Search member name or email"
                searchFields={["member_name", "email"]}
                filters={[
                  { key: "account_status", label: "Status", options: registrationStatuses },
                  { key: "trainer_name", label: "Trainer", options: registrationTrainers },
                ]}
                columns={[
                  { key: "member_name", label: "Member" },
                  { key: "email", label: "Email" },
                  { key: "account_status", label: "Account status" },
                  { key: "joined_date", label: "Joined", render: formatDate },
                  { key: "membership_end_date", label: "Membership ends", render: formatDate },
                  { key: "trainer_name", label: "Trainer" },
                ]}
              />
              <CollapsibleReportList
                key={`memberships-ending-${report.period.start_date}-${report.period.end_date}`}
                id="memberships-ending"
                title="Memberships ending"
                description="Membership terms with an end date inside the selected period."
                rows={report.memberships_ending}
                emptyMessage="No membership end dates fall in this period."
                searchPlaceholder="Search member name or email"
                searchFields={["member_name", "email"]}
                filters={[
                  { key: "account_status", label: "Status", options: membershipStatuses },
                  { key: "trainer_name", label: "Trainer", options: membershipTrainers },
                ]}
                columns={[
                  { key: "member_name", label: "Member" },
                  { key: "email", label: "Email" },
                  { key: "membership_start_date", label: "Started", render: formatDate },
                  { key: "membership_end_date", label: "Ends", render: formatDate },
                  { key: "account_status", label: "Account status" },
                  { key: "trainer_name", label: "Trainer" },
                ]}
              />
              <CollapsibleReportList
                key={`completed-workouts-${report.period.start_date}-${report.period.end_date}`}
                id="completed-workouts"
                title="Completed workouts"
                description="Completed workout sessions with a recorded completion or scheduled date in this period."
                rows={report.completed_workouts}
                emptyMessage="No dated completed workouts were recorded during this period."
                searchPlaceholder="Search member name or workout plan"
                searchFields={["member_name", "plan_name"]}
                filters={[
                  { key: "trainer_name", label: "Trainer", options: workoutTrainers },
                ]}
                columns={[
                  { key: "member_name", label: "Member" },
                  { key: "plan_name", label: "Workout plan" },
                  { key: "trainer_name", label: "Trainer" },
                  { key: "completed_date", label: "Completed", render: formatDate },
                ]}
              />
              <div
                ref={equipmentTableRef}
                id="report-equipment-status"
                tabIndex={-1}
                className={`scroll-mt-24 rounded-2xl transition-shadow ${highlightedTarget === "equipment" ? "ring-2 ring-orange-400 ring-offset-2 dark:ring-offset-slate-950" : ""}`}
              >
                <button
                  type="button"
                  aria-expanded={equipmentDetailsOpen}
                  aria-controls="report-equipment-status-details"
                  onClick={() => setEquipmentDetailsOpen((open) => !open)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-orange-300 dark:border-slate-800 dark:bg-slate-900"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">Equipment status</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {equipmentAttentionOnly
                        ? `${report.equipment.summary.equipment_needing_attention} units not in service`
                        : `${report.equipment.summary.equipment_types} equipment types · Current inventory snapshot`}
                    </span>
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {equipmentAttentionOnly ? report.equipment.summary.equipment_needing_attention : report.equipment.summary.equipment_types}
                  </span>
                  <ChevronDown size={18} className={`shrink-0 text-slate-500 transition-transform ${equipmentDetailsOpen ? "rotate-180" : ""}`} />
                </button>
                {equipmentDetailsOpen && (
                  <div id="report-equipment-status-details" className="mt-2">
                    {equipmentAttentionOnly && (
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs text-orange-800 dark:border-orange-400/20 dark:bg-orange-500/10 dark:text-orange-200">
                        <span>Showing equipment units not in service.</span>
                        <button type="button" onClick={() => setEquipmentAttentionOnly(false)} className="font-bold underline underline-offset-2">Show all equipment</button>
                      </div>
                    )}
                    <ReportTable
                      title="Equipment status details"
                      description="Status and condition by equipment type."
                      rows={equipmentAttentionOnly
                        ? report.equipment.items.filter((item) => item.status !== "In service")
                        : report.equipment.items}
                      emptyMessage={equipmentAttentionOnly
                        ? "No equipment units need attention."
                        : "No equipment inventory records are available."}
                      highlightRow={equipmentAttentionOnly ? (item) => item.status !== "In service" : undefined}
                      compact
                      columns={[
                        { key: "equipment_name", label: "Equipment" },
                        { key: "quantity", label: "Quantity", render: formatNumber },
                        { key: "status", label: "Status" },
                        { key: "condition", label: "Condition" },
                        { key: "condition_notes", label: "Condition details" },
                        { key: "updated_at", label: "Updated", render: formatDate },
                      ]}
                    />
                  </div>
                )}
              </div>
              <div
                ref={coachTableRef}
                id="report-coach-roster"
                tabIndex={-1}
                className={`scroll-mt-24 rounded-2xl transition-shadow ${highlightedTarget === "coaches" ? "ring-2 ring-orange-400 ring-offset-2 dark:ring-offset-slate-950" : ""}`}
              >
                <button
                  type="button"
                  aria-expanded={coachDetailsOpen}
                  aria-controls="report-coach-roster-details"
                  onClick={() => setCoachDetailsOpen((open) => !open)}
                  className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-orange-300 dark:border-slate-800 dark:bg-slate-900"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-900 dark:text-white">Coach roster and capacity</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {formatNumber(report.coaches.summary.roster_count)} assigned members · {formatNumber(report.coaches.summary.total_capacity)} total slots · {formatNumber(report.coaches.summary.available_capacity)} available
                    </span>
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {report.coaches.summary.coach_count}
                  </span>
                  <ChevronDown size={18} className={`shrink-0 text-slate-500 transition-transform ${coachDetailsOpen ? "rotate-180" : ""}`} />
                </button>
                {coachDetailsOpen && (
                  <div id="report-coach-roster-details" className="mt-2">
                    <ReportTable
                      title="Coach roster details"
                      description={`Roster rows with assigned members are highlighted. Across ${formatNumber(report.coaches.summary.coach_count)} coaches.`}
                      rows={report.coaches.roster}
                      emptyMessage="No coach records are available."
                      highlightRow={highlightedTarget === "coaches" ? (coach) => Number(coach.roster_count) > 0 : undefined}
                      compact
                      columns={[
                        { key: "trainer_name", label: "Coach" },
                        { key: "trainer_status", label: "Status" },
                        { key: "roster_count", label: "Assigned roster", render: formatNumber },
                        { key: "total_capacity", label: "Total capacity", render: formatNumber },
                        { key: "available_capacity", label: "Available capacity", render: formatNumber },
                      ]}
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryCard label="Active member registrations" value={totalRegistrations} icon={Users} />
                <SummaryCard label="Completed workouts in period" value={totalCompletedWorkouts} icon={BarChart3} />
              </div>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Member growth comparison</h3>
                    <p className="mt-1 text-xs text-slate-500">Active member registrations: selected period vs the preceding {report.period.comparison_start_date} – {report.period.comparison_end_date}.</p>
                  </div>
                  <span className="rounded-full bg-orange-500/10 px-3 py-1 text-xs font-bold text-orange-700 dark:text-orange-300">
                    {formatPercentChange(report.member_growth.current_count, report.member_growth.previous_count)}
                  </span>
                </div>
                <ComparisonBars current={report.member_growth.current_count} previous={report.member_growth.previous_count} />
              </section>
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
              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
                <div className="mb-4">
                  <h3 className="font-bold text-slate-900 dark:text-white">Most used equipment comparison</h3>
                  <p className="mt-1 text-xs text-slate-500">Counts are completed workout exercise records tagged with each equipment type; they are not inventory checkouts.</p>
                </div>
                {report.equipment_usage.length ? (
                  <div className="space-y-4">
                    {report.equipment_usage.map((row) => (
                      <div key={row.equipment} className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{row.equipment}</span>
                          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{formatPercentChange(row.current_count, row.previous_count)}</span>
                        </div>
                        <ComparisonBars current={row.current_count} previous={row.previous_count} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-8 text-center text-sm text-slate-500">No completed workout equipment usage was recorded in either period.</p>
                )}
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-white">Busiest workout start hour</h3>
                    <p className="mt-1 text-xs text-slate-500">Compared using recorded workout start times in Philippine time.</p>
                  </div>
                  {busiestHour && Number(busiestHour.current_count) > 0 && (
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      Peak: {formatHour(busiestHour.hour)} · {formatNumber(busiestHour.current_count)}
                    </span>
                  )}
                </div>
                <div className="space-y-3">
                  {report.busiest_hours.map((row) => (
                    <div key={row.hour} className="grid gap-2 sm:grid-cols-[60px_1fr_auto] sm:items-center">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{formatHour(row.hour)}</span>
                      <ComparisonBars current={row.current_count} previous={row.previous_count} currentLabel="Selected" previousLabel="Previous" />
                      <span className="w-fit rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{formatPercentChange(row.current_count, row.previous_count)}</span>
                    </div>
                  ))}
                </div>
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
