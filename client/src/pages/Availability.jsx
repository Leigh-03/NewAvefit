import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import OnboardingShell from "../components/layout/OnboardingShell";
import WeeklyWorkoutAvailability from "../components/WeeklyWorkoutAvailability";

export default function Availability() {
  const navigate = useNavigate();
  const handleContinue = useCallback(() => navigate("/user/coach"), [navigate]);
  let experienceLevel = "Beginner";
  try {
    experienceLevel = JSON.parse(sessionStorage.getItem("avefit_health") || "{}").experience || experienceLevel;
  } catch {
    console.error("Could not read the saved onboarding experience level.");
  }

  return (
    <OnboardingShell step={4} scroll>
      <button onClick={() => navigate("/user/health")} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        ← Back
      </button>
      <WeeklyWorkoutAvailability onContinue={handleContinue} experienceLevel={experienceLevel} />
    </OnboardingShell>
  );
}
