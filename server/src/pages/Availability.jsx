import { useState } from "react";
import { useNavigate } from "react-router-dom";

const daysPerWeekOptions = ["1", "2", "3", "4", "5", "6", "7"];
const preferredDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function Chip({ label, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition ${
        selected
          ? "border-blue-500 bg-blue-500/20 text-blue-300"
          : "border-slate-700 text-slate-400 hover:border-slate-600"
      }`}
    >
      {label}
    </button>
  );
}

export default function Availability() {
  const navigate = useNavigate();
  // Single-select: only one "days per week" value can be chosen.
  const [daysPerWeek, setDaysPerWeek] = useState("3");
  // Multi-select: which specific days of the week the user will actually train.
  const [days, setDays] = useState([]);
  const [error, setError] = useState("");

  const toggleDay = (value) => {
    if (days.includes(value)) {
      setDays(days.filter((d) => d !== value));
    } else {
      if (days.length >= parseInt(daysPerWeek)) {
        setError(`You picked ${daysPerWeek} day${daysPerWeek !== "1" ? "s" : ""} per week — deselect a day first.`);
        return;
      }
      setError("");
      setDays([...days, value]);
    }
  };

  const handleDaysPerWeekChange = (value) => {
    setDaysPerWeek(value);
    // Trim any already-picked preferred days that now exceed the new count.
    setDays((prev) => prev.slice(0, parseInt(value)));
    setError("");
  };

  const handleContinue = () => {
    if (days.length === 0) {
      setError("Please select at least one preferred workout day.");
      return;
    }
    if (days.length !== parseInt(daysPerWeek)) {
      setError(`Please select exactly ${daysPerWeek} preferred day${daysPerWeek !== "1" ? "s" : ""}.`);
      return;
    }

    sessionStorage.setItem(
      "avefit_availability",
      JSON.stringify({ daysPerWeek, days })
    );

    navigate("/user/coach");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4, 5, 6].map((step) => (
            <div key={step} className={`flex-1 h-1.5 rounded-full ${step <= 4 ? "bg-blue-500" : "bg-slate-700"}`} />
          ))}
        </div>

        <div className="bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700 max-h-[85vh] overflow-y-auto">
          <button onClick={() => navigate("/user/health")} className="text-slate-400 hover:text-white text-sm mb-4 flex items-center gap-1">
            ← Back
          </button>

          <h2 className="text-2xl font-bold text-white mb-1">Workout Availability</h2>
          <p className="text-slate-400 text-sm mb-6">When are you available to work out?</p>

          {/* Days Per Week — single select */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-300 mb-3">Days Per Week</label>
            <div className="flex flex-wrap gap-2">
              {daysPerWeekOptions.map((d) => (
                <Chip key={d} label={`${d} day${d !== "1" ? "s" : ""}`} selected={daysPerWeek === d}
                  onClick={() => handleDaysPerWeekChange(d)} />
              ))}
            </div>
          </div>

          {/* Preferred Days — pick exactly as many as Days Per Week */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-slate-300">Preferred Days</label>
              <span className="text-xs text-slate-500">{days.length}/{daysPerWeek} selected</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {preferredDays.map((d) => (
                <Chip key={d} label={d.slice(0, 3)} selected={days.includes(d)}
                  onClick={() => toggleDay(d)} />
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Only these days will show workouts on your schedule — the rest will be marked as Rest Day.
            </p>
          </div>

          {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

          <button
            onClick={handleContinue}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition"
          >
            Continue to Coach Selection →
          </button>
        </div>
      </div>
    </div>
  );
}
