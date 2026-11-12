import { useEffect, useState, useRef } from "react";
import { Activity, Save, LogOut, ChevronRight, Camera, CircleUserRound, Dumbbell } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUserAuth } from "../context/UserAuthContext";
import { PasswordField } from "../components/ui/Form";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import userApi from "../userApi";
import { fileToCompressedDataUrl } from "../utils/imageUpload";
import WeeklyWorkoutAvailability from "../components/WeeklyWorkoutAvailability";

const getBmiCategory = (value) => {
  const bmiValue = Number(value);
  if (!Number.isFinite(bmiValue) || bmiValue <= 0) return null;
  if (bmiValue < 18.5) return { label: "Underweight", style: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300" };
  if (bmiValue < 25) return { label: "Normal", style: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300" };
  if (bmiValue < 30) return { label: "Overweight", style: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" };
  return { label: "Obese", style: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" };
};
const normalizeFitnessGoal = (goal) => goal === "Muscle Gain" ? "Gain Weight" : goal;
const isValidPhoneNumber = (phone) => /^09\d{9}$/.test(phone);
const normalizePhoneNumber = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.startsWith("09") ? digits.slice(0, 11) : `09${digits.slice(-9)}`;
};
const injuryOptions = ["Knee", "Back", "Shoulder", "Hip", "Ankle", "Wrist", "Neck", "None"];
const healthConditionOptions = ["Heart Condition", "Diabetes", "Asthma", "High Blood Pressure", "Arthritis", "None"];

const toSelectionList = (value) => {
  let items = value;
  if (typeof items === "string") {
    const trimmed = items.trim();
    if (!trimmed) return ["None"];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) items = parsed;
    } catch {
      items = trimmed.replace(/^\{|\}$/g, "").split(",");
    }
  }
  if (!Array.isArray(items)) return ["None"];
  const selected = [...new Set(items
    .map((item) => String(item).trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean))];
  if (!selected.length) return ["None"];
  return selected.includes("None") && selected.length > 1
    ? selected.filter((item) => item !== "None")
    : selected;
};

const toggleHealthSelection = (selection, value) => {
  if (value === "None") return ["None"];
  const selected = selection.filter((item) => item !== "None");
  const updated = selected.includes(value)
    ? selected.filter((item) => item !== value)
    : [...selected, value];
  return updated.length ? updated : ["None"];
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, updateUser, logoutUser } = useUserAuth();
  const fileInputRef = useRef(null);
  const originalFormRef = useRef(null);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "",
    gender: "", birth_date: "", height: "", weight: "",
    fitness_goal: "", activity_level: "",
    injuries: ["None"], health_conditions: ["None"],
  });
  const [photo, setPhoto] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [bmi, setBmi] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingHealth, setSavingHealth] = useState(false);
  const [healthSaveMessage, setHealthSaveMessage] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [passwordForm, setPasswordForm] = useState({ code: "", password: "", confirmPassword: "" });
  const [passwordCodeSent, setPasswordCodeSent] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordNotice, setPasswordNotice] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [changeRequests, setChangeRequests] = useState([]);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const bmiCategory = getBmiCategory(bmi);

  useEffect(() => {
    Promise.all([
      userApi.get("/profile"),
      userApi.get("/profile/change-requests"),
    ])
      .then(([profileResponse, requestResponse]) => {
        const d = profileResponse.data.data;
        const profileForm = {
          first_name: d.first_name || "",
          last_name: d.last_name || "",
          email: d.email || "",
          phone: normalizePhoneNumber(d.phone),
          gender: d.gender || "",
          birth_date: d.birth_date ? d.birth_date.split("T")[0] : "",
          height: d.height || "",
          weight: d.weight || "",
          fitness_goal: normalizeFitnessGoal(d.fitness_goal || ""),
          activity_level: d.activity_level || "",
          injuries: toSelectionList(d.injuries),
          health_conditions: toSelectionList(d.health_conditions),
        };
        originalFormRef.current = profileForm;
        setForm(profileForm);
        setPhoto(d.profile_image || null);
        updateUser({
          first_name: d.first_name,
          last_name: d.last_name,
          email: d.email,
          fitness_goal: normalizeFitnessGoal(d.fitness_goal),
          height: d.height,
          weight: d.weight,
          profile_image: d.profile_image || null,
          membership_months: d.membership_months,
          membership_start_date: d.membership_start_date,
          membership_end_date: d.membership_end_date,
        });
        if (d.height && d.weight) {
          const h = parseFloat(d.height) / 100;
          setBmi((parseFloat(d.weight) / (h * h)).toFixed(1));
        }
        setChangeRequests(requestResponse.data?.data || []);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(err.response?.data?.message || "Unable to load your profile. Please refresh and try again.");
      })
      .finally(() => setLoading(false));
  }, [updateUser]);

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setMsg("");
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      const response = await userApi.put("/profile/photo", { profile_image: dataUrl });
      if (response.data.request) {
        setChangeRequests((current) => [response.data.request, ...current]);
      } else {
        setPhoto(dataUrl);
      }
      setMsg(response.data.message || "Profile photo update submitted.");
    } catch (err) {
      setMsg(err.response?.data?.message || err.message || "Failed to upload photo.");
    } finally {
      setUploadingPhoto(false);
      setTimeout(() => setMsg(""), 3000);
      e.target.value = "";
    }
  };

  const handleChange = (key, val) => {
    setForm((f) => {
      const updated = { ...f, [key]: val };
      if ((key === "weight" || key === "height") && updated.weight && updated.height) {
        const h = parseFloat(updated.height) / 100;
        setBmi((parseFloat(updated.weight) / (h * h)).toFixed(1));
      }
      return updated;
    });
  };

  const handleHealthSelection = async (key, value) => {
    if (savingHealth) return;
    const previousInjuries = form.injuries;
    const previousConditions = form.health_conditions;
    const nextInjuries = key === "injuries"
      ? toggleHealthSelection(previousInjuries, value)
      : previousInjuries;
    const nextConditions = key === "health_conditions"
      ? toggleHealthSelection(previousConditions, value)
      : previousConditions;
    const updatedSelection = key === "injuries" ? nextInjuries : nextConditions;
    setForm((current) => ({
      ...current,
      injuries: nextInjuries,
      health_conditions: nextConditions,
    }));
    setSavingHealth(true);
    setHealthSaveMessage("Saving...");

    try {
      const response = await userApi.put("/profile/health", { [key]: updatedSelection });
      setForm((current) => ({
        ...current,
        injuries: key === "injuries" ? toSelectionList(response.data.data.injuries) : current.injuries,
        health_conditions: key === "health_conditions" ? toSelectionList(response.data.data.health_conditions) : current.health_conditions,
      }));
      if (originalFormRef.current) {
        originalFormRef.current = {
          ...originalFormRef.current,
          [key]: updatedSelection,
        };
      }
      setHealthSaveMessage("Saved");
    } catch (error) {
      console.error("Health assessment save failed:", error);
      setForm((current) => ({
        ...current,
        injuries: previousInjuries,
        health_conditions: previousConditions,
      }));
      setHealthSaveMessage(error.response?.data?.message || "Unable to save health information. Please try again.");
    } finally {
      setSavingHealth(false);
    }
  };

  const handleSave = async () => {
    if (!isValidPhoneNumber(form.phone)) {
      setMsg("Phone number must start with 09 and contain exactly 11 digits.");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const profileChanges = Object.fromEntries(
        Object.entries(form).filter(([key]) => !["email", "injuries", "health_conditions"].includes(key))
      );
      const res = await userApi.put("/profile", profileChanges);
      if (res.data.request) {
        setChangeRequests((current) => [res.data.request, ...current]);
        if (originalFormRef.current) {
          setForm(originalFormRef.current);
          const { height, weight } = originalFormRef.current;
          if (height && weight) {
            const heightMeters = parseFloat(height) / 100;
            setBmi((parseFloat(weight) / (heightMeters * heightMeters)).toFixed(1));
          } else {
            setBmi(null);
          }
        }
      } else {
        updateUser({ first_name: form.first_name, last_name: form.last_name, email: form.email });
      }
      setMsg(res.data.message || "Profile changes saved successfully.");
    } catch (err) {
      setMsg(err.response?.data?.message || "Unable to save your profile. Please try again.");
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(""), 3000);
    }
  };

  const handleRequestPasswordCode = async () => {
    setPasswordLoading(true);
    setPasswordError("");
    setPasswordNotice("");
    try {
      const res = await userApi.post("/password/change-code");
      setPasswordCodeSent(true);
      setPasswordNotice(res.data.message || "A verification code was sent to your account email.");
    } catch (err) {
      setPasswordError(err.response?.data?.message || "Unable to send a verification code. Please try again.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(passwordForm.code)) {
      setPasswordError("Enter the six-digit verification code from your email.");
      return;
    }
    if (
      passwordForm.password.length < 8 ||
      passwordForm.password.length > 12 ||
      !/[A-Za-z]/.test(passwordForm.password) ||
      !/\d/.test(passwordForm.password) ||
      !/[^A-Za-z0-9]/.test(passwordForm.password)
    ) {
      setPasswordError("Use 8–12 characters with a letter, a number, and a symbol.");
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }

    setPasswordLoading(true);
    setPasswordError("");
    setPasswordNotice("");
    try {
      const response = await userApi.post("/password/change", {
        code: passwordForm.code,
        password: passwordForm.password,
      });
      setChangeRequests((current) => [response.data.request, ...current.filter((request) => request.request_type !== "password" || request.status !== "Pending")]);
      setPasswordForm({ code: "", password: "", confirmPassword: "" });
      setPasswordCodeSent(false);
      setPasswordNotice(response.data.message || "Password change request submitted for admin approval.");
    } catch (err) {
      setPasswordError(err.response?.data?.message || "Unable to change your password. Please try again.");
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleLogout = () => {
    logoutUser();
    navigate("/user/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fffaf5] dark:bg-[#080808] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const hasPendingPasswordChange = changeRequests.some(
    (request) => request.request_type === "password" && request.status === "Pending"
  );
  const hasPendingProfileChange = changeRequests.some(
    (request) => request.request_type === "profile" && request.status === "Pending"
  );

  return (
    <div className="min-h-screen bg-[#fffaf5] dark:bg-[#080808] text-slate-900 dark:text-white">
      {confirmLogout && (
        <ConfirmDialog
          title="Log out of AveFit?"
          description="You will need to sign in again to access your account."
          confirmLabel="Log out"
          onCancel={() => setConfirmLogout(false)}
          onConfirm={handleLogout}
        />
      )}
      {/* Header */}
      <div className="ave-page-hero border-b border-orange-100 px-5 pb-8 pt-8 text-center dark:border-white/5 sm:px-8">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingPhoto || hasPendingProfileChange}
          aria-label={uploadingPhoto ? "Uploading profile photo" : hasPendingProfileChange ? "Profile changes awaiting admin approval" : "Change profile photo"}
          className="relative mx-auto mb-3 block h-20 w-20 rounded-full ring-4 ring-white/70 transition hover:ring-orange-200 focus-visible:outline-none focus-visible:ring-orange-400 dark:ring-white/10 dark:hover:ring-orange-500/30 disabled:opacity-70"
        >
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-orange-500">
            {photo ? (
              <img src={photo} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xl font-black text-white">
                {(form.first_name?.[0] || user?.first_name?.[0] || "M").toUpperCase()}
                {(form.last_name?.[0] || user?.last_name?.[0] || "").toUpperCase()}
              </span>
            )}
          </div>
          <span className="absolute bottom-0 right-0 grid h-7 w-7 place-items-center rounded-full border-2 border-white bg-white text-slate-700 dark:border-[#111] dark:bg-[#222] dark:text-white">
            {uploadingPhoto ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
            ) : (
              <Camera size={13} className="text-slate-900" />
            )}
          </span>
        </button>
        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} className="hidden" aria-label="Choose profile photo" />
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{form.first_name} {form.last_name}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{form.email}</p>
        {bmi && (
          <div className="mt-3 inline-flex flex-wrap items-center justify-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-4 py-1.5">
            <Activity size={15} className="text-orange-500" />
            <span className="text-sm font-semibold text-orange-700 dark:text-orange-300">BMI {bmi}</span>
            {bmiCategory && (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${bmiCategory.style}`}>
                {bmiCategory.label}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mx-auto max-w-4xl space-y-5 px-5 py-6 sm:px-8">
        {loadError && (
          <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {loadError}
          </p>
        )}

        {msg && (
          <p role="status" className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            /unable|failed|error|could not be delivered/i.test(msg)
              ? "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300"
              : "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300"
          }`}>
            {msg}
          </p>
        )}

        {changeRequests.filter((request) => request.status === "Pending").length > 0 && (
          <section aria-label="Pending account changes" className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-500/20 dark:bg-orange-500/[0.08]">
            <h2 className="text-sm font-bold text-orange-900 dark:text-orange-200">Changes awaiting admin approval</h2>
            <ul className="mt-2 space-y-1 text-sm text-orange-800 dark:text-orange-300">
              {changeRequests.filter((request) => request.status === "Pending").map((request) => (
                <li key={request.request_id}>
                  {request.request_type === "password" ? "Password change" : "Profile changes"} submitted{" "}
                  {new Date(request.created_at).toLocaleDateString()}. Your current account details remain active until approval.
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111]">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Membership period</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {user?.membership_months
                ? `${user.membership_months === 12 ? "1 year" : `${user.membership_months} ${user.membership_months === 1 ? "month" : "months"}`} · ${user.membership_start_date ? String(user.membership_start_date).slice(0, 10) : "Start date pending"} to ${user.membership_end_date ? String(user.membership_end_date).slice(0, 10) : "End date pending"}`
                : "No membership period has been set."}
            </p>
          </div>
        </section>

        {/* Personal Info */}
        <section className="space-y-4 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111] sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400"><CircleUserRound size={19} /></span>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white">Personal information</h2>
              <p className="text-xs text-slate-500">Changes are reviewed by the gym administrator before taking effect.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "First Name", key: "first_name" },
              { label: "Last Name", key: "last_name" },
            ].map((f) => (
              <div key={f.key}>
                <label htmlFor={`profile-${f.key}`} className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{f.label}</label>
                <input id={`profile-${f.key}`} type="text" value={form[f.key]}
                  onChange={(e) => handleChange(f.key, e.target.value)}
                  autoComplete={f.key === "first_name" ? "given-name" : "family-name"}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-white/10 dark:bg-white/5 dark:text-white" />
              </div>
            ))}
          </div>

          <div>
            <label htmlFor="profile-email" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Email address</label>
            <input
              id="profile-email"
              type="email"
              value={form.email}
              readOnly
              autoComplete="email"
              aria-describedby="profile-email-note"
              className="w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400"
            />
            <p id="profile-email-note" className="mt-1 text-xs text-slate-500">Email addresses cannot be changed from your profile.</p>
          </div>

          <div>
            <label htmlFor="profile-phone" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Phone Number</label>
            <div className="flex min-h-12 w-full items-stretch overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm transition hover:border-slate-300 focus-within:border-orange-500 focus-within:ring-4 focus-within:ring-orange-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20 dark:focus-within:border-orange-500">
              <span aria-hidden="true" className="flex select-none items-center border-r border-slate-200 bg-slate-100 px-4 text-sm font-semibold tracking-wide text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">09</span>
              <input
                id="profile-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                maxLength={9}
                pattern="[0-9]{9}"
                required
                aria-invalid={Boolean(form.phone.slice(2)) && !isValidPhoneNumber(form.phone)}
                value={form.phone.startsWith("09") ? form.phone.slice(2) : ""}
                onChange={(event) => handleChange("phone", `09${event.target.value.replace(/\D/g, "").slice(0, 9)}`)}
                placeholder="000 000 000"
                className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm font-medium tracking-wide text-slate-900 outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
              />
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">Gender</p>
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              {form.gender || "Not set"}
            </p>
          </div>
        </section>

        {/* Fitness Settings */}
        <section id="profile-fitness-settings" className="scroll-mt-24 space-y-4 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111] sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400"><Dumbbell size={19} /></span>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white">Fitness settings</h2>
              <p className="text-xs text-slate-500">Adjust your goal. Your coach manages your experience level.</p>
            </div>
          </div>
          <div>
            <label htmlFor="profile-fitness-goal" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Fitness goal</label>
            <select id="profile-fitness-goal" value={form.fitness_goal} onChange={(e) => handleChange("fitness_goal", e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-white/10 dark:bg-white/5 dark:text-white">
              <option value="">Select goal...</option>
              {["Weight Loss", "Gain Weight", "General Fitness", "Endurance", "Maintain Weight"].map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
                <label htmlFor="profile-experience-level" className="text-xs font-medium text-slate-500">Experience level</label>
                <select id="profile-experience-level" value={form.activity_level || "Beginner"} onChange={(e) => handleChange("activity_level", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-white/10 dark:bg-[#111] dark:text-white">
                  {["Beginner", "Intermediate", "Advanced"].map((level) => <option key={level} value={level}>{level}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-500">Experience-level changes are sent to the gym administrator for approval.</p>
          </div>
        </section>

        <section className="space-y-5 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111] sm:p-6">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Injury &amp; health conditions</h2>
            <p className="mt-1 text-xs text-slate-500">
              Changes save immediately and are shared with your coach and gym administrator.
            </p>
          </div>
          {[
            { label: "Injury or pain areas", key: "injuries", options: injuryOptions },
            { label: "Health conditions", key: "health_conditions", options: healthConditionOptions },
          ].map(({ label, key, options }) => (
            <fieldset key={key}>
              <legend className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</legend>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => {
                  const selected = form[key].includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={selected}
                      disabled={savingHealth}
                      onClick={() => handleHealthSelection(key, option)}
                      className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition disabled:cursor-wait disabled:opacity-60 ${
                        selected
                          ? "border-orange-500 bg-orange-500/10 text-orange-700 dark:text-orange-300"
                          : "border-slate-200 text-slate-600 hover:border-orange-300 dark:border-white/10 dark:text-slate-300 dark:hover:border-orange-500/50"
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {healthSaveMessage && (
            <p role={healthSaveMessage === "Saved" ? "status" : "alert"} className={`text-xs ${
              healthSaveMessage === "Saved" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-300"
            }`}>
              {savingHealth ? "Saving..." : healthSaveMessage}
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111] sm:p-6">
          <WeeklyWorkoutAvailability experienceLevel={form.activity_level || undefined} />
        </section>

        <section className="space-y-4 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-[#111] sm:p-6">
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Change password</h2>
            <p className="mt-1 text-xs text-slate-500">
              Verify your identity by email. A password change takes effect only after admin approval.
            </p>
          </div>

          {passwordNotice && (
            <p role="status" className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-300">
              {passwordNotice}
            </p>
          )}
          {passwordError && (
            <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              {passwordError}
            </p>
          )}

          {hasPendingPasswordChange ? (
            <p className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-200">
              Your password change request is under review. Your existing password remains active until it is approved.
            </p>
          ) : (
          <>
            <button
              type="button"
              onClick={handleRequestPasswordCode}
              disabled={passwordLoading}
              className="w-full rounded-xl border border-orange-500 px-4 py-2.5 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 disabled:opacity-60 dark:text-orange-300 dark:hover:bg-orange-500/10"
            >
              {passwordLoading ? "Please wait..." : passwordCodeSent ? "Send another verification code" : "Send verification code"}
            </button>

            <form className="space-y-3" onSubmit={handleChangePassword}>
            <div>
              <label htmlFor="profile-password-code" className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Email verification code
              </label>
              <input
                id="profile-password-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                required
                value={passwordForm.code}
                onChange={(event) => setPasswordForm((current) => ({
                  ...current,
                  code: event.target.value.replace(/\D/g, "").slice(0, 6),
                }))}
                placeholder="Enter 6-digit code"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
              />
            </div>
            <div>
              <PasswordField
                label="New password"
                htmlFor="profile-new-password"
                name="newPassword"
                autoComplete="new-password"
                minLength={8}
                maxLength={12}
                required
                value={passwordForm.password}
                onChange={(event) => setPasswordForm((current) => ({ ...current, password: event.target.value }))}
              />
            </div>
            <div>
              <PasswordField
                label="Confirm new password"
                htmlFor="profile-confirm-password"
                name="confirmPassword"
                autoComplete="new-password"
                minLength={8}
                maxLength={12}
                required
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
              />
            </div>
            <p className="text-xs text-slate-500">Password must be 8–12 characters and include a letter, a number, and a symbol.</p>
            <button
              type="submit"
              disabled={passwordLoading}
              className="w-full rounded-xl bg-orange-500 py-3 font-bold text-white transition hover:bg-orange-600 disabled:opacity-60"
            >
              {passwordLoading ? "Submitting request..." : "Verify and request password change"}
            </button>
            </form>
          </>
          )}
        </section>

        {/* Quick Links */}
        <section className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm dark:border-white/5 dark:bg-[#111]">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-white/10">
            <h2 className="font-bold text-slate-900 dark:text-white">Fitness setup</h2>
            <p className="mt-1 text-xs text-slate-500">Edit your settings below. Changes need admin approval before taking effect.</p>
          </div>
          {[
            { label: "Change fitness goal", target: "profile-fitness-settings" },
          ].map((item) => (
            <button key={item.label} type="button" onClick={() => document.getElementById(item.target)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              className="flex w-full items-center justify-between border-b border-slate-200 px-5 py-4 text-left transition hover:bg-slate-50 last:border-0 dark:border-white/10 dark:hover:bg-white/[0.03]">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{item.label}</span>
              <ChevronRight size={16} className="text-slate-500" />
            </button>
          ))}
        </section>

        {/* Save + Logout */}
        <button type="button" onClick={handleSave} disabled={saving || Boolean(loadError) || hasPendingProfileChange}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3.5 font-bold text-white transition hover:bg-orange-600 disabled:opacity-50">
          <Save size={18} />
          {saving ? "Submitting..." : hasPendingProfileChange ? "Profile Request Pending" : "Submit Profile Changes"}
        </button>

        <button type="button" onClick={() => setConfirmLogout(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 py-3.5 font-semibold text-red-600 transition hover:bg-red-500/10 dark:text-red-400">
          <LogOut size={18} />
          Log Out
        </button>
      </div>
    </div>
  );
}