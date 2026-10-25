import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import AuthShell from "../components/layout/AuthShell";
import { Alert, Field, PasswordField, PrimaryButton } from "../components/ui/Form";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(`${import.meta.env.VITE_API_URL}/api/admin/login`, { email, password });
      sessionStorage.setItem("avefit_token", res.data.token);
      localStorage.setItem("avefit_admin", JSON.stringify(res.data.admin));
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Admin sign in"
      subtitle="Manage members, trainers, workouts and analytics."
      footer={
        <div className="mt-6 flex flex-col items-center gap-3 text-sm text-slate-500">
          <button
            type="button"
            onClick={() => navigate("/admin/reset-password")}
            className="rounded font-medium transition hover:text-orange-600"
          >
            Forgot your password?
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded font-medium transition hover:text-orange-600"
          >
            &larr; Back to homepage
          </button>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleLogin();
        }}
      >
        <Field
          label="Email address"
          htmlFor="admin-email"
          type="email"
          name="email"
          autoComplete="username"
          placeholder="admin@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <PasswordField
          label="Password"
          htmlFor="admin-password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <Alert tone="error">{error}</Alert>}

        <PrimaryButton
          type="submit"
          loading={loading}
          loadingText="Signing in…"
          className="mx-auto mt-2 !flex !h-12 !w-full !max-w-[400px] !px-4 !py-0"
        >
          Sign in
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}
