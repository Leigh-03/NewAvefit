import { useEffect, useState, useRef } from "react";
import { UserCheck, Plus, Search, Edit2, XCircle, Users, UserCircle, X, Camera, Check, Eye, EyeOff, CalendarClock } from "lucide-react";
import api from "../services/api";
import { fileToCompressedDataUrl } from "../utils/imageUpload";
import TrainerAvailabilityManager from "../components/trainers/TrainerAvailabilityManager";
import ConfirmDialog from "../components/ui/ConfirmDialog";

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

const TRAINER_EMAIL_DOMAIN = "@avefit.com";
const emailLocalPart = (value) => String(value || "").replace(/\s/g, "").split("@")[0];

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
    trainer || { full_name: "", email: "", phone: "09", specializations: [], goal_specialty: "" }
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

  // The exact address the coach will type on the login screen. Surfaced in the
  // form so an edit can never change the login email without the admin seeing it.
  const loginUsername = emailLocalPart(form.email);
  const loginEmail = loginUsername ? `${loginUsername}${TRAINER_EMAIL_DOMAIN}` : "";
  const storedEmailMismatch =
    Boolean(trainer?.email) &&
    Boolean(loginEmail) &&
    String(trainer.email).trim().toLowerCase() !== loginEmail.toLowerCase();

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

    const username = emailLocalPart(form.email);
    if (!username) {
      setError(`Enter the email username before ${TRAINER_EMAIL_DOMAIN}.`);
      return;
    }
    if (username.length < 3 || username.length > 64) {
      setError(`Email username must be 3 to 64 characters (currently ${username.length}).`);
      return;
    }
    if (!/^[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9])?$/.test(username)) {
      setError("Email username may only use letters, numbers, and . _ % + - and must start and end with a letter or number.");
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
      const payload = { ...form, email: `${username}${TRAINER_EMAIL_DOMAIN}`, specializations: selectedSpecializations, photo_url: photo, ...(password ? { password } : {}) };
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
            <div className="flex items-stretch overflow-hidden rounded-lg border border-slate-300 focus-within:ring-2 focus-within:ring-orange-500">
              <input
                type="text"
                autoComplete="off"
                required
                spellCheck={false}
                maxLength={64}
                placeholder="username"
                value={emailLocalPart(form.email)}
                onChange={(e) => {
                  const username = e.target.value.replace(/[^A-Za-z0-9._%+-]/g, "").slice(0, 64);
                  setForm({ ...form, email: username ? `${username}${TRAINER_EMAIL_DOMAIN}` : "" });
                }}
                className="min-w-0 flex-1 px-4 py-2.5 text-sm focus:outline-none"
              />
              <span className="flex select-none items-center border-l border-slate-300 bg-slate-100 px-3 text-sm font-semibold text-slate-500">
                {TRAINER_EMAIL_DOMAIN}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Coach signs in with <strong className="text-slate-600">{loginEmail || `username${TRAINER_EMAIL_DOMAIN}`}</strong>. The domain cannot be changed.
            </p>
            {storedEmailMismatch && (
              <p className="text-xs text-amber-600 mt-1">
                Current login email is <strong>{trainer.email}</strong>. Saving changes it to <strong>{loginEmail}</strong> &mdash; tell the coach to use the new address.
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
              <option value="Muscle Gain">Muscle Gain</option>
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

function TrainerProfileModal({ trainer, onClose, onEdit }) {
  const specializations = normalizeSpecializations(trainer);
  const expertise = [...new Set([...specializations, trainer.goal_specialty].filter(Boolean))];

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trainer-profile-title"
        className="bg-white dark:bg-[#111] rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex justify-center bg-transparent">
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 z-30 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white hover:bg-black"
            aria-label="Close trainer profile"
          >
            <X size={19} />
          </button>
          {trainer.photo_url ? (
            <div className="relative inline-flex max-h-[55vh] max-w-full items-center justify-center overflow-hidden">
              <img
                src={trainer.photo_url}
                alt={trainer.full_name}
                className="block max-h-[55vh] max-w-full object-contain"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black via-black/80 to-transparent" />
              <div className="absolute bottom-4 left-5 right-5 z-20 text-white drop-shadow-md sm:bottom-5 sm:left-6 sm:right-6">
                <p className="text-xs font-bold uppercase tracking-widest text-orange-300">Trainer Profile</p>
                <h2 id="trainer-profile-title" className="mt-1 text-2xl font-bold sm:text-3xl">{trainer.full_name}</h2>
                <p className="mt-1 text-sm font-semibold text-orange-300">
                  {trainer.goal_specialty || "General Fitness Coach"}
                </p>
              </div>
            </div>
          ) : (
            <div className="relative flex h-64 w-full items-center justify-center bg-slate-950">
              <UserCircle size={150} className="text-orange-500" />
              <div className="absolute bottom-4 left-5 right-16 text-white sm:bottom-5 sm:left-6">
                <p className="text-xs font-bold uppercase tracking-widest text-orange-300">Trainer Profile</p>
                <h2 id="trainer-profile-title" className="mt-1 text-2xl font-bold sm:text-3xl">{trainer.full_name}</h2>
                <p className="mt-1 text-sm font-semibold text-orange-300">
                  {trainer.goal_specialty || "General Fitness Coach"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="p-5 sm:p-6">
          <section>
            <p className="text-xs uppercase tracking-wider font-bold text-slate-400">
              About the Trainer
            </p>
            <p className="text-sm leading-7 text-slate-600 dark:text-slate-400 mt-2 whitespace-pre-line">
              {trainer.bio || "This trainer has not added a profile description yet."}
            </p>
          </section>

          <section className="mt-6">
            <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mb-3">
              Specializations
            </p>
            {expertise.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {expertise.map((item) => (
                  <span
                    key={item}
                    className="px-3 py-2 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-semibold"
                  >
                    {item}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No specializations listed.</p>
            )}
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Email</p>
              <p className="font-medium text-sm mt-1 break-all text-slate-700 dark:text-slate-200">
                {trainer.email || "—"}
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-400">Phone</p>
              <p className="font-medium text-sm mt-1 text-slate-700 dark:text-slate-200">
                {trainer.phone || "—"}
              </p>
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-400">Account Status</p>
              <p className="font-semibold text-sm mt-1 text-slate-800 dark:text-white">
                {trainer.status || "Active"}
              </p>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${statusColors[trainer.status] || statusColors.Active}`}>
              {trainer.status || "Active"}
            </span>
          </section>

          <div className="grid grid-cols-2 gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-900"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold"
            >
              Edit Trainer Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member }) {
  return (
    <div className="border border-[#303030] bg-[#171717] rounded-xl px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-orange-500/15 flex items-center justify-center text-orange-400 font-bold text-xs">
          {member.first_name?.charAt(0)}{member.last_name?.charAt(0)}
        </div>
        <div>
          <p className="font-semibold text-gray-100 text-sm">{member.first_name} {member.last_name}</p>
          <p className="text-gray-400 text-xs">{member.fitness_goal || "No goal set"} · {member.email}</p>
        </div>
      </div>
    </div>
  );
}

function RosterModal({ trainer, onClose }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/trainers/${trainer.trainer_id}/roster`)
      .then((rosterRes) => setMembers(rosterRes.data.data || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [trainer.trainer_id]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
          ) : members.length === 0 ? (
            <p className="text-center text-slate-400 py-12 text-sm">No members have chosen this coach yet.</p>
          ) : (
            members.map((m) => <MemberRow key={m.user_id} member={m} />)
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

  const handleReject = async (id) => {
    const trainer = trainers.find((row) => Number(row.trainer_id) === Number(id));
    if (trainer) {
      setTrainerAction({ kind: "reject", trainer });
      setTrainerActionError("");
    }
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
      if (trainerAction.kind === "remove") {
        await api.delete(`/trainers/${trainerAction.trainer.trainer_id}`);
      } else {
        await api.put(`/trainers/${trainerAction.trainer.trainer_id}/reject`);
      }
      setTrainerAction(null);
      fetchTrainers();
    } catch (err) {
      const action = trainerAction.kind === "remove" ? "remove this trainer" : "reject this trainer";
      setTrainerActionError(err.response?.data?.message || `Failed to ${action}. Please try again.`);
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

      {trainerAction && (
        <ConfirmDialog
          title={trainerAction.kind === "remove"
            ? `Permanently remove ${trainerAction.trainer.full_name}?`
            : `Reject ${trainerAction.trainer.full_name}?`}
          description={trainerAction.kind === "remove"
            ? "This permanently deletes the trainer account. Existing member and workout assignments will be unassigned."
            : "This will mark the trainer account as rejected so they cannot access the coach portal."}
          confirmLabel={trainerAction.kind === "remove" ? "Remove trainer" : "Reject trainer"}
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

      <section aria-label="Trainer summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[{label:"Total trainers",value:trainers.length},{label:"Active trainers",value:activeCount},{label:"Pending approval",value:pendingCount}].map(item=><div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111]"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.label}</p><p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">{loading?"—":item.value}</p></div>)}
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
          {["All","Active","Pending","Inactive","Rejected"].map(status=><button key={status} type="button" aria-pressed={statusFilter===status} onClick={()=>setStatusFilter(status)} className={`min-h-9 rounded-lg px-3 text-sm font-semibold transition ${statusFilter===status?"bg-orange-500 text-white":"bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-300"}`}>{status}{status==="Pending"&&pendingCount?` (${pendingCount})`:""}</button>)}
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
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Trainer</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Specialization</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Phone</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Status</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Joined</th>
                <th className="text-left px-6 py-4 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">No trainers found.</td>
                </tr>
              ) : (
                filtered.map((trainer) => (
                  <tr key={trainer.trainer_id} onClick={() => setProfileTrainer(trainer)} className="hover:bg-slate-50 transition cursor-pointer">
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
                    <td className="px-6 py-4 text-slate-600"><div className="flex flex-wrap gap-1.5 max-w-sm">{(trainer.specializations || normalizeSpecializations(trainer)).length ? (trainer.specializations || normalizeSpecializations(trainer)).slice(0, 3).map((item) => <span key={item} className="px-2 py-1 rounded-full bg-orange-50 text-orange-700 text-xs font-medium">{item}</span>) : <span>—</span>}{(trainer.specializations || normalizeSpecializations(trainer)).length > 3 && <span className="text-xs text-slate-400">+{(trainer.specializations || normalizeSpecializations(trainer)).length - 3} more</span>}</div></td>
                    <td className="px-6 py-4 text-slate-600">{trainer.phone || "—"}</td>
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
                          title="Manage availability"
                          aria-label={`Manage ${trainer.full_name}'s availability`}
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
                          <>
                            <button onClick={() => handleApprove(trainer.trainer_id)} className="p-1.5 rounded-lg hover:bg-green-50 text-green-500 transition" title="Approve"><UserCheck size={16} /></button>
                            <button onClick={() => handleReject(trainer.trainer_id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition" title="Reject"><XCircle size={16} /></button>
                          </>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
        <div className="px-6 py-3 border-t border-slate-100 text-sm text-slate-400">
          {filtered.length} of {trainers.length} trainers
        </div>
      </div>
    </div>
  );
}