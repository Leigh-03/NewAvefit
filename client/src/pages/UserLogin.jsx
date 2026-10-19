import { useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { MailCheck } from "lucide-react";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import AuthShell from "../components/layout/AuthShell";
import { Alert, Field, PasswordField, PrimaryButton } from "../components/ui/Form";
import { useUserAuth } from "../context/UserAuthContext";
import { USER_REMEMBERED_EMAIL_KEY, USER_REMEMBER_ME_KEY } from "../context/userAuthStorage";
import userApi from "../userApi";

const TABS = [
  { id: "login", label: "Log in" },
  { id: "signup", label: "Sign up" },
];

const SIGNUP_NAME_PATTERN = /^[A-Za-zÀ-ÿ' -]+$/;
const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "12345678", "123456789",
  "1234567890", "qwerty123", "qwertyuiop", "admin123", "admin1234",
  "avefit123", "letmein123", "welcome123", "iloveyou1", "abc123456",
  "changeme1",
]);

function getSignupValidationError(form) {
  const firstName = form.first_name.trim();
  const lastName = form.last_name.trim();
  const email = form.email.trim();
  const phone = form.phone.trim();
  const password = form.password;

  if (!firstName) return "Enter your first name.";
  if (!lastName) return "Enter your last name.";
  if (
    firstName.length < 2 ||
    firstName.length > 50 ||
    !SIGNUP_NAME_PATTERN.test(firstName) ||
    lastName.length < 2 ||
    lastName.length > 50 ||
    !SIGNUP_NAME_PATTERN.test(lastName)
  ) {
    return "First and last names must be 2–50 characters and use letters, spaces, apostrophes, or hyphens.";
  }
  if (!email) return "Enter your email address.";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email)) {
    return "Enter a valid email address, such as name@example.com.";
  }
  if (!phone) return "Enter your phone number.";
  if (phone && !/^09\d{9}$/.test(phone)) {
    return "Phone number must start with 09 and contain exactly 11 digits.";
  }
  if (!password) return "Enter a password.";
  if (password.length < 8 || password.length > 12) {
    return "Password must be 8–12 characters long.";
  }
  if (!/[A-Za-z]/.test(password)) return "Password must include at least one letter.";
  if (!/\d/.test(password)) return "Password must include at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must include at least one symbol.";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return "Choose a less common password.";
  }
  if (!form.agreed) return "Please agree to the Terms and Conditions.";
  return "";
}

export default function UserLogin() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginUser } = useUserAuth();
  const [mode, setMode] = useState(searchParams.get("mode") === "signup" ? "signup" : "login");
  const [rememberMe, setRememberMe] = useState(
    () => localStorage.getItem(USER_REMEMBER_ME_KEY) === "true"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingNotice, setPendingNotice] = useState(false);
  const [unverifiedEmail, setUnverifiedEmail] = useState("");
  const [resendNotice, setResendNotice] = useState("");
  const [resending, setResending] = useState(false);

  const [loginForm, setLoginForm] = useState({
    email: localStorage.getItem(USER_REMEMBERED_EMAIL_KEY) || "",
    password: "",
  });
  const [signupForm, setSignupForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    password: "",
    agreed: false,
  });
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const goToDestination = (user) => {
    const returnLocation = location.state?.from;
    const returnPath = returnLocation?.pathname;
    const isValidReturnPath = typeof returnPath === "string"
      && returnPath.startsWith("/user/")
      && !["/user/login", "/user/pending", "/user/reset-password"].includes(returnPath);
    const destination = user?.setup_completed
      ? isValidReturnPath
        ? `${returnPath}${returnLocation.search || ""}${returnLocation.hash || ""}`
        : "/user/workout"
      : "/user/assessment";
    navigate(destination, { replace: true });
  };

  const handleLogin = async () => {
    if (!loginForm.email || !loginForm.password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    setError("");
    setPendingNotice(false);
    setResendNotice("");

    try {
      const res = await userApi.post("/login", { ...loginForm, rememberMe });
      loginUser(res.data.user, res.data.token, rememberMe);
      goToDestination(res.data.user);
    } catch (err) {
      const status = err.response?.status;
      const bodyStatus = err.response?.data?.status;
      if (status === 403 && bodyStatus === "Unverified") {
        // Offer to resend here because most people hit this right after signing up
        // and the original email may have gone to spam.
        setUnverifiedEmail(loginForm.email);
        setError(err.response?.data?.message || "Please verify your email address first.");
      } else if (status === 403 && (bodyStatus === "Pending" || bodyStatus === "Rejected")) {
        setPendingNotice(bodyStatus === "Pending");
        setError(bodyStatus === "Rejected" ? err.response?.data?.message || "Login failed." : "");
      } else {
        setError(err.response?.data?.message || "Login failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSuccess = async ({ credential }) => {
    if (!credential) {
      setError("Google sign-in did not return an identity token. Please try again.");
      return;
    }
    if (mode === "signup" && !signupForm.agreed) {
      setError("Please agree to the Terms and Conditions before creating your account.");
      return;
    }
    if (mode === "signup" && signupForm.phone && !/^09\d{9}$/.test(signupForm.phone)) {
      setError("Phone number must start with 09 and contain exactly 11 digits, or leave it blank.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await userApi.post("/google-login", {
        credential,
        intent: mode,
        phone: signupForm.phone || null,
        first_name: signupForm.first_name,
        last_name: signupForm.last_name,
        termsAccepted: signupForm.agreed,
        rememberMe,
      });
      loginUser(res.data.user, res.data.token, rememberMe);
      goToDestination(res.data.user);
    } catch (err) {
      const status = err.response?.data?.status;
      const code = err.response?.data?.code;
      if (status === "Pending") {
        sessionStorage.setItem("avefit_pending_email", err.response.data.email);
        sessionStorage.setItem("avefit_pending_email_verified", "true");
        navigate("/user/pending", { replace: true });
      } else if (status === "Rejected") {
        setError(err.response?.data?.message || "Your account was not approved.");
      } else if (code === "SIGNUP_REQUIRED") {
        setMode("signup");
        navigate("/user/login?mode=signup", { replace: true });
        setError("No AveFit account was found. Accept the Terms, then continue with Google to create your account. A phone number is optional for Google sign-up.");
      } else {
        setError(err.response?.data?.message || "Google sign-in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unverifiedEmail) return;

    setResending(true);
    setError("");
    setResendNotice("");

    try {
      const res = await userApi.post("/resend-verification", { email: unverifiedEmail });
      setResendNotice(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to send a new code right now.");
    } finally {
      setResending(false);
    }
  };

  const handleSignup = async () => {
    const validationError = getSignupValidationError(signupForm);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await userApi.post("/register", signupForm);
      // Remembered so the pending screen can prefill the verification form.
      sessionStorage.setItem("avefit_pending_email", signupForm.email.trim());
      sessionStorage.removeItem("avefit_pending_email_verified");
      sessionStorage.setItem(
        "avefit_verification_email_delivery_failed",
        String(response.data?.email_sent !== true)
      );
      navigate("/user/pending", { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (next) => {
    setMode(next);
    navigate(next === "signup" ? "/user/login?mode=signup" : "/user/login", { replace: true });
    setError("");
    setPendingNotice(false);
    setResendNotice("");
    setResetNotice("");
  };

  const googleButtonClasses =
    "flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-orange-500 bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:border-orange-600 hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:cursor-not-allowed disabled:opacity-60";

  const GoogleBrandIcon = () => (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="h-6 w-6 shrink-0">
      <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.5-1.9 4.6-4 6l6.5 5c3.8-3.5 6.1-8.6 6.1-14.7z" />
      <path fill="#34A853" d="M24 44c5.4 0 10-1.8 13.3-4.8l-6.5-5c-1.8 1.2-4.1 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2l-6.7 5.2C9.4 39.5 16.1 44 24 44z" />
      <path fill="#FBBC05" d="M12.8 28c-.4-1.2-.7-2.6-.7-4s.2-2.7.7-4l-6.7-5.2C4.8 18 4 20.9 4 24s.8 6 2.1 9.2l6.7-5.2z" />
      <path fill="#EA4335" d="M24 11.8c2.9 0 5.5 1 7.5 3l5.7-5.7C33.8 5.8 29.2 4 24 4 16.1 4 9.4 8.5 6.1 14.8l6.7 5.2c1.6-4.7 6-8.2 11.2-8.2z" />
    </svg>
  );

  const googleButton = (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <span>or</span>
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
      </div>
      <div className="flex justify-center">
        {googleClientId ? (
          <GoogleOAuthProvider clientId={googleClientId}>
            <GoogleLogin
              onSuccess={handleGoogleSuccess}
              onError={() => setError("Google sign-in failed or was cancelled. Please try again.")}
              render={({ onClick, disabled }) => (
                <button
                  type="button"
                  onClick={onClick}
                  disabled={disabled || loading}
                  className={`${googleButtonClasses} ${loading ? "cursor-not-allowed opacity-80" : ""}`}
                >
                  <GoogleBrandIcon />
                  <span>Continue with Google</span>
                </button>
              )}
            />
          </GoogleOAuthProvider>
        ) : (
          <button
            type="button"
            onClick={() => setError("Google sign-in is not configured. Set the same Google OAuth client ID in client/.env (VITE_GOOGLE_CLIENT_ID) and server/.env (GOOGLE_CLIENT_ID) to enable it.")}
            className={googleButtonClasses}
          >
            <GoogleBrandIcon />
            <span>Continue with Google</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <AuthShell
      width="max-w-lg"
      glass
      title="Welcome to AveFit"
      subtitle="Avenue Power and Fitness Gym"
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
      <div
        role="tablist"
        aria-label="Account access"
        className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-white/5"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={mode === tab.id}
            onClick={() => switchTab(tab.id)}
            className={`rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              mode === tab.id
                ? "bg-orange-500 text-white shadow-sm"
                : "text-slate-500 hover:text-orange-600 dark:text-slate-400"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === "login" ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          {location.state?.passwordChanged && (
            <Alert tone="info">
              Your password was changed successfully. Log in with your new password.
            </Alert>
          )}
          <Field
            label="Email address"
            htmlFor="user-login-email"
            type="email"
            name="email"
            autoComplete="username"
            placeholder="your@email.com"
            value={loginForm.email}
            onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
          />

          <PasswordField
            label="Password"
            htmlFor="user-login-password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={loginForm.password}
            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
          />

          <label
            htmlFor="remember-user"
            className="flex w-fit cursor-pointer items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300"
          >
            <input
              id="remember-user"
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-orange-500"
            />
            Remember Me
          </label>

          {googleButton}

          {pendingNotice && (
            <Alert tone="warning">
              Your account is awaiting approval from the gym. You&apos;ll be able to log in
              once an administrator has reviewed your registration.
            </Alert>
          )}

          {unverifiedEmail && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start gap-2.5">
                <MailCheck size={18} className="mt-0.5 shrink-0 text-orange-500" />
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                  Your email address is not verified. Enter the code sent to {unverifiedEmail}
                  on the confirmation screen, or send a new one.
                </p>
              </div>

              {resendNotice && <Alert tone="info">{resendNotice}</Alert>}

              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-orange-600 bg-orange-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-orange-700 disabled:opacity-60"
              >
                {resending && (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-orange-500/30 border-t-orange-500" />
                )}
                {resending ? "Sending…" : "Resend verification code"}
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem("avefit_pending_email", unverifiedEmail);
                  navigate("/user/pending");
                }}
                className="w-full rounded-xl px-5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Enter verification code
              </button>
            </div>
          )}

          {error && <Alert tone="error">{error}</Alert>}

          <PrimaryButton type="submit" loading={loading} loadingText="Logging in…" className="mt-2 !h-12 !px-4 !py-0">
            Log in
          </PrimaryButton>

          <div className="text-center">
            <button
              type="button"
              onClick={() => navigate("/user/reset-password", { state: { email: loginForm.email } })}
              className="text-sm font-semibold text-orange-600 transition hover:text-orange-700 dark:text-orange-400 dark:hover:text-orange-300"
            >
              Forgot password?
            </button>
          </div>
        </form>
      ) : (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            handleSignup();
          }}
        >
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Create your account
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Start your personalised setup in a couple of minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="First name"
              htmlFor="signup-first"
              autoComplete="given-name"
              placeholder="Juan"
              maxLength={50}
              value={signupForm.first_name}
              onChange={(e) => setSignupForm({ ...signupForm, first_name: e.target.value })}
            />
            <Field
              label="Last name"
              htmlFor="signup-last"
              autoComplete="family-name"
              placeholder="dela Cruz"
              maxLength={50}
              value={signupForm.last_name}
              onChange={(e) => setSignupForm({ ...signupForm, last_name: e.target.value })}
            />
          </div>

          <Field
            label="Email address"
            htmlFor="signup-email"
            type="email"
            autoComplete="email"
            placeholder="your@email.com"
            required
            value={signupForm.email}
            onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
          />

          <Field
            label="Phone number"
            htmlFor="signup-phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            minLength={11}
            maxLength={11}
            pattern="09[0-9]{9}"
            placeholder="XXXXXXXXX"
            required
            value={signupForm.phone}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
              const phone = digits.startsWith("0")
                ? digits.length > 1 && digits[1] !== "9" ? "0" : digits
                : "";
              setSignupForm({ ...signupForm, phone });
            }}
          />
          <PasswordField
            label="Password"
            htmlFor="signup-password"
            autoComplete="new-password"
            placeholder="••••••••"
            minLength={8}
            maxLength={12}
            required
            value={signupForm.password}
            onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
          />
          <p className="-mt-3 text-xs text-slate-500">8–12 characters with a letter, number, and symbol.</p>

          <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={signupForm.agreed}
              onChange={(e) => setSignupForm({ ...signupForm, agreed: e.target.checked })}
              className="mt-0.5"
            />
            I agree to the Terms and Conditions of AveFit
          </label>

          {googleButton}

          {error && <Alert tone="error">{error}</Alert>}

          <PrimaryButton type="submit" loading={loading} loadingText="Creating account…" className="mt-2">
            Create account
          </PrimaryButton>
        </form>
      )}
    </AuthShell>
  );
}
