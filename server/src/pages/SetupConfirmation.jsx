import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, TrendingUp, User } from "lucide-react";
import { useUserAuth } from "../context/UserAuthContext";
import userApi from "../userApi";

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-white text-sm font-medium text-right">{value}</span>
    </div>
  );
}

export default function SetupConfirmation() {
  const navigate = useNavigate();
  const { user, updateUser } = useUserAuth();
  const [profile, setProfile] = useState(null);
  const [goalData, setGoalData] = useState({});
  const [healthData, setHealthData] = useState({});
  const [availability, setAvailability] = useState({});
  const [trainer, setTrainer] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const goal = JSON.parse(sessionStorage.getItem("avefit_goal") || "{}");
    const health = JSON.parse(sessionStorage.getItem("avefit_health") || "{}");
    const avail = JSON.parse(sessionStorage.getItem("avefit_availability") || "{}");
    const coach = JSON.parse(sessionStorage.getItem("avefit_trainer") || "null");
    setGoalData(goal);
    setHealthData(health);
    setAvailability(avail);
    setTrainer(coach);

    userApi.get("/profile")
      .then((res) => {
        const p = res.data.data;
        setProfile(p);

        return userApi.post("/progress/auto-predict", {
          goal: goal.goal,
          current_weight: p.weight,
          target_weight: goal.targetWeight,
          height: p.height,
          days_per_week: avail.daysPerWeek,
          intensity: health.intensity,
          experience: health.experience,
        });
      })
      .then((res) => setPrediction(res?.data?.data || null))
      .catch((err) => {
        console.error(err);
        setError("Some of your info couldn't load — you can still continue.");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await userApi.put("/profile", {
        ...profile,
        fitness_goal: goalData.goal || "General Fitness",
        activity_level: healthData.experience || "Beginner",
        target_weight: goalData.targetWeight || null,
        workout_days_per_week: availability.daysPerWeek ? parseInt(availability.daysPerWeek) : null,
        preferred_days: availability.days || [],
        intensity: healthData.intensity || null,
        injuries: healthData.injuries || [],
        health_conditions: healthData.healthConditions || [],
        trainer_id: trainer?.trainer_id || null,
        setup_completed: true,
      });

      sessionStorage.removeItem("avefit_goal");
      sessionStorage.removeItem("avefit_health");
      sessionStorage.removeItem("avefit_availability");
      sessionStorage.removeItem("avefit_trainer");

      updateUser({ setup_completed: true });
      navigate("/user/workout");
    } catch (err) {
      console.error(err);
      setError("Something went wrong saving your setup. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4, 5, 6].map((step) => (
            <div key={step} className="flex-1 h-1.5 rounded-full bg-blue-500" />
          ))}
        </div>

        <div className="bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700 max-h-[85vh] overflow-y-auto">
          <button onClick={() => navigate("/user/coach")} className="text-slate-400 hover:text-white text-sm mb-4 flex items-center gap-1">
            ← Back
          </button>

          <h2 className="text-2xl font-bold text-white mb-1">Confirm Your Setup</h2>
          <p className="text-slate-400 text-sm mb-6">Review everything before we build your dashboard.</p>

          {loading ? (
            <div className="space-y-3 mb-6">
              {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-900 rounded-xl animate-pulse" />)}
            </div>
          ) : (
            <>
              {/* Body Assessment */}
              <div className="bg-slate-900 rounded-2xl p-4 mb-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
                  <User size={14} /> Body Assessment
                </h3>
                <Row label="Gender" value={profile?.gender || "—"} />
                <Row label="Age" value={profile?.age ? `${profile.age} yrs` : "—"} />
                <Row label="Height" value={profile?.height ? `${profile.height} cm` : "—"} />
                <Row label="Weight" value={profile?.weight ? `${profile.weight} kg` : "—"} />
              </div>

              {/* Goal */}
              <div className="bg-slate-900 rounded-2xl p-4 mb-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Goal</h3>
                <Row label="Fitness Goal" value={goalData.goal || "—"} />
                <Row label="Target Weight" value={goalData.targetWeight ? `${goalData.targetWeight} kg` : "—"} />
              </div>

              {/* Health */}
              <div className="bg-slate-900 rounded-2xl p-4 mb-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Health &amp; Experience</h3>
                <Row label="Experience Level" value={healthData.experience || "—"} />
                <Row label="Injuries" value={(healthData.injuries || []).join(", ") || "None"} />
                <Row label="Health Conditions" value={(healthData.healthConditions || []).join(", ") || "None"} />
              </div>

              {/* Availability */}
              <div className="bg-slate-900 rounded-2xl p-4 mb-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Availability</h3>
                <Row label="Days Per Week" value={availability.daysPerWeek || "—"} />
                <Row label="Workout Days" value={(availability.days || []).join(", ") || "—"} />
              </div>

              {/* Coach */}
              <div className="bg-slate-900 rounded-2xl p-4 mb-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-2">Coach</h3>
                <Row label="Assigned Coach" value={trainer?.full_name || "Not selected"} />
              </div>

              {/* Predictive Analytics */}
              {prediction && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-4 mb-4">
                  <h3 className="text-sm font-semibold text-blue-300 mb-3 flex items-center gap-2">
                    <TrendingUp size={14} /> Predicted Timeline
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-900/60 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-green-400">{prediction.weeks_needed_consistent}w</p>
                      <p className="text-xs text-slate-400 mt-1">If consistent</p>
                      <p className="text-[11px] text-slate-500">(~{prediction.months_needed_consistent} mo)</p>
                    </div>
                    <div className="bg-slate-900/60 rounded-xl p-3 text-center">
                      <p className="text-2xl font-bold text-yellow-400">{prediction.weeks_needed_inconsistent}w</p>
                      <p className="text-xs text-slate-400 mt-1">If inconsistent</p>
                      <p className="text-[11px] text-slate-500">(~{prediction.months_needed_inconsistent} mo)</p>
                    </div>
                  </div>
                  {prediction.note && <p className="text-xs text-slate-400 mt-3">{prediction.note}</p>}
                </div>
              )}
            </>
          )}

          {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

          <button
            onClick={handleConfirm}
            disabled={saving || loading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={18} />
            {saving ? "Setting up your dashboard..." : "Confirm & Go to Dashboard"}
          </button>
        </div>
      </div>
    </div>
  );
}
