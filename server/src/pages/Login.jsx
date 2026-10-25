import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Eye, EyeOff } from "lucide-react";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) { setError("Please enter your email and password."); return; }
    setLoading(true); setError("");
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/admin/login`, { email, password });
      sessionStorage.setItem("avefit_token", res.data.token);
      localStorage.setItem("avefit_admin", JSON.stringify(res.data.admin));
      navigate("/admin/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-blue-400">AveFit</h1>
          <p className="text-slate-400 mt-1">Admin Panel — Avenue Power and Fitness Gym</p>
        </div>

        <div className="bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-1">Admin Login</h2>
          <p className="text-slate-400 text-sm mb-6">Manage members, trainers, workouts, and analytics.</p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-12"
                />
                <button
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition"
            >
              {loading ? "Signing in..." : "Sign In"}
            </button>
          </div>
        </div>

        <p className="text-center text-slate-500 text-sm mt-6">
          <button onClick={() => navigate("/")} className="hover:text-slate-300 transition">
            ← Go to Member Portal
          </button>
        </p>
        <p className="text-center text-xs text-slate-600 mt-2">
          AveFit — Batangas State University Capstone Project 2026
        </p>
      </div>
    </div>
  );
}
