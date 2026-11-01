import { useEffect, useState } from "react";
import { Search, CheckCircle, XCircle, Trash2, X, UserRoundCog, UserRound, Save, KeyRound, ShieldCheck } from "lucide-react";
import api from "../services/api";
import ConfirmDialog from "../components/ui/ConfirmDialog";

const statusColors = {
  Active: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  Pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-400",
  Inactive: "bg-slate-100 text-slate-500 dark:bg-slate-700/50 dark:text-slate-400",
};

const MEMBER_STATUS_OPTIONS = ["Active", "Inactive"];
const PROFILE_CHANGE_LABELS = {
  first_name: "First name",
  last_name: "Last name",
  email: "Email",
  phone: "Phone",
  gender: "Gender",
  birth_date: "Birth date",
  age: "Age",
  height: "Height",
  weight: "Weight",
  fitness_goal: "Fitness goal",
  activity_level: "Experience level",
  target_weight: "Target weight",
  workout_days_per_week: "Workout days per week",
  workout_duration: "Workout duration",
  preferred_days: "Preferred days",
  weekly_availability: "Weekly workout availability",
  preferred_workout_time: "Preferred workout time",
  intensity: "Preferred intensity",
  injuries: "Injuries",
  health_conditions: "Health conditions",
  profile_photo_changed: "Profile photo",
};

const formatChangeValue = (value) => {
  if (value === null || value === undefined || value === "") return "Not set";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None";
  const schedule = typeof value === "object" ? value.weekly_availability || value : null;
  if (schedule && Array.isArray(schedule.availability)) {
    const days = schedule.availability.map((slot) => (
      `${slot.day_of_week} (${slot.time_preference || `${slot.start_time}-${slot.end_time}`})`
    ));
    const frequency = schedule.workout_days_per_week ? `${schedule.workout_days_per_week} workout days/week` : "";
    const duration = schedule.workout_duration ? `${schedule.workout_duration} min/session` : "";
    const level = schedule.activity_level || "";
    return [...days, frequency, duration, level].filter(Boolean).join(" · ") || "No availability selected";
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

function getBMICategory(bmi) {
  if (!bmi) return { label: "N/A", color: "text-slate-400" };
  if (bmi < 18.5) return { label: "Underweight", color: "text-orange-500" };
  if (bmi < 25) return { label: "Normal", color: "text-green-600 dark:text-green-400" };
  if (bmi < 30) return { label: "Overweight", color: "text-orange-500" };
  return { label: "Obese", color: "text-red-500" };
}

const getManilaToday = () => {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const formatMembershipDate = (date) => {
  if (!date) return "—";
  const [year, month, day] = String(date).slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
};

const getMembershipEndDate = (startDate, months) => {
  if (!startDate || !months) return null;
  const [year, month, day] = String(startDate).slice(0, 10).split("-").map(Number);
  const targetMonth = month - 1 + Number(months);
  const lastDayOfTargetMonth = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const endDate = new Date(Date.UTC(year, targetMonth, Math.min(day, lastDayOfTargetMonth) - 1));
  return endDate.toISOString().slice(0, 10);
};

const getMembershipStatus = (member) => {
  if (!member.membership_months || !member.membership_end_date) return "Not recorded";
  if (member.membership_start_date &&
      String(member.membership_start_date).slice(0, 10) > getManilaToday()) return "Upcoming";
  return String(member.membership_end_date).slice(0, 10) >= getManilaToday() ? "Active" : "Expired";
};

function MemberPhoto({ member, large = false }) {
  const size = large ? "w-28 h-28 sm:w-36 sm:h-36" : "w-10 h-10";
  return (
    <div className={`${size} rounded-full overflow-hidden bg-orange-100 dark:bg-orange-500/15 flex items-center justify-center text-orange-600 dark:text-orange-400 font-bold shrink-0`}>
      {member.profile_image ? (
        <img src={member.profile_image} alt={member.full_name || "Member"} className="w-full h-full object-cover" />
      ) : (
        <span className={large ? "text-4xl" : "text-sm"}>{member.full_name?.charAt(0)?.toUpperCase() || "?"}</span>
      )}
    </div>
  );
}

function MemberModal({ member, onClose, onSave }) {
  const [form, setForm] = useState(member || { full_name: "", email: "", phone: "", gender: "", age: "", height: "", weight: "", fitness_goal: "", preferred_workout_time: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Active/Inactive are the admin-selectable statuses; keep the member's current
  // value (e.g. Pending/Rejected) selectable so editing never silently changes it.
  const statusOptions = [...new Set([...(form.status ? [form.status] : []), ...MEMBER_STATUS_OPTIONS])];

  const handleSubmit = async () => {
    if (!form.full_name || !form.email) return setError("Full name and email are required.");
    setSaving(true); setError("");
    try {
      const response = member
        ? await api.put(`/members/${member.member_id}`, { ...form, status: form.status || member.status })
        : await api.post("/members", form);
      const savedMember = response?.data?.member || response?.data?.data || (member ? { ...member, ...form, status: form.status || member.status } : null);
      await onSave(savedMember); onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save member.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-[#171717] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-gray-800">
        <div className="p-6 border-b border-slate-200 dark:border-gray-800 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">{member ? "Edit Member" : "Add New Member"}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 dark:hover:text-white"><X size={20}/></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {[
              {label:"Full Name *",key:"full_name",type:"text",span:true}, {label:"Email *",key:"email",type:"email",span:true},
              {label:"Phone",key:"phone",type:"text"}, {label:"Gender",key:"gender",type:"select",options:["","Male","Female"]},
              {label:"Age",key:"age",type:"number"}, {label:"Fitness Goal",key:"fitness_goal",type:"select",options:["","Weight Loss","Muscle Gain","General Fitness","Endurance"]},
              {label:"Preferred Workout Time",key:"preferred_workout_time",type:"select",options:["","Morning","Afternoon","Evening","Flexible"]},
              {label:"Height (cm)",key:"height",type:"number"}, {label:"Weight (kg)",key:"weight",type:"number"},
            ].map(f => <div key={f.key} className={f.span ? "col-span-2" : ""}>
              <label className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">{f.label}</label>
              {f.type === "select" ? <select value={form[f.key] || ""} onChange={e=>setForm({...form,[f.key]:e.target.value})} className="w-full border border-slate-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#111] text-slate-800 dark:text-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-500">{f.options.map(o=><option key={o} value={o}>{o || "Select..."}</option>)}</select> : <input type={f.type} value={form[f.key] || ""} onChange={e=>setForm({...form,[f.key]:e.target.value})} className="w-full border border-slate-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#111] text-slate-800 dark:text-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-500" />}
            </div>)}
          </div>
          {form.height && form.weight && <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">BMI: {(parseFloat(form.weight)/Math.pow(parseFloat(form.height)/100,2)).toFixed(1)} (auto-calculated)</p>}
          {member && (
            <div>
              <label className="block text-sm font-medium text-slate-600 dark:text-gray-300 mb-1">Status</label>
              <select value={form.status || ""} onChange={e => setForm({ ...form, status: e.target.value })} className="w-full border border-slate-300 dark:border-gray-700 rounded-lg bg-white dark:bg-[#111] text-slate-800 dark:text-white px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-orange-500">{statusOptions.map(s => <option key={s} value={s}>{s}</option>)}</select>
              <p className="text-xs text-slate-400 mt-1">Set the member Active or Inactive. Inactive members cannot sign in.</p>
            </div>
          )}
          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>
        <div className="p-6 border-t border-slate-200 dark:border-gray-800 flex gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-300 dark:border-gray-700 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-800 text-sm font-medium">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium disabled:opacity-50">{saving?"Saving...":member?"Save Changes":"Add Member"}</button>
        </div>
      </div>
    </div>
  );
}

function ViewModal({ member, trainers, onClose, onAssign, onMembershipUpdate, onProfileUpdate }) {
  const bmiInfo = getBMICategory(member.bmi);
  const [profileForm, setProfileForm] = useState(() => ({
    first_name: member.first_name || String(member.full_name || "").split(" ")[0] || "",
    last_name: member.last_name || String(member.full_name || "").split(" ").slice(1).join(" "),
    email: member.email || "",
    phone: member.phone || "",
    gender: member.gender || "",
    age: member.age || "",
    height: member.height || "",
    weight: member.weight || "",
    fitness_goal: member.fitness_goal || "",
    preferred_workout_time: member.preferred_workout_time || "",
    status: member.status || "Active",
  }));
  const [selectedTrainer, setSelectedTrainer] = useState(member.trainer_id || "");
  const [recommendations, setRecommendations] = useState([]);
  const [recommendationMessage, setRecommendationMessage] = useState("");
  const [recommendationsLoading, setRecommendationsLoading] = useState(true);
  const [membershipMonths, setMembershipMonths] = useState(member.membership_months || "");
  const [savingChanges, setSavingChanges] = useState(false);
  const [changesError, setChangesError] = useState("");
  const assignedTrainer = trainers.find(t => Number(t.trainer_id) === Number(member.trainer_id));
  const canEditMembershipAndCoach = String(member.status || "").trim() === "Active";
  const originalProfile = {
    first_name: member.first_name || String(member.full_name || "").split(" ")[0] || "",
    last_name: member.last_name || String(member.full_name || "").split(" ").slice(1).join(" "),
    email: member.email || "",
    phone: member.phone || "",
    gender: member.gender || "",
    age: member.age || "",
    height: member.height || "",
    weight: member.weight || "",
    fitness_goal: member.fitness_goal || "",
    preferred_workout_time: member.preferred_workout_time || "",
    status: member.status || "Active",
  };
  const profileChanged = Object.keys(originalProfile).some((key) => (
    String(profileForm[key] ?? "") !== String(originalProfile[key] ?? "")
  ));

  useEffect(() => {
    setMembershipMonths(member.membership_months || "");
    setSelectedTrainer(member.trainer_id || "");
    let active = true;
    setRecommendationsLoading(true);
    api.get(`/members/${member.member_id}/coach-recommendations`)
      .then(({ data }) => {
        if (!active) return;
        setRecommendations(data.data?.recommendations || []);
        setRecommendationMessage(data.data?.message || "");
      })
      .catch((err) => {
        if (active) setRecommendationMessage(err.response?.data?.message || "Unable to load coach recommendations.");
      })
      .finally(() => active && setRecommendationsLoading(false));
    return () => { active = false; };
  }, [member.member_id, member.membership_months, member.trainer_id]);

  const saveChanges = async () => {
    setSavingChanges(true);
    setChangesError("");
    try {
      if (coachChanged) await onAssign(member, selectedTrainer || null);
      if (membershipChanged) {
        await onMembershipUpdate(member, membershipMonths ? Number(membershipMonths) : null);
      }
      if (profileChanged) await onProfileUpdate(member, profileForm);
    } catch (err) {
      setChangesError(err.response?.data?.message || err.message || "Failed to save member changes.");
    } finally {
      setSavingChanges(false);
    }
  };

  const membershipStatus = getMembershipStatus(member);
  const membershipStartDate = member.membership_start_date
    ? String(member.membership_start_date).slice(0, 10)
    : member.joined_date ? String(member.joined_date).slice(0, 10) : null;
  const membershipEndDate = membershipMonths
    ? getMembershipEndDate(membershipStartDate, membershipMonths)
    : null;
  const membershipChanged = String(membershipMonths || "") !== String(member.membership_months || "");
  const selectedCoach = recommendations.find((coach) => String(coach.trainer_id) === String(selectedTrainer));
  const coachChanged = String(selectedTrainer || "") !== String(member.trainer_id || "");
  const hasChanges = profileChanged || membershipChanged || coachChanged;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-[#151515] rounded-3xl shadow-2xl w-full max-w-2xl max-h-[94vh] overflow-y-auto border border-slate-200 dark:border-gray-800" onClick={e=>e.stopPropagation()}>
        <div className="relative bg-slate-950 min-h-[280px] flex items-center justify-center overflow-hidden">
          {member.profile_image ? <>
            <img src={member.profile_image} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-35" />
            <div className="absolute inset-0 bg-black/25" />
            <img src={member.profile_image} alt={member.full_name} className="relative z-10 max-w-full max-h-[420px] w-auto h-auto object-contain p-5" />
          </> : <MemberPhoto member={member} large />}
          <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/90 to-transparent" />
          <button onClick={onClose} className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"><X size={20}/></button>
          <div className="absolute z-20 bottom-5 left-6 text-white">
            <p className="text-xs uppercase tracking-widest text-orange-300 font-bold">Member Profile</p>
            <h2 className="text-2xl sm:text-3xl font-bold">{member.full_name}</h2>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["First name", "first_name", "text"],
              ["Last name", "last_name", "text"],
              ["Email", "email", "email"],
              ["Phone", "phone", "tel"],
              ["Gender", "gender", "select", ["", "Male", "Female"]],
              ["Age", "age", "number"],
              ["Height (cm)", "height", "number"],
              ["Weight (kg)", "weight", "number"],
              ["Fitness goal", "fitness_goal", "select", ["", "Weight Loss", "Muscle Gain", "General Fitness", "Endurance", "Maintain Weight"]],
              ["Preferred workout time", "preferred_workout_time", "select", ["", "Morning", "Afternoon", "Evening", "Flexible"]],
              ["Status", "status", "select", ["Active", "Inactive"]],
            ].map(([label, key, type, options]) => (
              <label key={key} className="min-w-0 rounded-xl bg-slate-50 p-3 dark:bg-[#222]">
                <span className="block text-xs text-slate-500 dark:text-slate-400">{label}</span>
                {type === "select" ? (
                  <select value={profileForm[key]} onChange={(event) => setProfileForm((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-[#111] dark:text-slate-100">
                    {options.map((option) => <option key={option || "empty"} value={option}>{option || "Not set"}</option>)}
                  </select>
                ) : (
                  <input type={type} value={profileForm[key]} onChange={(event) => setProfileForm((current) => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-[#111] dark:text-slate-100" />
                )}
              </label>
            ))}
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-[#222]"><p className="text-xs text-slate-400">Email verified</p><p className="mt-1 font-semibold text-slate-700 dark:text-gray-200">{member.email_verified ? "Yes" : "No"}</p></div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900 p-4 text-center">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-300">BMI</p>
            <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{member.bmi ? parseFloat(member.bmi).toFixed(1) : "—"}</p>
            <p className={`text-sm font-semibold ${bmiInfo.color}`}>{bmiInfo.label}</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="mb-1 text-lg font-bold text-slate-800 dark:text-white">Membership</h3>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              {member.membership_months
                ? `${member.membership_months === 12 ? "1 year" : `${member.membership_months} ${member.membership_months === 1 ? "month" : "months"}`} · ${membershipStatus.toLowerCase()}`
                : "No membership term recorded."}
            </p>
            <div className="mb-4 rounded-xl bg-slate-50 px-4 py-3 dark:bg-[#111]">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Membership period</p>
              <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                {membershipStartDate ? formatMembershipDate(membershipStartDate) : "Join date unavailable"}
                {membershipMonths && membershipEndDate && ` – ${formatMembershipDate(membershipEndDate)}`}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                The start date is the join date or latest reactivation date. The end date is calculated from the selected term.
              </p>
            </div>
            <div className="grid gap-3">
              <label className="block text-sm font-medium text-slate-600 dark:text-gray-300">
                Membership term
                <select
                  value={membershipMonths}
                  onChange={(event) => setMembershipMonths(event.target.value)}
                  disabled={!canEditMembershipAndCoach}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-700 dark:bg-[#111] dark:text-white"
                >
                  <option value="1">1 month</option>
                  <option value="3">3 months</option>
                  <option value="6">6 months</option>
                  <option value="10">10 months</option>
                  <option value="12">1 year</option>
                </select>
              </label>
            </div>
            {!canEditMembershipAndCoach && <p className="mt-2 text-xs text-slate-500">Membership editing is locked until this member is active. Approve or activate the member to edit.</p>}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 dark:text-white mb-4"><UserRoundCog size={20} className="text-orange-500"/> Designated Coach</h3>
            {assignedTrainer ? <div className="mb-4 flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3">
              {assignedTrainer.photo_url ? <img src={assignedTrainer.photo_url} alt="" className="w-14 h-14 rounded-full object-contain bg-black"/> : <div className="w-14 h-14 rounded-full bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center text-orange-500"><UserRound/></div>}
              <div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-500 dark:text-slate-300">Current Coach</p><p className="font-bold text-slate-900 dark:text-white truncate">{assignedTrainer.full_name}</p><p className="text-xs text-orange-700 dark:text-orange-400 truncate">{assignedTrainer.goal_specialty || "General Fitness"}</p></div>
              <div className="text-right"><p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{assignedTrainer.assigned_member_count ?? "—"}/{assignedTrainer.max_members ?? 15} members</p><span className={`mt-1 inline-block rounded-full px-2 py-1 text-[10px] font-bold ${assignedTrainer.status === "Active" ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"}`}>{assignedTrainer.status || "Unknown"}</span></div>
            </div> : <p className="mb-4 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No coach assigned yet.</p>}
            <p className="mb-2 block text-sm font-medium text-slate-600 dark:text-slate-300">Choose a coach</p>
            <button
              type="button"
              onClick={() => setSelectedTrainer("")}
              disabled={!canEditMembershipAndCoach}
              aria-pressed={!selectedTrainer}
              className={`mb-3 rounded-lg border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${!selectedTrainer ? "border-orange-500 bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300" : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
            >
              No designated coach
            </button>
            {!recommendationsLoading && recommendations.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {recommendations.map((coach) => {
                  const capacity = Number(coach.max_members) || 0;
                  const assigned = Number(coach.assigned_member_count) || 0;
                  const selected = String(selectedTrainer) === String(coach.trainer_id);
                  return (
                    <button
                      key={coach.trainer_id}
                      type="button"
                      onClick={() => setSelectedTrainer(String(coach.trainer_id))}
                      disabled={!canEditMembershipAndCoach || recommendationsLoading}
                      aria-pressed={selected}
                      className={`rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60 ${selected ? "border-orange-500 bg-orange-50 dark:bg-orange-500/10" : "border-slate-200 bg-white hover:border-orange-300 dark:border-slate-700 dark:bg-[#111]"}`}
                    >
                      <div className="flex items-center gap-3">
                        {coach.photo_url ? <img src={coach.photo_url} alt="" className="h-11 w-11 rounded-full bg-black object-contain" /> : <div className="grid h-11 w-11 place-items-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300"><UserRound size={20}/></div>}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{coach.full_name}</p>
                          <p className="truncate text-xs text-orange-600 dark:text-orange-400">{coach.goal_specialty || "General Fitness"}</p>
                          {coach.specializations?.length > 0 && <p className="mt-1 line-clamp-1 text-[11px] text-slate-600 dark:text-slate-300">{Array.isArray(coach.specializations) ? coach.specializations.join(", ") : coach.specializations}</p>}
                          <p className="mt-1 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{coach.bio || "No coach bio provided."}</p>
                          <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{coach.email}{coach.phone ? ` · ${coach.phone}` : ""}</p>
                        </div>
                        {selected && <CheckCircle size={18} className="shrink-0 text-orange-500" aria-label="Selected" />}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                        <span>{assigned}/{capacity} members · {Math.max(capacity - assigned, 0)} slots remaining</span>
                        <span>{coach.capacity_status || (Number(coach.capacity_percent) >= 80 ? "Near Capacity" : "Active")}</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                        <span className="block h-full rounded-full bg-orange-500" style={{ width: `${Math.min(Number(coach.capacity_percent) || 0, 100)}%` }} />
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                        Availability: {coach.availability?.length
                          ? coach.availability.map((slot) => `${slot.day_of_week} ${slot.start_time}-${slot.end_time}`).join(" · ")
                          : "No schedule set"}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
            {recommendationsLoading && <p className="mt-2 text-xs text-slate-500">Checking coach capacity and schedule compatibility…</p>}
            {!recommendationsLoading && !recommendations.length && recommendationMessage && (
              <p role="status" className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">{recommendationMessage}</p>
            )}
            {selectedTrainer && selectedCoach && (
              <div role={selectedCoach.schedule_compatible && Number(selectedCoach.assigned_member_count) < Number(selectedCoach.max_members) ? "status" : "alert"} className={`mt-3 rounded-lg border px-3 py-2 text-xs ${selectedCoach.schedule_compatible && Number(selectedCoach.assigned_member_count) < Number(selectedCoach.max_members) ? "border-green-200 bg-green-50 text-green-800 dark:border-green-500/20 dark:bg-green-500/10 dark:text-green-200" : "border-amber-300/50 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"}`}>
                {!selectedCoach.schedule_compatible && <p>This coach’s availability does not match the member’s preferred workout schedule. You can still assign this coach.</p>}
                {Number(selectedCoach.assigned_member_count) >= Number(selectedCoach.max_members) && <p className={!selectedCoach.schedule_compatible ? "mt-1" : ""}>This coach is at full capacity. You can still assign this coach.</p>}
                {selectedCoach.schedule_compatible && Number(selectedCoach.assigned_member_count) < Number(selectedCoach.max_members) && <p>Schedule matches. Compatible days: {selectedCoach.matched_days.map((day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]).join(", ") || "—"}</p>}
              </div>
            )}
            {!canEditMembershipAndCoach && <p className="mt-2 text-xs text-slate-500">Coach assignment is locked until this member is active.</p>}
          </div>
        </div>

        <div className="p-6 border-t border-slate-200 dark:border-gray-800 flex justify-end gap-3">
          <div className="mr-auto min-w-0">
            {changesError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{changesError}</p>}
          </div>
          <button type="button" onClick={saveChanges} disabled={savingChanges || !hasChanges || (!canEditMembershipAndCoach && (membershipChanged || coachChanged)) || recommendationsLoading} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"><Save size={16}/>{savingChanges ? "Saving..." : "Save Changes"}</button>
        </div>
      </div>
    </div>
  );
}

export default function Members() {
  const [members,setMembers]=useState([]), [trainers,setTrainers]=useState([]), [loading,setLoading]=useState(true), [fetchError,setFetchError]=useState(""), [search,setSearch]=useState(""), [filter,setFilter]=useState("All"), [showAddModal,setShowAddModal]=useState(false), [viewMember,setViewMember]=useState(null);
  const [confirmMember, setConfirmMember] = useState(null);
  const [deletingMember, setDeletingMember] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [changeRequests, setChangeRequests] = useState([]);
  const [reviewingRequestId, setReviewingRequestId] = useState(null);
  const [reviewRequestToReject, setReviewRequestToReject] = useState(null);
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [decisionNotice, setDecisionNotice] = useState("");

  const fetchData = async () => {
    setLoading(true); setFetchError("");
    try {
      const [m,t,requests] = await Promise.all([
        api.get("/members"),
        api.get("/trainers"),
        api.get("/members/change-requests"),
      ]);

      // The API returns arrays directly. Also support { data: [...] } responses.
      const memberRows = Array.isArray(m.data) ? m.data : (m.data?.data || []);
      const trainerRows = Array.isArray(t.data) ? t.data : (t.data?.data || []);

      setMembers(memberRows);
      setViewMember((current) => {
        if (!current) return current;
        return memberRows.find((row) => Number(row.member_id) === Number(current.member_id)) || current;
      });
      setTrainers(trainerRows);
      setChangeRequests(requests.data?.data || []);
    } catch (err) { console.error(err); setFetchError(err.response?.data?.message || err.message || "Couldn't load members."); }
    finally { setLoading(false); }
  };
  useEffect(()=>{fetchData();},[]);

  const handleReviewChangeRequest = async (request, decision) => {
    setReviewingRequestId(request.request_id);
    setReviewMessage("");
    setReviewError("");
    try {
      const response = await api.put(`/members/change-requests/${request.request_id}/${decision}`);
      setReviewMessage(response.data.message);
      setReviewRequestToReject(null);
      await fetchData();
    } catch (error) {
      setReviewError(error.response?.data?.message || "Unable to review this request.");
    } finally {
      setReviewingRequestId(null);
    }
  };

  const handleApprove=async id=>{setDecisionNotice("");try{const response=await api.put(`/members/${id}/approve`);setDecisionNotice(response.data.email_sent===false?"Member approved, but the notification email could not be delivered. Check the email-service configuration.":"Member approved and the notification email was sent.");await fetchData();}catch(e){alert(e.response?.data?.message||"Failed to update member status.");}};
  const handleReject=async id=>{setDecisionNotice("");try{const response=await api.put(`/members/${id}/reject`);setDecisionNotice(response.data.email_sent===false?"Member status updated, but the notification email could not be delivered. Check the email-service configuration.":"Member status updated and the notification email was sent.");await fetchData();}catch(e){alert(e.response?.data?.message||"Failed to deactivate member.");}};
  const handleDelete=(id)=>{
    const member = members.find((row) => Number(row.member_id) === Number(id));
    if (member) setConfirmMember(member);
    setDeleteError("");
  };
  const confirmDelete=async()=>{
    if (!confirmMember) return;
    setDeletingMember(true);
    setDeleteError("");
    try {
      await api.delete(`/members/${confirmMember.member_id}`);
      setConfirmMember(null);
      setViewMember((current) => current && Number(current.member_id) === Number(confirmMember.member_id) ? null : current);
      await fetchData();
    } catch (error) {
      setDeleteError(error.response?.data?.message || "Failed to delete this member. Please try again.");
    } finally {
      setDeletingMember(false);
    }
  };
  const handleAssign=async(member,trainer_id)=>{
    await api.put(`/members/${member.member_id}/trainer`,{trainer_id});
    const response = await api.get("/members");
    const rows = Array.isArray(response.data)
      ? response.data
      : (response.data?.data || []);
    setMembers(rows);

    const updated = rows.find(
      m => Number(m.member_id) === Number(member.member_id)
    );

    if (updated) setViewMember(updated);
  };
  const handleMembershipUpdate=async(member,membership_months)=>{
    const response = await api.put(`/members/${member.member_id}/membership`, {
      membership_months,
    });
    const updatedMembership = response.data.data;
    setMembers(current => current.map(row => Number(row.member_id) === Number(member.member_id)
      ? { ...row, ...updatedMembership }
      : row));
    setViewMember(current => current && Number(current.member_id) === Number(member.member_id)
      ? { ...current, ...updatedMembership }
      : current);
  };
  const handleViewProfileUpdate = async (member, changes) => {
    if (!String(changes.first_name || "").trim() || !String(changes.last_name || "").trim() || !String(changes.email || "").trim()) {
      throw new Error("First name, last name, and email are required.");
    }
    const profileChanges = { ...changes };
    for (const field of ["age", "height", "weight"]) {
      if (profileChanges[field] === "") delete profileChanges[field];
    }
    await api.put(`/members/${member.member_id}`, profileChanges);
    await fetchData();
  };

  const handleMemberSave = async (savedMember = null) => {
    // Refresh the member list so table status/fields are current.
    let rows = [];
    try {
      const response = await api.get("/members");
      rows = Array.isArray(response.data)
        ? response.data
        : (response.data?.data || []);
    } catch {
      // Fall back to a full reload if the refresh request fails.
      await fetchData();
      return;
    }

    setMembers(rows);

    // Update any open profile views in real time using the fresh record.
    const savedId = Number(savedMember?.member_id ?? savedMember?.user_id);
    const updated = Number.isNaN(savedId)
      ? null
      : rows.find((row) => Number(row.member_id ?? row.user_id) === savedId) || savedMember;

    if (updated) {
      setViewMember((current) =>
        current && Number(current.member_id ?? current.user_id) === Number(updated.member_id ?? updated.user_id)
          ? updated
          : current
      );
    }
  };

  const filtered=members.filter(m=>{const q=search.toLowerCase();return (m.full_name?.toLowerCase().includes(q)||m.email?.toLowerCase().includes(q))&&(filter==="All"||String(m.status||"").trim().toLowerCase()===filter.toLowerCase());});
  const pendingCount=members.filter(m=>String(m.status||"").trim().toLowerCase()==="pending").length;
  const activeCount=members.filter(m=>String(m.status||"").trim().toLowerCase()==="active").length;

  return <div className="space-y-6">
    {showAddModal&&<MemberModal onClose={()=>setShowAddModal(false)} onSave={handleMemberSave}/>} 
    {viewMember&&<ViewModal member={viewMember} trainers={trainers} onClose={()=>setViewMember(null)} onAssign={handleAssign} onMembershipUpdate={handleMembershipUpdate} onProfileUpdate={handleViewProfileUpdate}/>}
    {confirmMember&&<ConfirmDialog title={`Delete ${confirmMember.full_name || "this member"} permanently?`} description="This action cannot be undone. The member’s account and associated records will be permanently deleted." confirmLabel="Delete member" isLoading={deletingMember} error={deleteError} onCancel={()=>{if(!deletingMember){setConfirmMember(null);setDeleteError("");}}} onConfirm={confirmDelete}/>}
    {reviewRequestToReject&&<ConfirmDialog title="Reject this change request?" description="The member's current profile and password will remain unchanged. The member will be notified by email." confirmLabel="Reject request" isLoading={reviewingRequestId === reviewRequestToReject.request_id} error={reviewError} onCancel={()=>{if(!reviewingRequestId)setReviewRequestToReject(null);}} onConfirm={()=>handleReviewChangeRequest(reviewRequestToReject, "reject")}/>}

    <header className="ave-page-hero rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8"><p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">People management</p><div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-black text-slate-900 dark:text-white">Members</h1><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Manage accounts, approvals, fitness profiles, and coach assignments.</p></div></div></header>
    {fetchError&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">⚠️ {fetchError}</div>}
    {decisionNotice&&<div role="status" aria-live="polite" className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-200">{decisionNotice}</div>}
    <section aria-label="Member summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {[{label:"Total members",value:members.length},{label:"Active members",value:activeCount},{label:"Pending approval",value:pendingCount}].map(item=><div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111]"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p><p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{loading?"—":item.value}</p></div>)}
    </section>
    {(reviewMessage || reviewError) && <p role={reviewError ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${reviewError ? "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" : "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-200"}`}>{reviewError || reviewMessage}</p>}
    {changeRequests.length > 0 && (
      <section aria-labelledby="member-change-requests-title" className="space-y-4 rounded-2xl border border-orange-200 bg-orange-50/60 p-4 dark:border-orange-500/20 dark:bg-orange-500/[0.04] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="member-change-requests-title" className="text-lg font-bold text-slate-900 dark:text-white">Profile &amp; password requests</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Review member changes before they take effect. Members keep their current settings until approval.</p>
          </div>
          <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white">{changeRequests.length} awaiting review</span>
        </div>
        <div className="grid gap-3">
          {changeRequests.map((request) => {
            const changes = request.payload || {};
            const isPassword = request.request_type === "password";
            const isReviewing = reviewingRequestId === request.request_id;
            return (
              <article key={request.request_id} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {isPassword ? <KeyRound size={17} className="text-orange-500" /> : <ShieldCheck size={17} className="text-orange-500" />}
                      <h3 className="font-bold text-slate-900 dark:text-white">{request.member_name || "Member"} · {isPassword ? "Password change" : "Profile changes"}</h3>
                    </div>
                    <p className="mt-1 break-all text-xs text-slate-500">{request.email}</p>
                    <p className="mt-1 text-xs text-slate-400">{new Date(request.created_at).toLocaleString()}</p>
                    {isPassword ? (
                      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-white/[0.04]">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">Password</p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">From: Current password (hidden)</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300">To: New password (hidden)</p>
                        <p className="mt-2 text-xs text-slate-500">The member verified this request by email. Passwords are never shown to administrators.</p>
                      </div>
                    ) : (
                      <dl className="mt-3 grid gap-2 text-sm">
                        {Object.entries(changes).map(([key, value]) => (
                          <div key={key} className="min-w-0 rounded-lg bg-slate-50 px-3 py-2 dark:bg-white/[0.04]">
                            <dt className="text-xs font-semibold text-slate-600 dark:text-slate-300">{PROFILE_CHANGE_LABELS[key] || key.replaceAll("_", " ")}</dt>
                            <dd className="mt-1 grid gap-1 break-words text-xs sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                              <span><strong className="text-slate-500">From:</strong> {key === "profile_photo_changed"
                                ? request.current_values?.[key] ? "Photo on file" : "No photo"
                                : formatChangeValue(request.current_values?.[key])}</span>
                              <span className="hidden text-slate-400 sm:inline" aria-hidden="true">→</span>
                              <span><strong className="text-slate-500">To:</strong> {key === "profile_photo_changed"
                                ? "Replacement photo requested"
                                : formatChangeValue(value)}</span>
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2 sm:flex-col">
                    <button type="button" disabled={isReviewing} onClick={() => handleReviewChangeRequest(request, "approve")} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-60 sm:flex-none">
                      <CheckCircle size={16} /> {isReviewing ? "Saving..." : "Approve"}
                    </button>
                    <button type="button" disabled={isReviewing} onClick={() => { setReviewError(""); setReviewRequestToReject(request); }} className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10 sm:flex-none">
                      <XCircle size={16} /> Reject
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    )}
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111] sm:flex-row sm:items-center sm:justify-between"><label className="flex min-h-10 w-full items-center gap-2 rounded-xl bg-slate-100 px-3 dark:bg-white/5 sm:max-w-xs"><Search size={16} className="shrink-0 text-slate-400"/><span className="sr-only">Search members</span><input type="search" placeholder="Search name or email..." value={search} onChange={e=>setSearch(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500 dark:text-white"/></label><div role="group" aria-label="Filter  members by status" className="flex gap-2 overflow-x-auto">{["All","Active","Pending","Inactive","Rejected"].map(s=><button key={s} type="button" aria-pressed={filter===s} onClick={()=>setFilter(s)} className={`min-h-9 rounded-lg px-3 text-sm font-semibold transition ${filter===s?"bg-orange-500 text-white":"bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"}`}>{s}{s==="Pending"&&pendingCount>0?` (${pendingCount})`:""}</button>)}</div></div>
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#111]">
      {loading?<div className="p-8 space-y-3">{[...Array(5)].map((_,i)=><div key={i} className="h-10 bg-slate-100 dark:bg-gray-800 rounded-lg animate-pulse"/>)}</div>:<div className="overflow-x-auto"><table className="w-full min-w-[1080px] table-fixed text-sm"><colgroup><col style={{ width: "22%" }} /><col style={{ width: "8%" }} /><col style={{ width: "14%" }} /><col style={{ width: "7%" }} /><col style={{ width: "8%" }} /><col style={{ width: "15%" }} /><col style={{ width: "10%" }} /><col style={{ width: "16%" }} /></colgroup><thead className="bg-slate-50 dark:bg-[#202020] border-b border-slate-200 dark:border-gray-800"><tr>{["Member","Goal","Designated Coach","BMI","Status","Membership","Joined","Actions"].map(h=><th key={h} className="text-left px-2 py-4 sm:px-3 font-semibold text-slate-600 dark:text-gray-300">{h}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-gray-800">{filtered.length===0?<tr><td colSpan={8} className="text-center py-12 text-slate-400">No members found.</td></tr>:filtered.map(member=>{const bmiInfo=getBMICategory(member.bmi);const membershipStatus=getMembershipStatus(member);const memberStatus=member.status?.trim().toLowerCase();return <tr key={member.member_id} onClick={()=>setViewMember(member)} className="hover:bg-slate-50 dark:hover:bg-[#202020] transition cursor-pointer"><td className="px-2 py-4 sm:px-3"><div className="flex min-w-0 items-center gap-2"><MemberPhoto member={member}/><div className="min-w-0"><p className="truncate font-semibold text-slate-800 dark:text-white">{member.full_name}</p><p className="truncate text-slate-400 text-xs">{member.email}</p><p className={`mt-0.5 text-[11px] font-semibold ${member.email_verified?"text-green-500":"text-orange-500"}`}>{member.email_verified?"✓ Email verified":"⚠ Email not verified"}</p></div></div></td><td className="px-2 py-4 sm:px-3 text-slate-600 dark:text-gray-300">{member.fitness_goal||"—"}</td><td className="px-2 py-4 sm:px-3">{member.trainer_id?<div className="flex items-center gap-2 text-slate-700 dark:text-gray-200">{member.trainer_photo_url?<img src={member.trainer_photo_url} alt="" className="w-8 h-8 rounded-full object-contain bg-black"/>:<div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-500/15 flex items-center justify-center text-orange-500 text-xs font-bold">{member.trainer_name?.charAt(0)||"?"}</div>}<span className="truncate">{member.trainer_name||"Assigned Coach"}</span></div>:<span className="text-slate-400">Not assigned</span>}</td><td className="px-2 py-4 sm:px-3"><div className="flex min-w-0 flex-col items-start"><span className="font-semibold text-slate-800 dark:text-white">{member.bmi?parseFloat(member.bmi).toFixed(1):"?"}</span><span className={`text-xs font-medium ${bmiInfo.color}`}>{bmiInfo.label}</span></div></td><td className="px-2 py-4 sm:px-3 whitespace-nowrap"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[member.status]||statusColors.Inactive}`}>{member.status||"Inactive"}</span></td><td className="px-2 py-4 sm:px-3"><div className="space-y-1"><p className="font-semibold text-slate-800 dark:text-white">{member.membership_months ? `${member.membership_months === 12 ? "1 year" : `${member.membership_months} ${member.membership_months === 1 ? "month" : "months"}`}` : "Not recorded"}</p><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${membershipStatus === "Active" ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" : membershipStatus === "Expired" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400" : membershipStatus === "Upcoming" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400" : "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300"}`}>{membershipStatus}</span>{member.membership_start_date && member.membership_end_date && <p className="text-xs text-slate-500 dark:text-slate-400">{formatMembershipDate(member.membership_start_date)} – {formatMembershipDate(member.membership_end_date)}</p>}</div></td><td className="px-2 py-4 sm:px-3 text-slate-500 dark:text-gray-400">{member.joined_date?formatMembershipDate(member.joined_date):"—"}</td><td className="px-2 py-4 sm:px-3" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-start gap-1"><button onClick={()=>setViewMember(member)} className="grid h-8 w-8 place-items-center rounded-lg text-orange-500 transition hover:bg-orange-50 dark:hover:bg-orange-500/10" title="View member / change coach" aria-label={`View ${member.full_name}`}><UserRoundCog size={16}/></button>{memberStatus==="pending"?<button onClick={()=>handleApprove(member.member_id)} className="grid h-8 w-8 place-items-center rounded-lg bg-green-600 text-white transition hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111]" title="Approve member" aria-label={`Approve ${member.full_name}`}><CheckCircle size={16}/></button>:(memberStatus==="inactive"||memberStatus==="rejected")?<button onClick={()=>handleApprove(member.member_id)} className="grid h-8 w-8 place-items-center rounded-lg bg-green-600 text-white transition hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111]" title={memberStatus==="rejected"?"Approve member":"Reactivate member"} aria-label={`${memberStatus==="rejected"?"Approve":"Reactivate"} ${member.full_name}`}><CheckCircle size={16}/></button>:null}{memberStatus==="pending"?<button onClick={()=>handleReject(member.member_id)} className="grid h-8 w-8 place-items-center rounded-lg bg-red-600 text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111]" title="Reject" aria-label={`Reject ${member.full_name}`}><XCircle size={16}/></button>:null}<button onClick={()=>handleDelete(member.member_id)} className="grid h-8 w-8 place-items-center rounded-lg bg-red-600 text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#111]" title="Delete" aria-label={`Delete ${member.full_name}`}><Trash2 size={16}/></button></div></td></tr>})}</tbody></table></div>}
      <div className="px-6 py-3 border-t border-slate-100 dark:border-gray-800 text-sm text-slate-400">Showing {filtered.length} of {members.length} registered members</div>
    </div>
  </div>;
}
