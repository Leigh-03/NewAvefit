import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, ReceiptText } from "lucide-react";
import { useUserAuth } from "../context/UserAuthContext";
import userApi from "../userApi";

export default function MembershipPeriod() {
  const navigate = useNavigate();
  const { user, updateUser } = useUserAuth();
  const [months, setMonths] = useState(() => String(user?.membership_months || 1));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const saveTerm = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await userApi.post("/profile/membership", { membership_months: Number(months) });
      updateUser({
        membership_months: data.data.membership_months,
        membership_start_date: data.data.membership_start_date,
        membership_end_date: data.data.membership_end_date,
      });
      navigate(user?.setup_completed ? "/user/workout" : "/user/assessment", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to save your membership term. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Membership setup</p>
        <h1 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Choose your membership period</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Select a term from 1 to 12 months. Saving starts the selected period today, and your account will continue to setup.
        </p>
      </header>

      <form onSubmit={saveTerm} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-7">
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
          Membership term
          <span className="relative mt-2 block">
            <CalendarDays size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-orange-500" />
            <select
              value={months}
              onChange={(event) => setMonths(event.target.value)}
              className="min-h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-white/10 dark:bg-[#171717] dark:text-white"
            >
              {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => (
                <option key={count} value={count}>{count === 12 ? "1 year (12 months)" : `${count} ${count === 1 ? "month" : "months"}`}</option>
              ))}
            </select>
          </span>
        </label>

        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-500/20 dark:bg-orange-500/10">
          <div className="flex items-center gap-2 text-orange-800 dark:text-orange-200">
            <ReceiptText size={18} />
            <p className="text-sm font-semibold">Membership total</p>
          </div>
          <p className="mt-2 text-3xl font-black text-slate-900 dark:text-white">₱{Number(months) * 100}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">₱100 per month × {months} {Number(months) === 1 ? "month" : "months"}</p>
        </div>

        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          This amount is shown for reference only. Online payment is not available; please settle it with the gym.
        </p>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
        <button type="submit" disabled={saving} className="min-h-12 w-full rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-60">
          {saving ? "Saving..." : "Save membership term"}
        </button>
      </form>
    </main>
  );
}
