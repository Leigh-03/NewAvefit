import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Dumbbell } from "lucide-react";

export default function ProgramPicker({ value, options, placeholder, disabled, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3.5 text-left text-sm text-slate-900 shadow-sm transition hover:border-orange-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/60 disabled:cursor-not-allowed disabled:opacity-55 dark:border-slate-700 dark:bg-[#171717] dark:text-white dark:hover:border-orange-500/60"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Dumbbell size={16} aria-hidden="true" className="shrink-0 text-orange-500" />
          <span className={value ? "truncate font-semibold" : "truncate text-slate-500 dark:text-slate-400"}>
            {value || placeholder}
          </span>
        </span>
        <ChevronDown size={18} aria-hidden="true" className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && !disabled && (
        <ul role="listbox" aria-label={ariaLabel} className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-[95] space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-2xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-[#141414] dark:ring-white/10">
          {options.length ? options.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={(event) => {
                    event.stopPropagation();
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm transition ${
                    selected
                      ? "bg-orange-50 font-semibold text-orange-800 ring-1 ring-inset ring-orange-200 dark:bg-orange-500/10 dark:text-orange-200 dark:ring-orange-500/25"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/[0.06]"
                  }`}
                >
                  <span>{option.label}</span>
                  {selected && <Check size={16} aria-hidden="true" className="text-orange-600 dark:text-orange-400" />}
                </button>
              </li>
            );
          }) : (
            <li className="px-3 py-3 text-sm text-slate-500">{placeholder}</li>
          )}
        </ul>
      )}
    </div>
  );
}
