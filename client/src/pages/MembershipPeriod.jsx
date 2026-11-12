import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUserAuth } from "../context/UserAuthContext";
import userApi from "../userApi";
import ConfirmDialog from "../components/ui/ConfirmDialog";

const MEMBERSHIP_TERMS = [1, 3, 6, 12];

const labelForTerm = (months) => (
  Number(months) === 12 ? "1 year" : `${months} ${Number(months) === 1 ? "month" : "months"}`
);

export default function MembershipPeriod() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, updateUser, logoutUser } = useUserAuth();
  const [selectedMonths, setSelectedMonths] = useState(String(user?.membership_months || 1));
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);

  const refreshStatus = useCallback(async () => {
    const [profileResponse, requestResponse] = await Promise.all([
      userApi.get("/profile"),
      userApi.get("/profile/membership-request"),
    ]);
    const profile = profileResponse.data.data;
    const latestRequest = requestResponse.data.data;
    setRequest(latestRequest);
    if (latestRequest?.status === "Pending") {
      setSelectedMonths(String(latestRequest.membership_months));
    } else if (profile.membership_months) {
      setSelectedMonths(String(profile.membership_months));
      updateUser({
        membership_months: profile.membership_months,
        membership_start_date: profile.membership_start_date,
        membership_end_date: profile.membership_end_date,
      });
    }
    return { profile, latestRequest };
  }, [updateUser]);

  useEffect(() => {
    let active = true;
    Promise.all([userApi.get("/profile"), userApi.get("/profile/membership-request")])
      .then(([profileResponse, requestResponse]) => {
        if (!active) return;
        const profile = profileResponse.data.data;
        const latestRequest = requestResponse.data.data;
        setRequest(latestRequest);
        if (latestRequest?.status === "Pending") setSelectedMonths(String(latestRequest.membership_months));
        else if (profile.membership_months) setSelectedMonths(String(profile.membership_months));
        updateUser({
          membership_months: profile.membership_months,
          membership_start_date: profile.membership_start_date,
          membership_end_date: profile.membership_end_date,
        });
        if (!user?.membership_months && profile.membership_months && latestRequest?.status !== "Pending") {
          navigate(location.state?.from?.pathname || (profile.setup_completed ? "/user/profile" : "/user/assessment"), { replace: true });
        }
        setLoading(false);
      })
      .catch((loadError) => {
        if (active) {
          setError(loadError.response?.data?.message || "Unable to load your membership information.");
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [location.state, navigate, updateUser, user?.membership_months]);

  useEffect(() => {
    if (request?.status !== "Pending") return undefined;
    const timer = window.setInterval(() => {
      refreshStatus()
        .then(({ profile, latestRequest }) => {
          if (latestRequest?.status === "Approved" && profile.membership_months) {
            navigate(location.state?.from?.pathname || (user?.setup_completed ? "/user/profile" : "/user/assessment"), { replace: true });
          }
        })
        .catch((refreshError) => setError(refreshError.response?.data?.message || "Unable to refresh membership approval status."));
    }, 10000);
    return () => window.clearInterval(timer);
  }, [location.state, navigate, refreshStatus, request?.status, user?.setup_completed]);

  const submitRequest = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await userApi.post("/profile/membership-request", {
        membership_months: Number(selectedMonths),
      });
      setRequest(data.data);
    } catch (submitError) {
      setError(submitError.response?.data?.message || "Unable to submit your membership term for approval.");
    } finally {
      setSaving(false);
    }
  };

  const activeMembership = user?.membership_months
    ? `${labelForTerm(user.membership_months)}${user.membership_end_date ? ` · ends ${String(user.membership_end_date).slice(0, 10)}` : ""}`
    : "";
  const isPending = request?.status === "Pending";
  const isCurrentSelection = Number(selectedMonths) === Number(user?.membership_months);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-[#080808]">
      {confirmLogout && (
        <ConfirmDialog
          title="Log out of AveFit?"
          description="You will need to sign in again to access your account."
          confirmLabel="Log out"
          onCancel={() => setConfirmLogout(false)}
          onConfirm={logoutUser}
        />
      )}
      <section className="mx-auto max-w-xl rounded-3xl border border-orange-100 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-[#111] sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Membership</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">Choose your membership term</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Select a membership period. Your selection takes effect after administrator approval.</p>
        {activeMembership && (
          <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:bg-white/5 dark:text-slate-300">
            Current membership: <strong>{activeMembership}</strong>
          </p>
        )}

        {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading membership information...</p> : (
          <form onSubmit={submitRequest} className="mt-6 space-y-5">
            <label htmlFor="membership-term" className="block text-sm font-semibold text-slate-700 dark:text-slate-200">
              Membership period
              <select id="membership-term" value={selectedMonths} onChange={(event) => setSelectedMonths(event.target.value)} disabled={isPending} className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:opacity-60 dark:border-slate-700 dark:bg-[#171717] dark:text-white">
                {MEMBERSHIP_TERMS.map((months) => <option key={months} value={months}>{labelForTerm(months)}</option>)}
              </select>
            </label>

            {isPending && (
              <p role="status" className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-200">
                Your request for {labelForTerm(request.membership_months)} is awaiting administrator approval.
              </p>
            )}
            {request?.status === "Rejected" && <p className="text-sm text-red-600 dark:text-red-400">Your previous request was not approved. You may submit a new request.</p>}
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            {isPending ? (
              <button type="button" onClick={() => setConfirmLogout(true)} className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5">Log out</button>
            ) : (
              <button type="submit" disabled={saving || isCurrentSelection} className="min-h-12 w-full rounded-xl bg-orange-600 px-4 text-sm font-bold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? "Submitting..." : isCurrentSelection ? "This membership term is already active" : "Submit for approval"}
              </button>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
