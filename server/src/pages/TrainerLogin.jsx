import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useTrainerAuth } from "../context/TrainerAuthContext";
import trainerApi from "../trainerApi";

export default function TrainerLogin() {
  const navigate = useNavigate();
  const { loginTrainer } = useTrainerAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingNotice, setPendingNotice] = useState(false);

  const handleLogin = async () => {
    if (!form.email || !form.password) { setError("Please fill in all fields."); return; }
    setLoading(true); setError(""); setPendingNotice(false);
    try {
      const res = await trainerApi.post("/login", form);
      loginTrainer(res.data.trainer, res.data.token);
      navigate("/trainer/roster");
    } catch (err) {
      if (err.response?.status === 403 && err.response?.data?.status === "Pending") {
        setPendingNotice(true);
      } else {
        setError(err.response?.data?.message || "Login failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-emerald-400">AveFit</h1>
          <p className="text-slate-400 mt-1">Coach / Trainer Portal</p>
        </div>

        <div className="bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-1">Trainer Login</h2>
          <p className="text-slate-400 text-sm mb-6">Access your roster and assign workouts to your members.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                placeholder="coach@example.com"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  placeholder="••••••••"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 pr-12"
                />
                <button
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {pendingNotice && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
                <p className="text-yellow-300 font-semibold">Trainer Account Pending Approval</p>
                <p className="text-slate-400 text-sm mt-1">Please wait 1-3 working days while the gym administrator reviews your account.</p>
              </div>
            )}
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition"
            >
              {loading ? "Logging in..." : "Login"}
            </button>

            <p className="text-center text-slate-500 text-xs">
              Don't have portal access yet? Ask the gym admin to set a password for your trainer account.
            </p>
          </div>
        </div>

        <p className="text-center text-slate-500 text-sm mt-6">
          <button onClick={() => navigate("/")} className="hover:text-slate-300 transition">
            ← Back to Homepage
          </button>
        </p>
      </div>
    </div>
  );
}
