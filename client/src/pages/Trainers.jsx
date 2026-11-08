import { useCallback, useEffect, useState, useRef } from "react";
import { UserCheck, Plus, Search, Edit2, XCircle, Users, UserCircle, X, Camera, Check, Eye, EyeOff, CalendarClock, TrendingUp } from "lucide-react";
import api from "../services/api";
import { fileToCompressedDataUrl } from "../utils/imageUpload";
import TrainerAvailabilityManager from "../components/trainers/TrainerAvailabilityManager";
import ScrollReveal from "../components/ScrollReveal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import ProgressHistoryModal from "../components/progress/ProgressHistoryModal";

const fetchMemberProgress = (userId) => api.get(`/members/${userId}/progress`);

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === "string") return value.replace(/^\{|\}$/g, "").split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function toHealthNotes(value) {
  const noReportValues = new Set(["none", "no injury", "no injuries", "no condition", "no conditions", "n/a"]);
  return toList(value)
    .map((item) => String(item).trim().replace(/^["']|["']$/g, ""))
    .filter((item) => item && !noReportValues.has(item.toLowerCase()));
}

const SPECIALIZATION_OPTIONS = [
  "High-Intensity Interval Training (HIIT)",
  "Circuit Training",
  "Olympic Weightlifting",
  "Powerlifting",
  "Calisthenics & Bodyweight",
  "Kettlebell Training",
  "Functional Fitness",
  "CrossFit Coaching",
  "Bodybuilding & Physique",
  "Weight Loss & Management",
  "Group Fitness",
];

const normalizeSpecializations = (trainer) => Array.isArray(trainer?.specializations) ? trainer.specializations.filter(Boolean) : [];

const statusColors = {
  Active: "bg-green-100 text-green-700",
  Pending: "bg-yellow-100 text-yellow-700",
  Rejected: "bg-red-100 text-red-700",
  Inactive: "bg-slate-100 text-slate-500",
};

const TRAINER_STATUS_OPTIONS = ["Active", "Inactive"];

function TrainerModal({ trainer, onClose, onSave }) {
  const fileInputRef = useRef(null);
  const [form, setForm] = useState(
    trainer
      ? { ...trainer, goal_specialty: trainer.goal_specialty === "Muscle Gain" ? "Gain Weight" : trainer.goal_specialty }
      : { full_name: "", email: "", phone: "09", specializations: [], goal_specialty: "" }
  );
  const [selectedSpecializations, setSelectedSpecializations] = useState(normalizeSpecializations(trainer));
  const [photo, setPhoto] = useState(trainer?.photo_url || null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Active/Inactive are the admin-selectable statuses; keep the trainer's current
  // value (e.g. Pending/Rejected) selectable so editing never silently changes it.
  const statusOptions = [...new Set([...(form.status ? [form.status] : []), ...TRAINER_STATUS_OPTIONS])];

  const storedEmailMismatch =
    Boolean(trainer?.email) &&
    Boolean(form.email) &&
    String(trainer.email).trim().toLowerCase() !== String(form.email).trim().toLowerCase();

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError("");
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      setPhoto(dataUrl);
    } catch (err) {
      setError(err.message || "Failed to read photo.");
    } finally {
      setUploadingPhoto(false);
      e.target.value = "";
    }
  };

  const handleSubmit = async () => {
    const fullName = (form.full_name || "").trim();
    if (!fullName) {
      setError("Full name is required.");
      return;
    }
    if (fullName.length < 2 || fullName.length > 50) {
      setError(`Full name must be 2 to 50 characters (currently ${fullName.length}).`);
      return;
    }
    if (!/^[A-Za-zÀ-ÿ' -]+$/.test(fullName)) {
      setError("Full name can only contain letters, spaces, apostrophes, and hyphens.");
      return;
    }

    const email = String(form.email || "").trim();
    if (!email) {
      setError("Enter a valid email address for the coach.");
      return;
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
      setError("Enter a valid email address, such as name@example.com.");
      return;
    }

    const phone = form.phone || "";
    if (!phone) {
      setError("Phone number is required.");
      return;
    }
    if (!/^09\d{9}$/.test(phone)) {
      setError(phone.startsWith("09")
        ? `Phone number must be exactly 11 digits (currently ${phone.length}).`
        : "Phone number must start with 09.");
      return;
    }

    if (selectedSpecializations.length === 0) {
      setError("Select at least one specialization for this coach.");
      return;
    }

    const bio = (form.bio || "").trim();
    if (!bio) {
      setError("Coach bio / profile is required — write a short introduction.");
      return;
    }
    if (bio.length > 500) {
      setError(`Coach bio must be 500 characters or fewer (currently ${bio.length}).`);
      return;
    }

    if (!(form.goal_specialty || "").trim()) {
      setError("Choose a goal match for the 'Recommended For' field.");
      return;
    }

    if (!password && !trainer) {
      setError("Coach portal password is required for a new trainer.");
      return;
    }
    if (password) {
      if (password.length < 8 || password.length > 12) {
        setError(`Password must be 8 to 12 characters (currently ${password.length}).`);
        return;
      }
      if (!/[A-Za-z]/.test(password)) {
        setError("Password must include at least one letter.");
        return;
      }
      if (!/\d/.test(password)) {
        setError("Password must include at least one number.");
        return;
      }
      if (!/[^A-Za-z0-9]/.test(password)) {
        setError("Password must include at least one symbol (for example ! @ # $).");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match. Please retype them.");
        return;
      }
    }

    setSaving(true);
    setError("");
    try {
      const payload = { ...form, email, specializations: selectedSpecializations, photo_url: photo, ...(password ? { password } : {}) };
      delete payload.specialization;
      if (trainer) {
        await api.put(`/trainers/${trainer.trainer_id}`, { ...payload, status: form.status || trainer.status });
      } else {
        await api.post("/trainers", payload);
      }
      onSave();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Failed to save trainer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold text-slate-800">
            {trainer ? "Edit Trainer" : "Add New Trainer"}
          </h2>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="relative w-16 h-16 rounded-full disabled:opacity-70 shrink-0"
            >
              <div className="w-16 h-16 bg-orange-600 rounded-full flex items-center justify-center overflow-hidden">
                {photo ? (
                  <img src={photo} alt="Trainer" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-white text-xl font-bold">{form.full_name?.charAt(0) || "?"}</span>
                )}
              </div>
              <div className="absolute bottom-0 right-0 w-6 h-6 bg-white rounded-full flex items-center justify-center border-2 border-slate-100 shadow">
                {uploadingPhoto ? (
                  <div className="w-3 h-3 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera size={11} className="text-slate-700" />
                )}
              </div>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            <div>
              <p className="text-sm font-medium text-slate-700">Profile Photo</p>
              <p className="text-xs text-slate-400">Shown to members on the Coach Selection screen.</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Full Name *</label>
            <input
              type="text"
              autoComplete="name"
              required
              maxLength={50}
              placeholder="Juan Dela Cruz"
              value={form.full_name || ""}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Email *</label>
            <input
              type="email"
              autoComplete="email"
              required
              spellCheck={false}
              placeholder="coach@email.com"
              value={form.email || ""}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <p className="text-xs text-slate-400 mt-1">
              Use the coach's full email address. Any valid email domain is accepted.
            </p>
            {storedEmailMismatch && (
              <p className="text-xs text-amber-600 mt-1">
                Current login email is <strong>{trainer.email}</strong>. Saving changes it to <strong>{form.email}</strong> &mdash; tell the coach to use the new address.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Phone *</label>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              required
              maxLength={11}
              minLength={11}
              pattern="09[0-9]{9}"
              placeholder="09XXXXXXXXX"
              value={form.phone || ""}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                const phone = digits.startsWith("0")
                  ? digits.length > 1 && digits[1] !== "9" ? "0" : digits
                  : "";
                setForm({ ...form, phone });
              }}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-600">Specializations *</label>
              <span className="text-xs text-slate-400">Choose one or more</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
              {SPECIALIZATION_OPTIONS.map((option) => {
                const selected = selectedSpecializations.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setSelectedSpecializations((current) => selected ? current.filter((item) => item !== option) : [...current, option])}
                    className={`flex items-center gap-2 text-left px-3 py-2.5 rounded-xl border text-sm transition ${selected ? "border-orange-500 bg-orange-500/10 text-orange-700" : "border-slate-200 bg-white text-slate-600 hover:border-orange-300"}`}
                  >
                    <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${selected ? "bg-orange-500 border-orange-500 text-white" : "border-slate-300"}`}>
                      {selected && <Check size={13} strokeWidth={3} />}
                    </span>
                    <span>{option}</span>
                  </button>
                );
              })}
            </div>
            {selectedSpecializations.length > 0 && (
              <p className="text-xs text-orange-600 mt-2 font-medium">{selectedSpecializations.length} specialization{selectedSpecializations.length === 1 ? "" : "s"} selected.</p>
            )}
            <p className="text-xs text-slate-400 mt-1">These specialties are shown on the coach profile and used for coach recommendations.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Coach Bio / Profile *</label>
            <textarea
              value={form.bio || ""}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="Short introduction, coaching approach, and experience..."
              rows={3}
              maxLength={500}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
            <p className="text-xs text-slate-400 mt-1">This profile is shown to members when they browse coaches.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">Recommended For (goal match) *</label>
            <select
              value={form.goal_specialty || ""}
              onChange={(e) => setForm({ ...form, goal_specialty: e.target.value })}
              className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="">No specific match</option>
              <option value="Weight Loss">Weight Loss</option>
              <option value="Gain Weight">Gain Weight</option>
              <option value="Maintain Weight">Maintain Weight</option>
              <option value="General Fitness">General Fitness</option>
            </select>
            <p className="text-xs text-slate-400 mt-1">
              Members with this goal will see this coach highlighted as "Recommended".
            </p>
          </div>

          {trainer && (
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Status</label>
              <select
                value={form.status || ""}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">Set the coach Active or Inactive. Inactive coaches cannot sign in.</p>
            </div>
          )}

          <div className="pt-2 border-t">
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Coach Portal Password {!trainer && <span className="text-red-500">*</span>} {trainer && (
                <span className={`ml-1 text-xs font-normal ${trainer.has_portal_access ? "text-green-600" : "text-slate-400"}`}>
                  ({trainer.has_portal_access ? "portal access enabled" : "no portal access yet"})
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={trainer ? "Leave blank to keep current password" : "Set a login password"}
                minLength={8}
                maxLength={12}
                className="w-full border border-slate-300 rounded-lg px-4 py-2.5 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 grid w-11 place-items-center text-slate-400 hover:text-slate-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {(password || !trainer) && (
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm password"
                minLength={8}
                maxLength={12}
                className="mt-2 w-full border border-slate-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            )}
            <p className="text-xs text-slate-400 mt-1">
              8–12 characters with a letter, number, and symbol. Lets this coach log in at <code>/trainer/login</code>.
            </p>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}
        </div>
        <div className="p-6 border-t flex gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border text-slate-600 hover:bg-slate-50 text-sm font-medium transition">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium transition disabled:opacity-50"
          >
            {saving ? "Saving..." : trainer ? "Save Changes" : "Add Trainer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CapacityModal({ trainer, onClose, onSaved }) {
  const [maxMembers, setMaxMembers] = useState(String(trainer.max_members ?? 15));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    const capacity = Number(maxMembers);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) {
      setError("Enter a whole-number capacity between 1 and 10,000.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.put(`/trainers/${trainer.trainer_id}/capacity`, { max_members: capacity });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || "Unable to update coach capacity.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="coach-capacity-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#151515]" onClick={(event) => event.stopPropagation()}>
        <h2 id="coach-capacity-title" className="text-xl font-bold text-slate-900 dark:text-white">Coach member capacity</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{trainer.full_name} currently has {trainer.assigned_member_count} assigned member(s).</p>
        <label htmlFor="coach-max-members" className="mt-5 block text-sm font-semibold text-slate-700 dark:text-slate-200">Maximum members</label>
        <input id="coach-max-members" type="number" min="1" max="10000" step="1" value={maxMembers} onChange={(event) => setMaxMembers(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none focus:ring-2 focus:ring-orange-500 dark:border-white/10 dark:bg-[#111] dark:text-white" />
        {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50 dark:border-white/10 dark:text-slate-300">Cancel</button>
          <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{saving ? "Saving..." : "Save capacity"}</button>
        </div>
      </section>
    </div>
  );
}

function TrainerProfileModal({ trainer, onClose, onEdit }) {
  const specializations = normalizeSpecializations(trainer);
  const expertise = [...new Set([...specializations, trainer.goal_specialty].filter(Boolean))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trainer-profile-title"
        className="relative grid max-h-[92vh] w-full max-w-5xl grid-rows-[minmax(200px,28vh)_minmax(0,1fr)] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111] lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:grid-rows-1"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white shadow-lg hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
          aria-label="Close trainer profile"
        >
          <X size={19} />
        </button>

        <div className="relative flex min-h-0 items-center justify-center overflow-hidden bg-slate-950">
          {trainer.photo_url ? (
            <div className="flex h-full w-full items-center justify-center p-3">
              <img src={trainer.photo_url} alt={trainer.full_name} className="h-full w-full object-contain" />
            </div>
          ) : <UserCircle size={96} className="text-orange-500" aria-hidden="true" />}
        </div>

        <div className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5 sm:p-7 lg:p-8">
            <header className="border-b border-slate-200 pb-5 pr-12 dark:border-white/10">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">Trainer profile</p>
              <h2 id="trainer-profile-title" className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white sm:text-3xl">{trainer.full_name}</h2>
              <p className="mt-1 text-sm font-semibold text-orange-600 dark:text-orange-400">{trainer.goal_specialty === "Muscle Gain" ? "Gain Weight" : trainer.goal_specialty || "General Fitness Coach"}</p>
              <span className={`mt-3 inline-flex rounded-full px-3 py-1.5 text-xs font-bold ${statusColors[trainer.status] || statusColors.Active}`}>
                {trainer.status || "Active"}
              </span>
            </header>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">About the trainer</h3>
              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-slate-600 dark:text-slate-300">
                {trainer.bio || "This trainer has not added a profile description yet."}
              </p>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Specializations</h3>
              {expertise.length ? (
                <div className="flex flex-wrap gap-2">
                  {expertise.map((item) => (
                    <span key={item} className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300">
                      {item}
                    </span>
                  ))}
                </div>
              ) : <p className="text-sm text-slate-400">No specializations listed.</p>}
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-xs text-slate-400">Email</p>
                <p className="mt-1 break-all text-sm font-medium text-slate-700 dark:text-slate-200">{trainer.email || "—"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-xs text-slate-400">Phone</p>
                <p className="mt-1 text-sm font-medium text-slate-700 dark:text-slate-200">{trainer.phone || "—"}</p>
              </div>
            </section>
          </div>

          <div className="grid grid-cols-2 gap-3 border-t border-slate-200 p-4 dark:border-white/10 sm:px-7 lg:px-8">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl border border-slate-300 font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="min-h-11 rounded-xl bg-orange-500 font-bold text-white hover:bg-orange-600"
            >
              Edit Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member, onViewProfile }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-[#303030] bg-[#171717] rounded-xl px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="w-9 h-9 shrink-0 overflow-hidden rounded-full bg-orange-500/15 flex items-center justify-center text-orange-400 font-bold text-xs">
          {member.profile_image
            ? <img src={member.profile_image} alt="" className="h-full w-full object-cover" />
            : <>{member.first_name?.charAt(0)}{member.last_name?.charAt(0)}</>}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-100 text-sm">{member.first_name} {member.last_name}</p>
          <p className="truncate text-gray-400 text-xs">{member.fitness_goal || "No goal set"} · {member.email}</p>
        </div>
      </div>
      <button type="button" onClick={() => onViewProfile(member)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-500/30 px-2.5 py-2 text-xs font-semibold text-orange-400 transition hover:bg-orange-500/10" aria-label={`View ${member.first_name} ${member.last_name}'s profile`}>
        <UserCircle size={15} /> <span className="hidden sm:inline">View Profile</span><span className="sm:hidden">Profile</span>
      </button>
    </div>
  );
}

function RosterMemberProfileModal({ member, onClose, onViewProgress }) {
  const currentWeight = member.latest_weight ?? member.weight;
  const currentBmi = member.latest_bmi ?? (currentWeight && member.height
    ? (Number(currentWeight) / ((Number(member.height) / 100) ** 2)).toFixed(1)
    : null);
  const profileFields = [
    ["Email", member.email],
    ["Phone", member.phone],
    ["Gender", member.gender],
    ["Age", member.age ? `${member.age} years` : null],
    ["Birth date", member.birth_date ? new Date(member.birth_date).toLocaleDateString() : null],
    ["Height", member.height ? `${member.height} cm` : null],
    ["Current weight", currentWeight ? `${currentWeight} kg` : null],
    ["BMI", currentBmi],
    ["Fitness goal", member.fitness_goal],
    ["Target weight", member.target_weight ? `${member.target_weight} kg` : null],
    ["Experience level", member.activity_level],
    ["Workout intensity", member.intensity],
    ["Workout frequency", member.workout_days_per_week ? `${member.workout_days_per_week} days/week` : null],
    ["Preferred time", member.preferred_workout_time],
  ];
  const availability = Array.isArray(member.weekly_availability) ? member.weekly_availability : [];
  const injuries = toHealthNotes(member.injuries);
  const conditions = toHealthNotes(member.health_conditions);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="roster-member-profile-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#151515] text-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center gap-4 border-b border-white/10 p-5 sm:p-6">
          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-orange-500/15 text-lg font-bold text-orange-300">
            {member.profile_image
              ? <img src={member.profile_image} alt="" className="h-full w-full object-cover" />
              : `${member.first_name?.charAt(0) || ""}${member.last_name?.charAt(0) || ""}`}
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="roster-member-profile-title" className="truncate text-xl font-bold">{member.first_name} {member.last_name}</h2>
            <p className="truncate text-sm text-slate-400">Member profile</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close member profile" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X size={20} /></button>
        </header>
        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {profileFields.map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="text-xs text-slate-400">{label}</p>
                <p className="mt-1 break-words text-sm font-semibold text-slate-100">{value || "Not set"}</p>
              </div>
            ))}
          </div>
          <section className="rounded-xl border border-white/10 p-4">
            <h3 className="text-sm font-bold text-slate-200">Weekly availability</h3>
            {availability.length ? (
              <ul className="mt-2 space-y-1 text-sm text-slate-300">
                {availability.map((slot) => <li key={slot.day_of_week}><span className="font-semibold">{slot.day_of_week}:</span> {slot.time_preference || `${slot.start_time || "—"}–${slot.end_time || "—"}`}</li>)}
              </ul>
            ) : <p className="mt-2 text-sm text-slate-400">{toList(member.preferred_days).join(", ") || "No availability recorded."}</p>}
          </section>
          {(injuries.length || conditions.length) > 0 && (
            <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <h3 className="text-sm font-bold text-amber-300">Health and safety notes</h3>
              <div className="mt-2 space-y-1 text-sm text-slate-300">
                <p><span className="font-semibold">Injury:</span> {injuries.join(", ") || "None"}</p>
                <p><span className="font-semibold">Health Condition:</span> {conditions.join(", ") || "None"}</p>
              </div>
            </section>
          )}
          <section className="rounded-xl border border-white/10 p-4">
            <h3 className="text-sm font-bold text-slate-200">Workout progress</h3>
            <p className="mt-1 text-sm text-slate-400">{member.completed_workouts ?? 0} completed of {member.assigned_workouts ?? 0} assigned workouts</p>
          </section>
          <div className="flex justify-end">
            <button type="button" onClick={() => onViewProgress(member)} className="inline-flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-700">
              <TrendingUp size={16} /> View Progress History
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function RosterModal({ trainer, onClose }) {
  const [members, setMembers] = useState([]);
  const [profileMember, setProfileMember] = useState(null);
  const [progressMember, setProgressMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshRoster = useCallback(async () => {
    const rosterRes = await api.get(`/trainers/${trainer.trainer_id}/roster`);
    const rows = Array.isArray(rosterRes.data)
      ? rosterRes.data
      : rosterRes.data?.data;
    if (!Array.isArray(rows)) throw new Error("The roster response was invalid.");
    setMembers(rows);
    setProfileMember((current) => current
      ? rows.find((member) => String(member.user_id) === String(current.user_id)) || current
      : current);
    setError("");
  }, [trainer.trainer_id]);

  useEffect(() => {
    refreshRoster()
      .catch((err) => {
        console.error("Failed to load coach roster:", err);
        setError(err.response?.data?.message || "Unable to load this coach’s roster.");
      })
      .finally(() => setLoading(false));
  }, [refreshRoster]);

  useEffect(() => {
    const refreshVisibleRoster = () => {
      if (document.visibilityState !== "visible") return;

      refreshRoster().catch((err) => {
        console.error("Couldn't refresh workout counts:", err);
        setError(err.response?.data?.message || "Workout counts couldn't be refreshed.");
      });
    };
    const refreshWhenVisible = () => {
      refreshVisibleRoster();
    };
    const intervalId = window.setInterval(refreshVisibleRoster, 15000);
    window.addEventListener("focus", refreshVisibleRoster);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshVisibleRoster);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshRoster]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      {profileMember && <RosterMemberProfileModal member={profileMember} onClose={() => setProfileMember(null)} onViewProgress={setProgressMember} />}
      {progressMember && <ProgressHistoryModal member={progressMember} fetchProgress={fetchMemberProgress} onClose={() => setProgressMember(null)} />}
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Users size={20} className="text-orange-500" /> {trainer.full_name}'s Roster
            </h2>
            <p className="text-slate-500 text-sm mt-0.5">Members assigned to this coach.</p>
          </div>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>

        <div className="p-6 overflow-y-auto space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
            </div>
          ) : error ? (
            <p role="alert" className="text-center text-red-600 py-12 text-sm">{error}</p>
          ) : members.length === 0 ? (
            <p className="text-center text-slate-400 py-12 text-sm">No members have chosen this coach yet.</p>
          ) : (
            members.map((m) => <MemberRow key={m.user_id} member={m} onViewProfile={setProfileMember} />)
          )}
        </div>
      </div>
    </div>
  );
}

export default function Trainers() {
  const [trainers, setTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [showModal, setShowModal] = useState(false);
  const [editTrainer, setEditTrainer] = useState(null);
  const [rosterTrainer, setRosterTrainer] = useState(null);
  const [profileTrainer, setProfileTrainer] = useState(null);
  const [availabilityTrainer, setAvailabilityTrainer] = useState(null);
  const [capacityTrainer, setCapacityTrainer] = useState(null);
  const [trainerAction, setTrainerAction] = useState(null);
  const [trainerActionLoading, setTrainerActionLoading] = useState(false);
  const [trainerActionError, setTrainerActionError] = useState("");

  const fetchTrainers = () => {
    setLoading(true);
    setFetchError("");
    api.get("/trainers")
      .then((res) => setTrainers(res.data.data))
      .catch((err) => {
        console.error(err);
        setFetchError(err.response?.data?.message || err.message || "Couldn't load trainers.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTrainers(); }, []);

  const handleApprove = async (id) => {
    await api.put(`/trainers/${id}/approve`);
    fetchTrainers();
  };

  const handleRemove = async (trainer) => {
    setTrainerAction({ kind: "remove", trainer });
    setTrainerActionError("");
  };

  const confirmTrainerAction = async () => {
    if (!trainerAction) return;
    setTrainerActionLoading(true);
    setTrainerActionError("");
    try {
      await api.delete(`/trainers/${trainerAction.trainer.trainer_id}`);
      setTrainerAction(null);
      fetchTrainers();
    } catch (err) {
      setTrainerActionError(err.response?.data?.message || "Failed to remove this trainer. Please try again.");
    } finally {
      setTrainerActionLoading(false);
    }
  };

  const handleEdit = (trainer) => {
    setEditTrainer(trainer);
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditTrainer(null);
    setShowModal(true);
  };

  const filtered = trainers.filter((t) =>
    t.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    (t.specializations || normalizeSpecializations(t)).join(" ").toLowerCase().includes(search.toLowerCase()) ||
    t.email?.toLowerCase().includes(search.toLowerCase())
  ).filter((trainer) => statusFilter === "All" || trainer.status === statusFilter);
  const pendingCount = trainers.filter((trainer) => trainer.status === "Pending").length;
  const activeCount = trainers.filter((trainer) => trainer.status === "Active").length;

  return (
    <div className="space-y-6">
      {showModal && (
        <TrainerModal
          trainer={editTrainer}
          onClose={() => setShowModal(false)}
          onSave={fetchTrainers}
        />
      )}

      {rosterTrainer && (
        <RosterModal
          trainer={rosterTrainer}
          onClose={() => setRosterTrainer(null)}
        />
      )}

      {profileTrainer && (
        <TrainerProfileModal
          trainer={profileTrainer}
          onClose={() => setProfileTrainer(null)}
          onEdit={() => { setEditTrainer(profileTrainer); setProfileTrainer(null); setShowModal(true); }}
        />
      )}

      {availabilityTrainer && (
        <TrainerAvailabilityManager
          mode="admin"
          trainerId={availabilityTrainer.trainer_id}
          trainerName={availabilityTrainer.full_name}
          onClose={() => setAvailabilityTrainer(null)}
        />
      )}
      {capacityTrainer && (
        <CapacityModal
          trainer={capacityTrainer}
          onClose={() => setCapacityTrainer(null)}
          onSaved={fetchTrainers}
        />
      )}

      {trainerAction && (
        <ConfirmDialog
          title={`Permanently remove ${trainerAction.trainer.full_name}?`}
          description="This permanently deletes the trainer account. Existing member and workout assignments will be unassigned."
          confirmLabel="Remove trainer"
          isLoading={trainerActionLoading}
          error={trainerActionError}
          onCancel={() => {
            if (!trainerActionLoading) {
              setTrainerAction(null);
              setTrainerActionError("");
            }
          }}
          onConfirm={confirmTrainerAction}
        />
      )}

      <header className="ave-page-hero flex flex-wrap items-end justify-between gap-4 rounded-3xl border border-orange-100 px-5 py-6 dark:border-white/5 sm:px-7 sm:py-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-600 dark:text-orange-400">People management</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900 dark:text-white">Trainers</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Manage coach accounts, specialties, and member rosters.</p>
        </div>
        <button
          onClick={handleAdd}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
        >
          <Plus size={18} />
          Add Trainer
        </button>
      </header>

      {fetchError && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          ⚠️ {fetchError}
        </div>
      )}

      <section aria-label="Coach summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[{label:"Total coaches",value:trainers.length},{label:"Active coaches",value:activeCount},{label:"Pending approval",value:pendingCount}].map(item=><div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111]"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p><p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{loading?"—":item.value}</p></div>)}
      </section>

      {/* Search */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111] sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 dark:bg-white/5 sm:w-72">
          <Search size={16} className="text-gray-400" />
          <input
            type="search"
            placeholder="Search trainers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search trainers"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none dark:text-white"
          />
        </label>
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Filter trainers by status">
          {["All","Active","Pending","Inactive"].map(status=><button key={status} type="button" aria-pressed={statusFilter===status} onClick={()=>setStatusFilter(status)} className={`min-h-9 rounded-lg px-3 text-sm font-semibold transition ${statusFilter===status?"bg-orange-500 text-white":"bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"}`}>{status}{status==="Pending"&&pendingCount?` (${pendingCount})`:""}</button>)}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#111]">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Coach</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Specialization</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Phone</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Member capacity</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Status</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Joined</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">No coaches found.</td>
                </tr>
              ) : (
                filtered.map((trainer, index) => (
                  <ScrollReveal
                    as="tr"
                    key={trainer.trainer_id}
                    delay={Math.min(index, 4) * 100}
                    onClick={() => setProfileTrainer(trainer)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-orange-500 font-bold text-sm flex-shrink-0 overflow-hidden border-2 border-orange-500/20">
                          {trainer.photo_url ? <img src={trainer.photo_url} alt={trainer.full_name} className="w-full h-full object-cover" /> : trainer.full_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-800">{trainer.full_name}</p>
                          <p className="text-slate-400 text-xs">{trainer.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">
                      <div className="flex max-w-sm flex-wrap items-center gap-1.5">
                        {(() => {
                          const specializations = normalizeSpecializations(trainer);
                          return specializations.length ? (
                            <>
                              {specializations.slice(0, 3).map((item) => (
                                <span
                                  key={item}
                                  title={item}
                                  className="inline-flex max-w-[180px] items-center gap-1.5 rounded-lg border border-orange-200/80 bg-gradient-to-br from-orange-50 to-white px-2.5 py-1.5 text-xs font-semibold leading-tight text-orange-800 shadow-sm shadow-orange-900/[0.03] dark:border-orange-400/20 dark:from-orange-500/15 dark:to-orange-500/[0.06] dark:text-orange-300"
                                >
                                  <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500 dark:bg-orange-400" />
                                  <span className="truncate">{item}</span>
                                </span>
                              ))}
                              {specializations.length > 3 && (
                                <span
                                  title={specializations.slice(3).join(", ")}
                                  className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300"
                                >
                                  +{specializations.length - 3} more
                                </span>
                              )}
                            </>
                          ) : <span className="text-slate-400">—</span>;
                        })()}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600">{trainer.phone || "—"}</td>
                    <td className="px-6 py-4">
                      <div className="min-w-36">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-200">{trainer.assigned_member_count ?? 0}/{trainer.max_members ?? 15} members</span>
                          <button type="button" onClick={() => setCapacityTrainer(trainer)} className="font-semibold text-orange-600 hover:underline dark:text-orange-400" aria-label={`Edit ${trainer.full_name}'s capacity`}>Edit</button>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-white/10">
                          <div className={`h-full rounded-full ${trainer.capacity_status === "Full" ? "bg-red-500" : trainer.capacity_status === "Near Capacity" ? "bg-orange-500" : trainer.capacity_status === "Inactive" ? "bg-slate-400" : "bg-green-500"}`} style={{ width: `${Math.min(Number(trainer.capacity_percent) || 0, 100)}%` }} />
                        </div>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${trainer.capacity_status === "Full" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" : trainer.capacity_status === "Near Capacity" ? "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" : trainer.capacity_status === "Inactive" ? "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300" : "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"}`}>{trainer.capacity_status || "Available"}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[trainer.status] || statusColors.Inactive}`}>
                        {trainer.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {trainer.created_at ? new Date(trainer.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setProfileTrainer(trainer)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-orange-600 transition hover:bg-orange-50"
                          title="View Coach Profile"
                          aria-label={`View ${trainer.full_name}'s coach profile`}
                        >
                          <UserCircle size={16} />
                          <span className="text-xs font-semibold">Profile</span>
                        </button>
                        <button
                          onClick={() => setRosterTrainer(trainer)}
                          className="p-1.5 rounded-lg hover:bg-green-50 text-green-500 transition"
                          title="View Roster / Assign Workouts"
                        >
                          <Users size={16} />
                        </button>
                        <button
                          onClick={() => setAvailabilityTrainer(trainer)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 transition"
                          title="View availability"
                          aria-label={`View ${trainer.full_name}'s availability`}
                        >
                          <CalendarClock size={16} />
                        </button>
                        <button
                          onClick={() => handleEdit(trainer)}
                          className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-500 transition"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        {trainer.status === "Pending" && (
                          <button onClick={() => handleApprove(trainer.trainer_id)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-500 transition" title="Approve"><UserCheck size={16} /></button>
                        )}
                        {trainer.status === "Active" && (
                          <button
                            onClick={() => handleRemove(trainer)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition"
                            title="Remove trainer"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                        {(trainer.status === "Inactive" || trainer.status === "Rejected") && (
                          <button
                            onClick={() => handleRemove(trainer)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition"
                            title="Remove trainer"
                          >
                            <XCircle size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </ScrollReveal>
                ))
              )}
            </tbody>
          </table>
        )}
        <div className="px-6 py-3 border-t border-slate-100 text-sm text-slate-400">
          {filtered.length} of {trainers.length} coaches
        </div>
      </div>
    </div>
  );
}