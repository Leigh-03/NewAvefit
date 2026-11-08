import { useEffect, useState } from "react";
import { Users, AlertTriangle, X, ClipboardList, CircleCheck, TrendingUp, Search } from "lucide-react";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend } from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import trainerApi from "../trainerApi";
import ProgressHistoryModal from "../components/progress/ProgressHistoryModal";
import TrainingPulse from "../components/TrainingPulse";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const CHART_COLORS = ["#f97316", "#22c55e", "#38bdf8", "#a78bfa", "#f43f5e", "#eab308", "#14b8a6"];
const fetchTrainerProgress = (userId) => trainerApi.get(`/me/members/${userId}/progress`);

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

const chartPlugins = {
  legend: { labels: { color: "#94a3b8", usePointStyle: true, boxWidth: 8, padding: 18 } },
  tooltip: { enabled: true },
};

const weeklyBarOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: { legend: chartPlugins.legend, tooltip: chartPlugins.tooltip },
  scales: {
    x: { grid: { display: false }, ticks: { color: "#94a3b8" } },
    y: { beginAtZero: true, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#94a3b8", precision: 0 } },
  },
};

const memberBarOptions = {
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: "y",
  plugins: { legend: chartPlugins.legend, tooltip: chartPlugins.tooltip },
  scales: {
    x: { beginAtZero: true, stacked: true, grid: { color: "rgba(148,163,184,0.12)" }, ticks: { color: "#94a3b8", precision: 0 } },
    y: { stacked: true, grid: { display: false }, ticks: { color: "#94a3b8", autoSkip: false } },
  },
};

const doughnutOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: "68%",
  plugins: {
    legend: { position: "bottom", labels: { color: "#94a3b8", usePointStyle: true, padding: 18, boxWidth: 8 } },
  },
};

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
  if (typeof val === "string") return val.replace(/^\{|\}$/g, "").split(",").map(s=>s.trim()).filter(Boolean);
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
  const injuries = toHealthNotes(member.injuries);
  const conditions = toHealthNotes(member.health_conditions);
  return <div className="fixed inset-0 z-[80] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
    <div className="w-full max-w-2xl max-h-[94vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#111] border border-slate-200 dark:border-slate-800 shadow-2xl" onClick={e=>e.stopPropagation()}>
      <div className="relative min-h-[300px] bg-slate-950 flex items-center justify-center overflow-hidden">
        {member.profile_image ? <><img src={member.profile_image} alt="" className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl opacity-35"/><div className="absolute inset-0 bg-black/25"/><img src={member.profile_image} alt={`${member.first_name} ${member.last_name}`} className="relative z-10 max-w-full max-h-[420px] w-auto h-auto object-contain p-5"/></> : <div className="relative z-10 w-32 h-32 rounded-full bg-orange-500/15 flex items-center justify-center text-orange-400 text-5xl font-bold">{member.first_name?.charAt(0)}{member.last_name?.charAt(0)}</div>}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/95 to-transparent"/>
        <button onClick={onClose} className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"><X size={20}/></button>
        <div className="absolute z-20 bottom-5 left-6 right-6 text-white"><p className="text-xs uppercase tracking-widest font-bold text-orange-300">Member Profile</p><h2 className="text-3xl font-bold mt-1">{member.first_name} {member.last_name}</h2><p className="text-sm text-slate-300 mt-1">{member.email}</p></div>
      </div>
      <div className="p-6 sm:p-8 space-y-5">
        {isMembershipInactive(member) && (
          <p role="status" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            Membership inactive · ended {String(member.membership_end_date).slice(0, 10)}
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          {[['Phone',member.phone],['Gender',member.gender],['Age',member.age?`${member.age} yrs`:'—'],['Height',member.height?`${member.height} cm`:'—'],['Weight',currentWeight?`${currentWeight} kg`:'—'],['Target Weight',member.target_weight?`${member.target_weight} kg`:'—'],['BMI',currentBmi||'—'],['Goal',member.fitness_goal||'—']].map(([l,v])=><div key={l} className="rounded-xl bg-slate-50 dark:bg-slate-900 p-3"><p className="text-xs text-slate-400">{l}</p><p className="mt-1 font-semibold text-slate-700 dark:text-slate-200 break-words">{v}</p></div>)}
        </div>
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4"><p className="flex items-center gap-2 text-amber-400 font-semibold text-sm"><AlertTriangle size={16}/> Health &amp; Safety Assessment</p><div className="mt-3 space-y-1 text-sm text-amber-200"><p><span className="font-semibold">Injury:</span> {injuries.join(", ") || "None reported"}</p><p><span className="font-semibold">Health Condition:</span> {conditions.join(", ") || "None reported"}</p></div></div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 p-4"><p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Training Preferences</p><p className="text-sm text-slate-600 dark:text-slate-300">{toList(member.preferred_days).join(', ') || 'No preferred days set.'}</p><p className="text-xs text-slate-400 mt-2">{member.workout_days_per_week ? `${member.workout_days_per_week} days/week` : 'Days/week not set'}</p><p className="mt-2 text-xs text-slate-500 dark:text-slate-400"><span className="font-semibold">Preferred time:</span> {formatPreferredWorkoutTime(member.preferred_workout_time)}</p>
          {Array.isArray(member.weekly_availability) && member.weekly_availability.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
              {member.weekly_availability.map((slot) => (
                <li key={slot.day_of_week}>
                  <span className="font-semibold">{slot.day_of_week}:</span> {slot.start_time}–{slot.end_time}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          <p className="text-xs uppercase tracking-wider font-bold text-slate-400">Experience level</p>
          <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">{member.activity_level || "Not set"}</p>
          <p className="mt-1 text-xs text-slate-500">Members manage experience level from their profile, subject to admin approval.</p>
        </div>
        <button type="button" onClick={() => onViewProgress(member)} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700">
          <TrendingUp size={16}/> View Progress
        </button>
      </div>
    </div>
  </div>;
}

function MemberRow({ member, onViewProfile }) {
  return (
    <div className="trainer-card flex items-center justify-between gap-4 rounded-2xl border px-4 py-4">
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
      <button
        type="button"
        onClick={() => onViewProfile(member)}
        className="shrink-0 rounded-lg border border-orange-500/30 px-3 py-2 text-xs font-semibold text-orange-500 hover:bg-orange-500/10"
      >
        View Profile
      </button>
    </div>
  );
}

export default function TrainerDashboard(){
  const [members,setMembers]=useState([]),[loading,setLoading]=useState(true),[profileMember,setProfileMember]=useState(null),[progressMember,setProgressMember]=useState(null),[fetchError,setFetchError]=useState(""),[rosterSearch,setRosterSearch]=useState("");
  useEffect(()=>{setLoading(true);trainerApi.get('/me/roster').then(r=>setMembers((r.data.data||[]).map(member=>({...member,fitness_goal:formatFitnessGoal(member.fitness_goal)})))).catch(err=>{console.error(err);setFetchError(err.response?.data?.message||"Couldn't load your trainer dashboard.")}).finally(()=>setLoading(false))},[]);
  useEffect(() => {
    let active = true;
    const refreshRoster = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await trainerApi.get("/me/roster");
        if (!active) return;
        const rows = (response.data.data || []).map((member) => ({
          ...member,
          fitness_goal: formatFitnessGoal(member.fitness_goal),
        }));
        setMembers(rows);
        setProfileMember((current) => current
          ? rows.find((member) => String(member.user_id) === String(current.user_id)) || current
          : current);
      } catch (error) {
        if (!active) return;
        console.error("Couldn't refresh trainer dashboard data:", error);
        setFetchError(error.response?.data?.message || "Dashboard information couldn't be refreshed.");
      }
    };
    const intervalId = window.setInterval(refreshRoster, 15000);
    window.addEventListener("focus", refreshRoster);
    document.addEventListener("visibilitychange", refreshRoster);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshRoster);
      document.removeEventListener("visibilitychange", refreshRoster);
    };
  }, []);
  const assignedTotal=members.reduce((total,member)=>total+Number(member.assigned_workouts||0),0);
  const completedTotal=members.reduce((total,member)=>total+Number(member.completed_workouts||0),0);
  const remainingTotal=Math.max(assignedTotal-completedTotal,0);
  const completionRate=assignedTotal?Math.round((completedTotal/assignedTotal)*100):0;
  const membersWithoutWorkouts=members.filter(member=>Number(member.assigned_workouts||0)===0).length;
  const query=rosterSearch.trim().toLowerCase();
  const filteredMembers=members.filter(member=>!query||`${member.first_name||""} ${member.last_name||""} ${member.email||""} ${member.fitness_goal||""}`.toLowerCase().includes(query));
  const goalCounts=members.reduce((counts,member)=>{const goal=member.fitness_goal?.trim()||"Not specified";counts[goal]=(counts[goal]||0)+1;return counts;},{});
  const goals=Object.entries(goalCounts).sort((a,b)=>b[1]-a[1]);
  const weeklyCounts=Object.fromEntries(DAYS.map(day=>[day,{assigned:0,completed:0}]));
  members.forEach(member=>(member.workouts_by_day||[]).forEach(item=>{
    let day=String(item.day||"").trim();
    const namedDay=DAYS.find(value=>value.toLowerCase()===day.toLowerCase());
    if(!namedDay&&/^\d{4}-\d{2}-\d{2}/.test(day)){
      const date=new Date(`${day.slice(0,10)}T00:00:00Z`);
      day=DAYS[(date.getUTCDay()+6)%7];
    }else{
      day=namedDay;
    }
    if(day&&weeklyCounts[day]){
      weeklyCounts[day].assigned+=Number(item.assigned||0);
      weeklyCounts[day].completed+=Number(item.completed||0);
    }
  }));
  const weeklyHasData=DAYS.some(day=>weeklyCounts[day].assigned>0);
  const workoutBreakdown={labels:["Completed","Remaining"],datasets:[{data:[completedTotal,remainingTotal],backgroundColor:["#22c55e","#f97316"],borderWidth:0}]};
  const goalBreakdown={labels:goals.map(([goal])=>goal),datasets:[{data:goals.map(([,count])=>count),backgroundColor:goals.map((_,index)=>CHART_COLORS[index%CHART_COLORS.length]),borderWidth:0}]};
  const memberProgress={labels:members.map(member=>`${member.first_name} ${member.last_name}`),datasets:[
    {label:"Completed",data:members.map(member=>Number(member.completed_workouts||0)),backgroundColor:"#22c55e",borderRadius:4},
    {label:"Remaining",data:members.map(member=>Math.max(Number(member.assigned_workouts||0)-Number(member.completed_workouts||0),0)),backgroundColor:"#f97316",borderRadius:4},
  ]};
  const weeklyActivity={labels:DAYS,datasets:[
    {label:"Assigned",data:DAYS.map(day=>weeklyCounts[day].assigned),backgroundColor:"#f97316",borderRadius:5},
    {label:"Completed",data:DAYS.map(day=>weeklyCounts[day].completed),backgroundColor:"#22c55e",borderRadius:5},
  ]};
  const panelClass="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
  return <div className="space-y-6 px-4 py-6 sm:px-6 sm:py-8"><MemberProfileModal member={profileMember} onClose={()=>setProfileMember(null)} onViewProgress={setProgressMember}/>{progressMember&&<ProgressHistoryModal member={progressMember} fetchProgress={fetchTrainerProgress} onClose={()=>setProgressMember(null)}/>}
    <header className="ave-page-hero rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Coach workspace</p>
      <h1 className="mt-2 flex items-center gap-2 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl"><Users size={25} className="text-orange-500"/> Dashboard</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">Review member profiles, goals, and progress. Create workout plans from the Workout Plans page.</p>
    </header>
    {fetchError&&<div role="alert" className="mb-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">{fetchError}</div>}
    <section aria-labelledby="trainer-analytics-heading" className="mb-8">
      <div className="mb-4"><TrainingPulse audience="trainer" /></div>
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500"><TrendingUp size={19}/></span>
        <div>
          <h2 id="trainer-analytics-heading" className="text-lg font-bold text-slate-900 dark:text-white">Workout analytics</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">A snapshot of member activity and training progress</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {[
          { label: "Roster members", value: members.length, icon: Users, tone: "text-sky-500 bg-sky-500/10" },
          { label: "Workouts assigned", value: assignedTotal, icon: ClipboardList, tone: "text-orange-500 bg-orange-500/10" },
          { label: "Workouts completed", value: completedTotal, icon: CircleCheck, tone: "text-green-500 bg-green-500/10" },
          { label: "Completion rate", value: `${completionRate}%`, icon: TrendingUp, tone: "text-violet-500 bg-violet-500/10" },
          { label: "Members without workouts", value: membersWithoutWorkouts, icon: AlertTriangle, tone: "text-amber-500 bg-amber-500/10" },
        ].map(({ label, value, icon: Icon, tone })=><div key={label} className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5"><div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">{label}</p><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={17}/></span></div><p className="mt-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white">{loading?"—":value}</p></div>)}
      </div>
      {!loading&&members.length>0&&<div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className={panelClass}>
          <div className="mb-2"><h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Workout completion</h3><p className="mt-1 text-xs text-slate-500">Completed vs. remaining assigned workouts</p></div>
          <div className="relative h-64">{assignedTotal?<Doughnut data={workoutBreakdown} options={doughnutOptions}/>:<p className="flex h-full items-center justify-center text-sm text-slate-500">No workouts assigned yet.</p>}{assignedTotal>0&&<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-7"><span className="text-3xl font-black text-slate-900 dark:text-white">{completionRate}%</span><span className="text-xs font-medium text-slate-500">completed</span></div>}</div>
        </div>
        <div className={panelClass}>
          <div className="mb-2"><h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Member goals</h3><p className="mt-1 text-xs text-slate-500">Roster distribution by fitness goal</p></div>
          <div className="relative h-64">{goals.length?<Doughnut data={goalBreakdown} options={doughnutOptions}/>:<p className="flex h-full items-center justify-center text-sm text-slate-500">No member goals recorded.</p>}</div>
        </div>
        <div className={`${panelClass} xl:col-span-2`}>
          <div className="mb-3"><h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Workout completion by member</h3><p className="mt-1 text-xs text-slate-500">Compare completed and remaining workouts across your roster</p></div>
          {assignedTotal?<div className="max-h-[480px] overflow-y-auto pr-2"><div style={{ height: Math.max(260, Math.min(members.length * 38, 480)) }}><Bar data={memberProgress} options={memberBarOptions}/></div></div>:<p className="py-12 text-center text-sm text-slate-500">Create workout plans to compare member completion.</p>}
        </div>
        <div className={`${panelClass} xl:col-span-2`}>
          <div className="mb-3"><h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Weekly workout schedule</h3><p className="mt-1 text-xs text-slate-500">Assigned and completed workouts by weekday</p></div>
          {weeklyHasData?<div className="h-64"><Bar data={weeklyActivity} options={weeklyBarOptions}/></div>:<p className="py-12 text-center text-sm text-slate-500">No weekday workout schedule data yet.</p>}
        </div>
      </div>}
    </section>
  </div>;
}
