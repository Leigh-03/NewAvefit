import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Clock3, MailCheck } from "lucide-react";
import OnboardingShell from "../components/layout/OnboardingShell";
import { Alert, Field, PrimaryButton } from "../components/ui/Form";
import userApi from "../userApi";

/**
 * Shown straight after signup. The member has to confirm their email address
 * before the gym administrator can be asked to review the registration, so this
 * screen covers both halves of the waiting period.
 */
export default function PendingApproval() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verified, setVerified] = useState(
    () => sessionStorage.getItem("avefit_pending_email_verified") === "true"
  );
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [deliveryFailed, setDeliveryFailed] = useState(
    () => sessionStorage.getItem("avefit_verification_email_delivery_failed") === "true"
  );
  const [notice, setNotice] = useState(() =>
    sessionStorage.getItem("avefit_pending_email_verified") === "true"
      ? "Your email is already verified. Your registration is with the gym administrator."
      : ""
  );
  const [error, setError] = useState("");

  // Check whether this account still needs the code, so the screen does not
  // keep telling somebody to look for an email they already opened.
  useEffect(() => {
    const pendingEmail = sessionStorage.getItem("avefit_pending_email");
    if (!pendingEmail) return;

    setEmail(pendingEmail);
    let cancelled = false;

    userApi
      .get("/verification-status", { params: { email: pendingEmail } })
      .then((res) => {
        if (cancelled || !res.data?.registered) return;
        if (res.data.email_verified) {
          setVerified(true);
          sessionStorage.setItem("avefit_pending_email_verified", "true");
          setNotice("Your email is already verified. Your registration is with the gym administrator.");
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const handleVerify = async (event) => {
    event.preventDefault();
    if (!email) {
      setError("Enter the email address you registered with.");
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the six-digit code from your email.");
      return;
    }

    setVerifying(true);
    setError("");
    setNotice("");
    try {
      const res = await userApi.post("/verify-email", { email, code });
      setVerified(true);
      setDeliveryFailed(false);
      sessionStorage.removeItem("avefit_verification_email_delivery_failed");
      sessionStorage.setItem("avefit_pending_email_verified", "true");
      setNotice(res.data.message);
    } catch (err) {
      setError(err.response?.data?.message || "Unable to verify the code right now.");
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    if (!email) {
      setError("Enter the email address you registered with.");
      return;
    }

    setResending(true);
    setError("");
    setNotice("");

    try {
      const res = await userApi.post("/resend-verification", { email });
      if (res.data.email_sent === false) {
        setDeliveryFailed(true);
        sessionStorage.setItem("avefit_verification_email_delivery_failed", "true");
        setError(res.data.message || "We could not send a new code right now. Please try again later.");
      } else {
        setDeliveryFailed(false);
        sessionStorage.removeItem("avefit_verification_email_delivery_failed");
        setNotice(res.data.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || "Unable to send a new code right now.");
    } finally {
      setResending(false);
    }
  };

  return (
    <OnboardingShell step={1} width="max-w-lg" showStepper={false}>
      <div className="text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-orange-500/30 bg-orange-500/10">
          <Clock3 size={30} className="text-orange-500" />
        </div>

        <h1 className="mt-5 text-2xl font-bold text-slate-900 dark:text-white">
          {verified ? "Your email is verified" : "Verify your email to continue"}
        </h1>
        <p className="mt-3 leading-relaxed text-slate-500 dark:text-slate-400">
          {verified
            ? "Thank you for registering with AveFit. Your account is waiting for gym approval."
            : "Thank you for registering with AveFit. Enter the six-digit code sent to your email address so the gym administrator can review your registration."}
        </p>

        <div className="mt-6 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-white/10 dark:bg-white/5">
          <MailCheck size={20} className="shrink-0 text-orange-500" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">Step 1 of 2 &mdash; Confirm your email</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {verified ? "Your email address is confirmed." : "Enter your one-time code below. If you cannot find it, request a new code."}
            </p>
          </div>
        </div>

        <div className="mt-3 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left dark:border-white/10 dark:bg-white/5">
          <CheckCircle2 size={20} className="shrink-0 text-orange-500" />
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">Step 2 of 2 &mdash; Wait for approval</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Please wait 1&ndash;3 working days. You will be able to log in and complete your
              AveFit setup once an administrator has approved your account.
            </p>
          </div>
        </div>

        {notice && <div className="mt-5"><Alert tone="info">{notice}</Alert></div>}
        {deliveryFailed && !error && (
          <div className="mt-5">
            <Alert tone="warning">
              We could not send your verification code. Use “Send a new code” below to try again, and check your spam folder.
            </Alert>
          </div>
        )}
        {error && <div className="mt-3"><Alert tone="error">{error}</Alert></div>}

        {!verified && <form
          className="mt-6 space-y-4 text-left"
          onSubmit={handleVerify}
        >
          <Field
            label="Email address"
            htmlFor="pending-email"
            type="email"
            name="email"
            autoComplete="email"
            placeholder="your@email.com"
            value={email}
            readOnly
            aria-describedby="pending-email-note"
            className="cursor-not-allowed bg-slate-100 text-slate-600 dark:bg-white/[0.03] dark:text-slate-400"
          />
          <p id="pending-email-note" className="-mt-2 text-xs text-slate-500">
            This is the email address used to register your account.
          </p>

          <Field
            label="Six-digit verification code"
            htmlFor="pending-verification-code"
            type="text"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          />

          <PrimaryButton
            type="submit"
            loading={verifying}
            loadingText="Verifying…"
            className="font-semibold"
          >
            Confirm code
          </PrimaryButton>
          <button type="button" onClick={handleResend} disabled={resending} className="w-full rounded-xl border border-orange-500/30 px-4 py-2.5 text-sm font-semibold text-orange-600 transition hover:bg-orange-500/10 disabled:opacity-60">
            {resending ? "Sending…" : "Send a new code"}
          </button>
        </form>}

        <PrimaryButton
          className="mt-3"
          onClick={() => navigate("/user/login", { replace: true })}
        >
          Return to login
        </PrimaryButton>
      </div>

      <p className="mt-6 text-center text-sm text-slate-500">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="rounded font-medium transition hover:text-orange-600"
        >
          &larr; Back to homepage
        </button>
      </p>
    </OnboardingShell>
  );
}
