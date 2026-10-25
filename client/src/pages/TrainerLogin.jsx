import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthShell from "../components/layout/AuthShell";
import { Alert, Field, PasswordField, PrimaryButton } from "../components/ui/Form";
import { useTrainerAuth } from "../context/TrainerAuthContext";
import trainerApi from "../trainerApi";

export default function TrainerLogin() {
  const navigate = useNavigate();
  const { loginTrainer } = useTrainerAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingNotice, setPendingNotice] = useState(false);

  const handleLogin = async () => {
    if (!form.email || !form.password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    setError("");
    setPendingNotice(false);
    try {
      const res = await trainerApi.post("/login", form);
      loginTrainer(res.data.trainer, res.data.token);
      navigate("/trainer/roster", { replace: true });
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
    <AuthShell
      title="Coach sign in"
      subtitle="Access your roster and assign workouts to your members."
      footer={
        <p className="mt-6 text-center text-sm text-slate-500">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded font-medium transition hover:text-orange-600"
          >
            &larr; Back to homepage
          </button>
        </p>
      }
    >
      <form
        className="space-y-4"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          handleLogin();
        }}
      >
        <Field
          label="Email address"
          htmlFor="trainer-email"
          type="email"
          name="trainer_email"
          autoComplete="off"
          placeholder="coach@example.com"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />

        <PasswordField
          label="Password"
          htmlFor="trainer-password"
          name="trainer_password"
          autoComplete="off"
          placeholder="••••••••"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        {pendingNotice && (
          <Alert tone="warning">
            Your trainer account is still pending approval. Please wait 1&ndash;3 working
            days while the gym administrator reviews it.
          </Alert>
        )}
        {error && <Alert tone="error">{error}</Alert>}

        <PrimaryButton
          type="submit"
          loading={loading}
          loadingText="Signing in…"
          className="mx-auto mt-2 !flex !h-12 !w-full !max-w-[400px] !px-4 !py-0"
        >
          Sign in
        </PrimaryButton>

        <p className="pt-1 text-center text-xs text-slate-400 dark:text-slate-500">
          Don&apos;t have portal access yet? Ask the gym admin to set a password for your
          trainer account.
        </p>
      </form>
    </AuthShell>
  );
}
