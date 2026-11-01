import { useState } from "react";
import OnboardingShell from "../components/layout/OnboardingShell";
import { useNavigate } from "react-router-dom";

const injuryOptions = ["Knee", "Back", "Shoulder", "Hip", "Ankle", "Wrist", "Neck", "None"];
const healthOptions = ["Heart Condition", "Diabetes", "Asthma", "High Blood Pressure", "Arthritis", "None"];
const experienceLevels = ["Beginner", "Intermediate", "Advanced"];

function Chip({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition ${
        selected
          ? "border-orange-500 bg-orange-500/20 text-orange-500"
          : "border-slate-200 text-slate-500 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}

export default function HealthConditions() {
  const navigate = useNavigate();
  const [experience, setExperience] = useState("Beginner");
  const [injuries, setInjuries] = useState([]);
  const [healthConditions, setHealthConditions] = useState([]);
  const [validationError, setValidationError] = useState("");

  const toggleChip = (value, list, setList) => {
    if (value === "None") { setList(["None"]); return; }
    const filtered = list.filter((i) => i !== "None");
    if (filtered.includes(value)) {
      setList(filtered.filter((i) => i !== value));
    } else {
      setList([...filtered, value]);
    }
  };

  const handleContinue = () => {
    if (!injuries.length || !healthConditions.length) {
      setValidationError("Please select at least one option for both injury areas and health conditions. Choose “None” if you have no concerns.");
      return;
    }

    const selectedAllInjuries = injuries.length === injuryOptions.length - 1;
    const selectedAllConditions = healthConditions.length === healthOptions.length - 1;
    if ((selectedAllInjuries || selectedAllConditions) && !window.confirm(
      "You selected every listed " +
      [selectedAllInjuries && "injury area", selectedAllConditions && "health condition"].filter(Boolean).join(" and ") +
      ". Please make sure these answers are correct. Continue anyway?"
    )) {
      return;
    }

    setValidationError("");
    sessionStorage.setItem("avefit_health", JSON.stringify({ experience, injuries, healthConditions }));
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

    {/* Injury Areas */}
    <div className="mb-6">
      <label className="block text-sm font-medium text-slate-600 mb-3">Injury or Pain Areas</label>
      <div className="flex flex-wrap gap-2">
        {injuryOptions.map((opt) => (
          <Chip key={opt} label={opt} selected={injuries.includes(opt)}
            onClick={() => { toggleChip(opt, injuries, setInjuries); setValidationError(""); }} />
        ))}
      </div>
    </div>

    {/* Health Conditions */}
    <div className="mb-8">
      <label className="block text-sm font-medium text-slate-600 mb-3">Health Conditions</label>
      <div className="flex flex-wrap gap-2">
        {healthOptions.map((opt) => (
          <Chip key={opt} label={opt} selected={healthConditions.includes(opt)}
            onClick={() => { toggleChip(opt, healthConditions, setHealthConditions); setValidationError(""); }} />
        ))}
      </div>
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