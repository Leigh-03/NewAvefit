import AuthFrame from "./AuthFrame";
import { Brand } from "./AppShell";

const ONBOARDING_STEPS = [
  { to: "/user/assessment", label: "Assessment" },
  { to: "/user/goal", label: "Goal" },
  { to: "/user/health", label: "Health" },
  { to: "/user/availability", label: "Availability" },
  { to: "/user/coach", label: "Coach" },
  { to: "/user/confirm", label: "Confirm" },
];

function Stepper({ current }) {
  return (
    <div role="group" aria-label="Setup progress" className="mb-6">
      <ol className="flex items-center gap-1.5">
        {ONBOARDING_STEPS.map((step, i) => {
          const state = i + 1 < current ? "done" : i + 1 === current ? "current" : "todo";
          return (
            <li
              key={step.to}
              className="flex-1"
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="sr-only">
                Step {i + 1}: {step.label}
              </span>
              <span
                aria-hidden="true"
                className={`block h-1.5 rounded-full transition-colors ${
                  state === "todo"
                    ? "bg-slate-100 dark:bg-white/10"
                    : "bg-orange-500"
                }`}
              />
            </li>
          );
        })}
      </ol>
      <p className="mt-2.5 text-xs font-semibold text-slate-500">
        Step {current} of {ONBOARDING_STEPS.length} &middot; {ONBOARDING_STEPS[current - 1].label}
      </p>
    </div>
  );
}

/**
 * Frame for the six-step member setup flow. Renders the brand, a labelled
 * stepper and the card so every step looks and behaves the same.
 */
export default function OnboardingShell({ step, scroll = false, width = "max-w-md", children, showStepper = true }) {
  return (
    <AuthFrame width={width}>
      <div className="mb-6 flex flex-col items-center">
        <Brand subtitle="Member setup" />
      </div>

      {showStepper && <Stepper current={step} />}

      <div
        className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-orange-500/5 sm:p-8 dark:border-white/10 dark:bg-[#111] dark:shadow-black/40 ${
          scroll ? "max-h-[85vh] overflow-y-auto" : ""
        }`}
      >
        {children}
      </div>
    </AuthFrame>
  );
}
