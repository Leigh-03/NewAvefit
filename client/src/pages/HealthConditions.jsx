import { useState } from "react";
import OnboardingShell from "../components/layout/OnboardingShell";
import HealthAssessmentFields from "../components/HealthAssessmentFields";
import { HEALTH_CONDITION_OPTIONS, INJURY_OPTIONS } from "../utils/healthAssessment";
import { useNavigate } from "react-router-dom";

const experienceLevels = ["Beginner", "Intermediate", "Advanced"];

export default function HealthConditions() {
  const navigate = useNavigate();
  const [experience, setExperience] = useState("Beginner");
  const [injuries, setInjuries] = useState(["None"]);
  const [healthConditions, setHealthConditions] = useState(["None"]);
  const [injuryPainLevels, setInjuryPainLevels] = useState({});
  const [validationError, setValidationError] = useState("");

  const handleInjuriesChange = (nextInjuries) => {
    setInjuries(nextInjuries);
    setInjuryPainLevels((current) => Object.fromEntries(
      nextInjuries
        .filter((area) => area !== "None" && Object.prototype.hasOwnProperty.call(current, area))
        .map((area) => [area, current[area]])
    ));
    setValidationError("");
  };

  const handleContinue = () => {
    const savedInjuries = injuries.length ? injuries : ["None"];
    const savedHealthConditions = healthConditions.length ? healthConditions : ["None"];
    const selectedAllInjuries = savedInjuries.filter((item) => item !== "None").length === INJURY_OPTIONS.length - 1;
    const selectedAllConditions = savedHealthConditions.filter((item) => item !== "None").length === HEALTH_CONDITION_OPTIONS.length - 1;
    if ((selectedAllInjuries || selectedAllConditions) && !window.confirm(
      "You selected every listed " +
      [selectedAllInjuries && "injury area", selectedAllConditions && "health condition"].filter(Boolean).join(" and ") +
      ". Please make sure these answers are correct. Continue anyway?"
    )) {
      return;
    }

    const missingPainLevels = savedInjuries
      .filter((area) => area !== "None")
      .some((area) => !Number.isInteger(Number(injuryPainLevels[area])) || Number(injuryPainLevels[area]) < 1 || Number(injuryPainLevels[area]) > 10);
    if (missingPainLevels) {
      setValidationError("Choose a pain level from 1 to 10 for each selected injury or pain area.");
      return;
    }

    setValidationError("");
    sessionStorage.setItem("avefit_health", JSON.stringify({
      experience,
      injuries: savedInjuries,
      healthConditions: savedHealthConditions,
      injuryPainLevels,
    }));
    navigate("/user/availability");
  };

  return (
    <OnboardingShell step={3} scroll>
    <button onClick={() => navigate("/user/goal")} className="text-slate-500 hover:text-slate-900 text-sm mb-4 flex items-center gap-1">
      ← Back
    </button>

    <h2 className="text-2xl font-bold text-slate-900 mb-1">Health Conditions</h2>
    <p className="text-slate-500 text-sm mb-6">Help us make safe workout recommendations.</p>

    {/* Experience Level */}
    <div className="mb-6">
      <label className="block text-sm font-medium text-slate-600 mb-3">Experience Level</label>
      <div className="flex gap-2">
        {experienceLevels.map((level) => (
          <button
            key={level}
            onClick={() => setExperience(level)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition ${
              experience === level
                ? "border-orange-500 bg-orange-500/20 text-orange-500"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            {level}
          </button>
        ))}
      </div>
    </div>

    <div className="mb-8">
      <HealthAssessmentFields
        injuries={injuries}
        healthConditions={healthConditions}
        injuryPainLevels={injuryPainLevels}
        onInjuriesChange={handleInjuriesChange}
        onHealthConditionsChange={(next) => { setHealthConditions(next); setValidationError(""); }}
        onPainLevelChange={(area, level) => { setInjuryPainLevels((current) => ({ ...current, [area]: level })); setValidationError(""); }}
      />
    </div>

    <button
      onClick={handleContinue}
      className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition"
    >
      Continue to Workout Schedule →
    </button>
    {validationError && <p role="alert" className="mt-3 text-sm text-red-600">{validationError}</p>}
    </OnboardingShell>
  );
}