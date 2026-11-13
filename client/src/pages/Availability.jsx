import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import OnboardingShell from "../components/layout/OnboardingShell";
import WeeklyWorkoutAvailability from "../components/WeeklyWorkoutAvailability";
import { evaluateCoachAvailability } from "../utils/availabilityMatching";

export default function Availability() {
  const navigate = useNavigate();
  const location = useLocation();
  const comparisonCoach = location.state?.comparisonCoach;
  const handleContinue = useCallback((draft) => {
    if (!comparisonCoach) {
      navigate("/user/coach");
      return;
    }

    const coachStatus = evaluateCoachAvailability(comparisonCoach, draft);
    if (!coachStatus.can_select || !comparisonCoach.trainer_id) {
      navigate("/user/coach");
      return;
    }

    sessionStorage.setItem("avefit_trainer", JSON.stringify({
      trainer_id: comparisonCoach.trainer_id,
      full_name: comparisonCoach.full_name,
      schedule_compatible: coachStatus.schedule_compatible,
    }));
    navigate("/user/confirm");
  }, [comparisonCoach, navigate]);
  const handleBack = useCallback(
    () => navigate(comparisonCoach ? "/user/coach" : "/user/health"),
    [comparisonCoach, navigate]
  );
  let experienceLevel = "Beginner";
  try {
    experienceLevel = JSON.parse(sessionStorage.getItem("avefit_health") || "{}").experience || experienceLevel;
  } catch {
    console.error("Could not read the saved onboarding experience level.");
  }

  return (
    <OnboardingShell step={4} width={comparisonCoach ? "max-w-4xl" : "max-w-2xl"}>
      <button onClick={handleBack} className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        ← {comparisonCoach ? "Back to coach selection" : "Back"}
      </button>
      <WeeklyWorkoutAvailability
        onContinue={handleContinue}
        experienceLevel={experienceLevel}
        comparisonCoach={comparisonCoach}
      />
    </OnboardingShell>
  );
}
