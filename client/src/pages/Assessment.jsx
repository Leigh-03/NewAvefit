import { useState } from "react";
import OnboardingShell from "../components/layout/OnboardingShell";
import { useNavigate } from "react-router-dom";
import { useUserAuth } from "../context/UserAuthContext";
import userApi from "../userApi";

const sanitizeNumberInput = (value) => {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole, ...fraction] = cleaned.split(".");
  return fraction.length ? `${whole}.${fraction[0]}` : whole;
};

export default function Assessment() {
  const navigate = useNavigate();
  const { user } = useUserAuth();
  const [gender, setGender] = useState("Male");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [bmi, setBmi] = useState(null);
  const [bmiCategory, setBmiCategory] = useState("");
  const [calculated, setCalculated] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");

  const validateFields = () => {
    const fields = [
      { key: "age", label: "Age", value: age, min: 12, max: 90, integer: true },
      { key: "weight", label: "Weight", value: weight, min: 30, max: 300 },
      { key: "height", label: "Height", value: height, min: 100, max: 250 },
    ];
    const errors = {};

    fields.forEach(({ key, label, value, min, max, integer = false }) => {
      if (!value.trim()) {
        errors[key] = `${label} is required.`;
        return;
      }
      const number = Number(value);
      if (!Number.isFinite(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
        errors[key] = key === "age"
          ? "Age must be a whole number between 12 and 90."
          : `Enter a ${label.toLowerCase()} between ${min} and ${max}.`;
      }
    });

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const getBMICategory = (bmi) => {
    if (bmi < 18.5) return { label: "Underweight", color: "text-orange-500" };
    if (bmi < 25) return { label: "Normal Weight", color: "text-green-400" };
    if (bmi < 30) return { label: "Overweight", color: "text-yellow-400" };
    return { label: "Obese", color: "text-red-400" };
  };

  const handleCalculate = () => {
    setFormError("");
    if (!validateFields()) {
      setCalculated(false);
      setBmi(null);
      return;
    }
    const h = parseFloat(height) / 100;
    const result = (parseFloat(weight) / (h * h)).toFixed(1);
    const cat = getBMICategory(parseFloat(result));
    setBmi(result);
    setBmiCategory(cat);
    setCalculated(true);
  };

  const handleContinue = async () => {
    setFormError("");
    if (!validateFields()) return;
    if (!calculated) {
      setFormError("Calculate your BMI before continuing.");
      return;
    }

    try {
      await userApi.put("/profile", {
        ...user,
        gender,
        age: parseInt(age),
        weight: parseFloat(weight),
        height: parseFloat(height),
      });
      navigate("/user/goal");
    } catch (err) {
      console.error(err);
      setFormError("We couldn't save your assessment. Please try again.");
    }
  };

  return (
    <OnboardingShell step={1}>
    <button onClick={() => navigate("/user/login")} className="text-slate-500 hover:text-slate-900 text-sm mb-4 flex items-center gap-1">
      ← Back
    </button>

    <h2 className="text-2xl font-bold text-slate-900 mb-1">Body Assessment</h2>
    <p className="text-slate-500 text-sm mb-6">Tell us about your body so we can calculate your BMI.</p>

    {/* Gender Toggle */}
    <div className="mb-5">
      <label className="block text-sm font-medium text-slate-600 mb-2">Gender</label>
      <div className="flex bg-slate-50 rounded-xl p-1">
        {["Male", "Female"].map((g) => (
          <button
            key={g}
            onClick={() => setGender(g)}
            className={`flex-1 py-2.5 rounded-lg font-semibold text-sm transition ${
              gender === g ? "bg-orange-500 text-white" : "text-slate-500 hover:text-white"
            }`}
          >
            {g === "Male" ? "♂ Male" : "♀ Female"}
          </button>
        ))}
      </div>
    </div>

    {/* Inputs */}
    <div className="space-y-4 mb-6">
      {[
        { label: "Age (12–90)", key: "age", value: age, setter: setAge, unit: "years", min: 12, max: 90 },
        { label: "Weight", key: "weight", value: weight, setter: setWeight, unit: "kg", min: 30, max: 300 },
        { label: "Height", key: "height", value: height, setter: setHeight, unit: "cm", min: 100, max: 250 },
      ].map((f) => (
        <div key={f.key}>
          <label htmlFor={f.key} className="block text-sm font-medium text-slate-600 mb-1">{f.label}</label>
          <div className="relative">
            <input
              id={f.key}
              type="text"
              inputMode={f.key === "age" ? "numeric" : "decimal"}
              pattern="[0-9]*[.]?[0-9]*"
              value={f.value}
              onChange={(e) => {
                f.setter(sanitizeNumberInput(e.target.value));
                setFieldErrors((errors) => ({ ...errors, [f.key]: "" }));
                setFormError("");
                setCalculated(false);
                setBmi(null);
              }}
              min={f.min}
              max={f.max}
              placeholder={`Enter ${f.label.toLowerCase()}`}
              aria-invalid={Boolean(fieldErrors[f.key])}
              aria-describedby={fieldErrors[f.key] ? `${f.key}-error` : undefined}
              className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 pr-14 ${
                fieldErrors[f.key] ? "border-red-500" : "border-slate-200"
              }`}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 text-sm">{f.unit}</span>
          </div>
          {fieldErrors[f.key] && (
            <p id={`${f.key}-error`} className="mt-1 text-sm text-red-600" role="alert">
              {fieldErrors[f.key]}
            </p>
          )}
        </div>
      ))}
    </div>

    {/* BMI Result */}
    {calculated && bmi && (
      <div className="bg-slate-50 rounded-2xl p-4 mb-5 text-center">
        <p className="text-slate-500 text-sm">Your BMI</p>
        <p className="text-4xl font-bold text-slate-900 mt-1">{bmi}</p>
        <p className={`text-sm font-semibold mt-1 ${bmiCategory.color}`}>{bmiCategory.label}</p>
        <div className="mt-3 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              parseFloat(bmi) < 18.5 ? "bg-orange-500 w-1/4" :
              parseFloat(bmi) < 25 ? "bg-green-500 w-2/4" :
              parseFloat(bmi) < 30 ? "bg-yellow-500 w-3/4" : "bg-red-500 w-full"
            }`}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-500 mt-1">
          <span>Under</span><span>Normal</span><span>Over</span><span>Obese</span>
        </div>
      </div>
    )}

    <button
      onClick={handleCalculate}
      className="w-full bg-slate-100 hover:bg-slate-200 text-slate-900 font-semibold py-3 rounded-xl transition mb-3"
    >
      Calculate BMI
    </button>

    <button
      onClick={handleContinue}
      className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition"
    >
      Continue to Goal Setup →
    </button>
    {formError && (
      <p className="mt-3 text-sm text-red-600" role="alert">
        {formError}
      </p>
    )}
    </OnboardingShell>
  );
}