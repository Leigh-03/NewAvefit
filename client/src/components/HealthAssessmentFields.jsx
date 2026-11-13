import { HEALTH_CONDITION_OPTIONS, INJURY_OPTIONS } from "../utils/healthAssessment";
import { HeartPulse, X } from "lucide-react";
import CustomSelect from "./ui/CustomSelect";

const selectedValues = (values = []) => (
  Array.isArray(values) ? values.filter((value) => value && value !== "None") : []
);

function SelectionDropdown({ id, label, options, value, disabled, onChange }) {
  const selected = selectedValues(value);
  const hasSelection = selected.length > 0;
  const addSelection = (option) => {
    if (!option) return;
    onChange(option === "None" ? ["None"] : [...selected, option]);
  };
  const removeSelection = (option) => {
    const next = selected.filter((item) => item !== option);
    onChange(next.length ? next : ["None"]);
  };

  const selectOptions = [
    { value: "", label: hasSelection ? `Add ${label.toLowerCase()}...` : "Choose an option...", disabled: true },
    ...options.map((option) => ({
      value: option,
      label: option,
      disabled: selected.includes(option),
    })),
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.02]">
      <label htmlFor={id} className="mb-2 block text-sm font-bold text-slate-800 dark:text-slate-100">{label}</label>
      <CustomSelect
        id={id}
        value={hasSelection ? "" : "None"}
        options={selectOptions}
        onChange={addSelection}
        disabled={disabled}
        ariaLabel={label}
        className="min-h-12"
      />

      {selected.length > 0 && (
        <ul aria-label={`Selected ${label.toLowerCase()}`} className="mt-3 flex flex-wrap gap-2">
          {selected.map((option) => (
            <li key={option}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeSelection(option)}
                aria-label={`Remove ${option}`}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-orange-700 bg-orange-700 px-3 text-sm font-semibold text-white transition hover:border-orange-800 hover:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-orange-400/30 dark:bg-orange-500/15 dark:text-orange-100 dark:hover:bg-orange-500/20"
              >
                {option}
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function HealthAssessmentFields({
  injuries = ["None"],
  healthConditions = ["None"],
  injuryPainLevels = {},
  onInjuriesChange,
  onHealthConditionsChange,
  onPainLevelChange,
  disabled = false,
}) {
  const selectedInjuries = selectedValues(injuries);
  const hasInjuries = selectedInjuries.length > 0;

  return (
    <div className="space-y-5">
      <SelectionDropdown
        id="injury-pain-areas"
        label="Injury or pain areas"
        options={INJURY_OPTIONS}
        value={injuries}
        disabled={disabled}
        onChange={onInjuriesChange}
      />
      {hasInjuries && (
        <section aria-label="Pain levels by selected area" className="rounded-2xl border border-orange-200/80 bg-orange-50/60 p-4 dark:border-orange-500/20 dark:bg-orange-500/[0.04]">
          <div className="mb-3 flex items-start gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300">
              <HeartPulse size={18} aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Pain level by area</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Rate each selected area from 1 (mild) to 10 (severe).</p>
            </div>
          </div>
          <div className="space-y-2">
          {selectedInjuries.map((area) => (
            <div key={area} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#111]">
              <label htmlFor={`pain-level-${area.toLowerCase()}`} className="flex items-center gap-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-white/10 dark:text-slate-300">{area.slice(0, 1)}</span>
                {area}
              </label>
              <CustomSelect
                id={`pain-level-${area.toLowerCase()}`}
                value={injuryPainLevels?.[area] == null ? "" : String(injuryPainLevels[area])}
                options={[
                  { value: "", label: "Select level", disabled: true },
                  ...Array.from({ length: 10 }, (_, index) => {
                    const level = index + 1;
                    return { value: String(level), label: String(level) };
                  }),
                ]}
                onChange={(value) => onPainLevelChange(area, value ? Number(value) : "")}
                disabled={disabled}
                ariaLabel={`Pain level for ${area}`}
                className="min-h-10 sm:max-w-36"
              />
            </div>
          ))}
          </div>
        </section>
      )}
      <SelectionDropdown
        id="health-conditions"
        label="Health conditions"
        options={HEALTH_CONDITION_OPTIONS}
        value={healthConditions}
        disabled={disabled}
        onChange={onHealthConditionsChange}
      />
    </div>
  );
}
