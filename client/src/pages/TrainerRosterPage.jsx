import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Search, TrendingUp, Users, X } from "lucide-react";
import trainerApi from "../trainerApi";
import ProgressHistoryModal from "../components/progress/ProgressHistoryModal";
import CustomSelect from "../components/ui/CustomSelect";
import { formatWorkoutTimeRange } from "../utils/workoutSchedule";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const fetchTrainerProgress = (userId) => trainerApi.get(`/me/members/${userId}/progress`);

function formatPreferredWorkoutTime(value) {
  const labels = {
    Morning: "Morning (6:00 AM – 12:00 PM)",
    Afternoon: "Afternoon (12:00 PM – 5:00 PM)",
    Evening: "Evening (5:00 PM – 10:00 PM)",
    Flexible: "Flexible (6:00 AM – 10:00 PM)",
  };
  return labels[value] || "Not specified";
}

function toList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === "string") return val.replace(/^\{|\}$/g, "").split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

function toHealthNotes(value) {
  const noReportValues = new Set(["none", "no injury", "no injuries", "no condition", "no conditions", "n/a"]);
  return toList(value)
    .map((item) => String(item).trim().replace(/^["']|["']$/g, ""))
    .filter((item) => item && !noReportValues.has(item.toLowerCase()));
}

function getManilaToday() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isMembershipInactive(member) {
  return Boolean(member.membership_end_date)
    && String(member.membership_end_date).slice(0, 10) < getManilaToday();
}

const formatFitnessGoal = (goal) => goal === "Muscle Gain" ? "Gain Weight" : goal;

function calculateBmi(weight, height) {
  const weightKg = Number(weight);
  const heightCm = Number(height);
  if (!Number.isFinite(weightKg) || weightKg <= 0 || !Number.isFinite(heightCm) || heightCm <= 0) return null;
  return (weightKg / ((heightCm / 100) ** 2)).toFixed(1);
}

function MemberProfileModal({ member, onClose, onViewProgress }) {
  if (!member) return null;
  const currentWeight = member.latest_weight ?? member.weight;
  const currentBmi = member.latest_bmi ?? calculateBmi(currentWeight, member.height);
  const injuries = toHealthNotes(member.injuries).map((area) => {
    const level = Number(member.injury_pain_levels?.[area]);
    return Number.isInteger(level) && level >= 1 && level <= 10 ? `${area} (Pain ${level}/10)` : area;
  });
  const conditions = toHealthNotes(member.health_conditions);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111]" onClick={(event) => event.stopPropagation()}>
        <div className="relative min-h-[300px] overflow-hidden bg-slate-950">
          {member.profile_image ? (
            <>
              <img src={member.profile_image} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-35 blur-2xl" />
              <div className="absolute inset-0 bg-black/25" />
              <img src={member.profile_image} alt={`${member.first_name} ${member.last_name}`} className="relative z-10 h-auto max-h-[420px] w-auto max-w-full object-contain p-5" />
            </>
          ) : (
            <div className="relative z-10 flex h-32 w-32 items-center justify-center rounded-full bg-orange-500/15 text-5xl font-bold text-orange-400">
              {member.first_name?.charAt(0)}{member.last_name?.charAt(0)}
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/95 to-transparent" />
          <button type="button" onClick={onClose} className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"><X size={20} /></button>
          <div className="absolute inset-x-0 bottom-5 left-6 right-6 z-20 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">Member Profile</p>
            <h2 className="mt-1 text-3xl font-bold">{member.first_name} {member.last_name}</h2>
            <p className="mt-1 text-sm text-slate-300">{member.email}</p>
          </div>
        </div>

        <div className="space-y-5 p-6 sm:p-8">
          {isMembershipInactive(member) && (
            <p role="status" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
              Membership inactive · ended {String(member.membership_end_date).slice(0, 10)}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Phone", member.phone],
              ["Gender", member.gender],
              ["Age", member.age ? `${member.age} yrs` : "—"],
              ["Height", member.height ? `${member.height} cm` : "—"],
              ["Weight", currentWeight ? `${currentWeight} kg` : "—"],
              ["Target Weight", member.target_weight ? `${member.target_weight} kg` : "—"],
              ["BMI", currentBmi || "—"],
              ["Goal", member.fitness_goal || "—"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="mt-1 break-words font-semibold text-slate-700 dark:text-slate-200">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-400"><AlertTriangle size={16} /> Health & Safety Assessment</p>
            <div className="mt-3 space-y-1 text-sm text-amber-200">
              <p><span className="font-semibold">Injury:</span> {injuries.join(", ") || "None reported"}</p>
              <p><span className="font-semibold">Health Condition:</span> {conditions.join(", ") || "None reported"}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Training preferences</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{toList(member.preferred_days).join(", ") || "No preferred days set."}</p>
            <p className="mt-1 text-xs text-slate-500">
              {member.workout_days_per_week ? `${member.workout_days_per_week} days/week` : "Days/week not set"}
            </p>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400"><span className="font-semibold">Preferred time:</span> {formatPreferredWorkoutTime(member.preferred_workout_time)}</p>
            {Array.isArray(member.weekly_availability) && member.weekly_availability.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                {member.weekly_availability.map((slot) => (
                  <li key={slot.day_of_week}><span className="font-semibold">{slot.day_of_week}:</span> {formatWorkoutTimeRange(slot.start_time, slot.end_time) || "Time not set"}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Membership & status</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {[ ["Coach", member.coach_name || "Not assigned"], ["Membership", member.membership_status || "Not set"], ["Assigned workouts", String(member.assigned_workouts || 0)], ["Completed workouts", String(member.completed_workouts || 0)] ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="mt-1 font-semibold text-slate-700 dark:text-slate-200">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <p className="text-xs uppercase tracking-wider font-bold text-slate-400">Experience level</p>
              <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{member.activity_level || "Not set"}</p>
              <p className="mt-1 text-xs text-slate-500">Members manage experience level from their profile, subject to admin approval.</p>
            </div>
            <button type="button" onClick={() => onViewProgress(member)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700">
              <TrendingUp size={16} /> View Progress
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member, onViewProfile }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-500/15 text-sm font-bold text-orange-400">
          {member.profile_image ? (
            <img src={member.profile_image} alt="" className="h-full w-full object-cover" />
          ) : (
            <>{member.first_name?.charAt(0)}{member.last_name?.charAt(0)}</>
          )}
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <span className="truncate">{member.first_name} {member.last_name}</span>
            {isMembershipInactive(member) && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-500/15 dark:text-red-300">Inactive</span>}
          </p>
          <p className="truncate text-xs text-slate-500">{member.fitness_goal || "No goal set"} · {member.email}</p>
        </div>
      </div>
      <button type="button" onClick={() => onViewProfile(member)} className="shrink-0 rounded-lg border border-orange-500/30 px-3 py-2 text-xs font-semibold text-orange-500 hover:bg-orange-500/10">View Profile</button>
    </div>
  );
}

export default function TrainerRosterPage() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("first_name");
  const [profileMember, setProfileMember] = useState(null);
  const [progressMember, setProgressMember] = useState(null);

  const refreshRoster = useCallback(async () => {
    const response = await trainerApi.get("/me/roster");
    const rows = Array.isArray(response.data?.data) ? response.data.data : [];
    const formattedRows = rows.map((member) => ({ ...member, fitness_goal: formatFitnessGoal(member.fitness_goal) }));
    setMembers(formattedRows);
    setProfileMember((current) => current
      ? formattedRows.find((member) => String(member.user_id) === String(current.user_id)) || current
      : current);
    setError("");
  }, []);

  useEffect(() => {
    setLoading(true);
    refreshRoster()
      .catch((err) => {
        console.error(err);
        setError(err.response?.data?.message || "Couldn't load your roster.");
      })
      .finally(() => setLoading(false));
  }, [refreshRoster]);

  useEffect(() => {
    const refreshVisibleRoster = () => {
      if (document.visibilityState !== "visible") return;

      refreshRoster().catch((err) => {
        console.error("Couldn't refresh workout counts:", err);
        setError(err.response?.data?.message || "Workout counts couldn't be refreshed.");
      });
    };
    const refreshWhenVisible = () => {
      refreshVisibleRoster();
    };
    const intervalId = window.setInterval(refreshVisibleRoster, 15000);
    window.addEventListener("focus", refreshVisibleRoster);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleRoster);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshRoster]);

  const filteredMembers = members
    .filter((member) => {
      const query = search.trim().toLowerCase();
      if (!query) return true;
      return `${member.first_name || ""} ${member.last_name || ""} ${member.email || ""} ${member.fitness_goal || ""}`.toLowerCase().includes(query);
    })
    .sort((memberA, memberB) => {
      const otherName = sortBy === "first_name" ? "last_name" : "first_name";
      const primaryComparison = (memberA[sortBy] || "").localeCompare(memberB[sortBy] || "", undefined, { sensitivity: "base", numeric: true });
      return primaryComparison || (memberA[otherName] || "").localeCompare(memberB[otherName] || "", undefined, { sensitivity: "base", numeric: true });
    });

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <MemberProfileModal member={profileMember} onClose={() => setProfileMember(null)} onViewProgress={setProgressMember} />
      {progressMember && <ProgressHistoryModal member={progressMember} fetchProgress={fetchTrainerProgress} onClose={() => setProgressMember(null)} />}

      <header className="ave-page-hero rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Coach roster</p>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl"><Users size={25} className="text-orange-500" /> My Roster</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">Review your members, their goals, and the details you need before building or approving workouts.</p>
      </header>

      {error && <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your members</h2>
          <p className="mt-1 text-xs text-slate-500">View your members’ profiles.</p>
        </div>
        {!loading && members.length > 0 && (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <label className="flex min-h-10 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 dark:border-white/10 dark:bg-[#111] sm:max-w-xs">
              <Search size={16} className="text-slate-400" />
              <span className="sr-only">Search roster</span>
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search members..." className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500 dark:text-white" />
            </label>
            <div className="w-full sm:w-56">
              <CustomSelect
                value={sortBy}
                onChange={setSortBy}
                ariaLabel="Alphabetical Sorting"
                options={[
                  { value: "first_name", label: "Sort by First Name" },
                  { value: "last_name", label: "Sort by Last Name" },
                ]}
              />
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-2xl border border-orange-100 bg-white dark:border-white/5 dark:bg-[#111]" />
          ))}
        </div>
      ) : members.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 bg-white py-16 text-center dark:border-white/10 dark:bg-[#111]">
          <Users size={36} className="mx-auto mb-3 text-orange-500" />
          <p className="font-semibold text-slate-900 dark:text-white">No members assigned yet</p>
          <p className="mt-1 text-sm text-slate-500">Members will appear here after the gym assigns them to you.</p>
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-orange-200 bg-white py-12 text-center dark:border-white/10 dark:bg-[#111]">
          <Search size={28} className="mx-auto mb-2 text-orange-500" />
          <p className="font-semibold text-slate-900 dark:text-white">No members match that search</p>
          <button type="button" onClick={() => setSearch("")} className="mt-2 text-sm font-semibold text-orange-700 dark:text-orange-300">Clear search</button>
        </div>
      ) : (
        <div className="space-y-3">{filteredMembers.map((member) => <MemberRow key={member.user_id} member={member} onViewProfile={setProfileMember} />)}</div>
      )}
    </div>
  );
}
