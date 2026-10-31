import { useEffect, useState } from "react";
import OnboardingShell from "../components/layout/OnboardingShell";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, TrendingUp, User } from "lucide-react";
import { useUserAuth } from "../context/UserAuthContext";
import userApi from "../userApi";

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-200 last:border-0">
      <span className="text-slate-500 text-sm">{label}</span>
      <span className="text-slate-900 text-sm font-medium text-right">{value}</span>
    </div>
  );
}

export default function SetupConfirmation() {
  const navigate = useNavigate();
  const { updateUser } = useUserAuth();
  const [profile, setProfile] = useState(null);
  const [goalData, setGoalData] = useState({});
  const [healthData, setHealthData] = useState({});
  const [availability, setAvailability] = useState({});
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const goal = JSON.parse(sessionStorage.getItem("avefit_goal") || "{}");
    const health = JSON.parse(sessionStorage.getItem("avefit_health") || "{}");
    const avail = JSON.parse(sessionStorage.getItem("avefit_availability") || "{}");
    setGoalData(goal);
    setHealthData(health);
    setAvailability(avail);

    userApi.get("/profile")
      .then(async (res) => {
        const p = res.data.data;
        setProfile(p);

        try {
          const predictionResponse = await userApi.post("/progress/auto-predict", {
            goal: goal.goal,
            current_weight: p.weight,
            target_weight: goal.targetWeight,
            height: p.height,
            days_per_week: avail.daysPerWeek,
            intensity: 3,
            experience: health.experience,
          });
          setPrediction(predictionResponse?.data?.data || null);
        } catch (err) {
          console.error("Setup timeline prediction failed:", err);
          setError("Your setup loaded, but the predicted timeline is unavailable.");
        }
      })
      .catch((err) => {
        console.error("Setup profile load failed:", err);
        setProfile(null);
        setError(
          err.response?.data?.message ||
          "Your profile could not be loaded. Please refresh before saving your setup."
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const handleConfirm = async () => {
    setSaving(true);
    try {
      const setupProfile = { ...profile };
      delete setupProfile.trainer_id;
      await userApi.put("/profile", {
        ...setupProfile,
        fitness_goal: goalData.goal || "General Fitness",
        activity_level: healthData.experience || "Beginner",
        target_weight: goalData.targetWeight || null,
        workout_days_per_week: availability.daysPerWeek ? parseInt(availability.daysPerWeek) : null,
        workout_duration: availability.duration ? parseInt(String(availability.duration), 10) : null,
        preferred_days: availability.days || [],
        preferred_workout_time: availability.preferredWorkoutTime || null,
        intensity: 3,
        injuries: healthData.injuries || [],
        health_conditions: healthData.healthConditions || [],
        setup_completed: true,
      });

      sessionStorage.removeItem("avefit_goal");
      sessionStorage.removeItem("avefit_health");
      sessionStorage.removeItem("avefit_availability");

      updateUser({ setup_completed: true });
      navigate("/user/workout");
    } catch (err) {
      console.error("Setup save failed:", err);
      setError(
        err.response?.data?.message ||
        "Something went wrong saving your setup. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <OnboardingShell step={6} scroll>
    <button onClick={() => navigate("/user/coach")} className="text-slate-500 hover:text-slate-900 text-sm mb-4 flex items-center gap-1">
      ← Back
    </button>

    <h2 className="text-2xl font-bold text-slate-900 mb-1">Confirm Your Setup</h2>
    <p className="text-slate-500 text-sm mb-6">Review everything before we build your dashboard.</p>

    {loading ? (
      <div className="space-y-3 mb-6">
        {[...Array(4)].map((_, i) => <div key={i} className="h-10 bg-slate-50 rounded-xl animate-pulse" />)}
      </div>
    ) : (
      <>
        {/* Body Assessment */}
        <div className="bg-slate-50 rounded-2xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-600 mb-2 flex items-center gap-2">
            <User size={14} /> Body Assessment
          </h3>
          <Row label="Gender" value={profile?.gender || "—"} />
          <Row label="Age" value={profile?.age ? `${profile.age} yrs` : "—"} />
          <Row label="Height" value={profile?.height ? `${profile.height} cm` : "—"} />
          <Row label="Weight" value={profile?.weight ? `${profile.weight} kg` : "—"} />
        </div>

        {/* Goal */}
        <div className="bg-slate-50 rounded-2xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-600 mb-2">Goal</h3>
          <Row label="Fitness Goal" value={goalData.goal || "—"} />
          <Row label="Target Weight" value={goalData.targetWeight ? `${goalData.targetWeight} kg` : "—"} />
        </div>

        {/* Health */}
        <div className="bg-slate-50 rounded-2xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-600 mb-2">Health &amp; Experience</h3>
          <Row label="Experience Level" value={healthData.experience || "—"} />
          <Row label="Injuries" value={(healthData.injuries || []).join(", ") || "None"} />
          <Row label="Health Conditions" value={(healthData.healthConditions || []).join(", ") || "None"} />
        </div>

        {/* Availability */}
        <div className="bg-slate-50 rounded-2xl p-4 mb-4">
          <h3 className="text-sm font-semibold text-slate-600 mb-2">Availability</h3>
          <Row label="Days Per Week" value={availability.daysPerWeek || "—"} />
          <Row label="Session Duration" value={availability.duration || "—"} />
          <Row label="Workout Days" value={(availability.availability || []).map((slot) => `${slot.day_of_week} (${slot.time_preference})`).join(", ") || "—"} />
        </div>

        {/* Predictive Analytics */}
        {prediction && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 mb-4">
            <h3 className="text-sm font-semibold text-orange-500 mb-3 flex items-center gap-2">
              <TrendingUp size={14} /> Predicted Timeline
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-green-400">{prediction.weeks_needed_consistent}w</p>
                <p className="text-xs text-slate-500 mt-1">If consistent</p>
                <p className="text-[11px] text-slate-500">(~{prediction.months_needed_consistent} mo)</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-yellow-400">{prediction.weeks_needed_inconsistent}w</p>
                <p className="text-xs text-slate-500 mt-1">If inconsistent</p>
                <p className="text-[11px] text-slate-500">(~{prediction.months_needed_inconsistent} mo)</p>
              </div>
            </div>
            {prediction.note && <p className="text-xs text-slate-500 mt-3">{prediction.note}</p>}
          </div>
        )}
      </>
    )}

    {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

    <button
      onClick={handleConfirm}
      disabled={saving || loading || !profile}
      className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2"
    >
      <CheckCircle2 size={18} />
      {saving ? "Setting up your dashboard..." : "Confirm & Go to Dashboard"}
    </button>
    </OnboardingShell>
  );
}
