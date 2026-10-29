
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUserAuth } from "../context/UserAuthContext";
import userApi from "../userApi";

export default function Assessment() {
  const navigate = useNavigate();
  const { user } = useUserAuth();

  const [gender, setGender] = useState(user?.gender || "Male");
  const [age, setAge] = useState(user?.age?.toString() || "");
  const [weight, setWeight] = useState(user?.weight?.toString() || "");
  const [height, setHeight] = useState(user?.height?.toString() || "");
  const [bmi, setBmi] = useState(null);
  const [bmiCategory, setBmiCategory] = useState("");
  const [calculated, setCalculated] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const getBMICategory = (value) => {
    if (value < 18.5) {
      return { label: "Underweight", color: "text-blue-400" };
    }
    if (value < 25) {
      return { label: "Normal Weight", color: "text-green-400" };
    }
    if (value < 30) {
      return { label: "Overweight", color: "text-yellow-400" };
    }
    return { label: "Obese", color: "text-red-400" };
  };

  const handleCalculate = () => {
    setError("");

    const ageValue = Number(age);
    const weightValue = Number(weight);
    const heightValue = Number(height);

    if (!age || !weight || !height) {
      setError("Please enter your age, weight, and height.");
      return;
    }

    if (!Number.isFinite(ageValue) || ageValue < 10 || ageValue > 100) {
      setError("Age must be between 10 and 100 years.");
      return;
    }

    if (
      !Number.isFinite(weightValue) ||
      weightValue < 30 ||
      weightValue > 300
    ) {
      setError("Weight must be between 30 and 300 kg.");
      return;
    }

    if (
      !Number.isFinite(heightValue) ||
      heightValue < 100 ||
      heightValue > 250
    ) {
      setError("Height must be between 100 and 250 cm.");
      return;
    }

    const heightInMeters = heightValue / 100;
    const result = Number(
      (weightValue / (heightInMeters * heightInMeters)).toFixed(1)
    );

    setBmi(result);
    setBmiCategory(getBMICategory(result));
    setCalculated(true);
  };

  const handleContinue = async () => {
    if (saving) return;

    if (!calculated) {
      setError("Please calculate your BMI before continuing.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      await userApi.put("/profile", {
        gender,
        age: Number(age),
        weight: Number(weight),
        height: Number(height),
      });

      navigate("/user/goal");
    } catch (err) {
      console.error(
        "Assessment save failed:",
        err.response?.data || err.message
      );

      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "We couldn't save your assessment. Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 mb-8">
          {[1, 2, 3, 4, 5, 6].map((step) => (
            <div
              key={step}
              className={`flex-1 h-1.5 rounded-full ${
                step === 1 ? "bg-blue-500" : "bg-slate-700"
              }`}
            />
          ))}
        </div>

        <div className="bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700">
          <button
            type="button"
            onClick={() => navigate("/user/login")}
            className="text-slate-400 hover:text-white text-sm mb-4"
          >
            ← Back
          </button>

          <h2 className="text-2xl font-bold text-white mb-1">
            Body Assessment
          </h2>
          <p className="text-slate-400 text-sm mb-6">
            Tell us about your body so we can calculate your BMI.
          </p>

          <div className="mb-5">
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Gender
            </label>

            <div className="flex bg-slate-900 rounded-xl p-1">
              {["Male", "Female"].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setGender(value);
                    setError("");
                  }}
                  className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition ${
                    gender === value
                      ? "bg-blue-600 text-white"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {value === "Male" ? "♂ Male" : "♀ Female"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 mb-6">
            {[
              {
                label: "Age",
                key: "age",
                value: age,
                setter: setAge,
                unit: "years",
                min: 10,
                max: 100,
              },
              {
                label: "Weight",
                key: "weight",
                value: weight,
                setter: setWeight,
                unit: "kg",
                min: 30,
                max: 300,
              },
              {
                label: "Height",
                key: "height",
                value: height,
                setter: setHeight,
                unit: "cm",
                min: 100,
                max: 250,
              },
            ].map((field) => (
              <div key={field.key}>
                <label
                  htmlFor={`assessment-${field.key}`}
                  className="block text-sm font-medium text-slate-300 mb-1"
                >
                  {field.label}
                </label>

                <div className="relative">
                  <input
                    id={`assessment-${field.key}`}
                    type="number"
                    inputMode="decimal"
                    value={field.value}
                    onChange={(e) => {
                      field.setter(e.target.value);
                      setCalculated(false);
                      setBmi(null);
                      setError("");
                    }}
                    min={field.min}
                    max={field.max}
                    step="any"
                    required
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-14"
                  />

                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">
                    {field.unit}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"
            >
              {error}
            </div>
          )}

          {calculated && bmi !== null && (
            <div className="bg-slate-900 rounded-2xl p-4 mb-5 text-center">
              <p className="text-slate-400 text-sm">Your BMI</p>
              <p className="text-4xl font-bold text-white mt-1">{bmi}</p>
              <p
                className={`text-sm font-semibold mt-1 ${bmiCategory.color}`}
              >
                {bmiCategory.label}
              </p>

              <div className="mt-3 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    bmi < 18.5
                      ? "bg-blue-500 w-1/4"
                      : bmi < 25
                        ? "bg-green-500 w-2/4"
                        : bmi < 30
                          ? "bg-yellow-500 w-3/4"
                          : "bg-red-500 w-full"
                  }`}
                />
              </div>

              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>Under</span>
                <span>Normal</span>
                <span>Over</span>
                <span>Obese</span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleCalculate}
            disabled={saving}
            className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition mb-3"
          >
            Calculate BMI
          </button>

          <button
            type="button"
            onClick={handleContinue}
            disabled={!calculated || saving}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold py-3 rounded-xl transition"
          >
            {saving ? "Saving assessment..." : "Continue to Goal Setup →"}
          </button>
        </div>
      </div>
    </div>
  );
}
