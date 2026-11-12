import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export default function CustomSelect({
  id,
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  ariaInvalid,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState(null);
  const [menuIsDark, setMenuIsDark] = useState(false);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return undefined;
    const updateMenuPosition = () => {
      const bounds = triggerRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const gap = 6;
      const desiredHeight = Math.min(240, options.length * 40 + 16);
      const spaceBelow = window.innerHeight - bounds.bottom - gap - 8;
      const spaceAbove = bounds.top - gap - 8;
      const placeBelow = spaceBelow >= desiredHeight || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(80, Math.min(desiredHeight, placeBelow ? spaceBelow : spaceAbove));
      const width = Math.min(Math.max(bounds.width, 240), window.innerWidth - 16);
      const left = Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8));
      const hasDarkAncestor = Boolean(rootRef.current?.closest(".dark"));
      setMenuIsDark(
        hasDarkAncestor ||
        document.documentElement.classList.contains("dark") ||
        document.body.classList.contains("dark")
      );
      setMenuPosition({
        left,
        width,
        maxHeight,
        ...(placeBelow
          ? { top: bounds.bottom + gap }
          : { bottom: window.innerHeight - bounds.top + gap }),
      });
    };
    const closeOnOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    updateMenuPosition();
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, options.length]);

  return (
    <div ref={rootRef} className="relative w-full">
      <button
        id={id}
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 shadow-sm transition hover:border-orange-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-[#111] dark:text-white dark:hover:border-orange-500/60 ${className}`}
      >
        <span className="truncate font-semibold">{selectedOption?.label || value}</span>
        <ChevronDown size={17} aria-hidden="true" className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && !disabled && menuPosition && createPortal(
        <ul
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel}
          style={{ ...menuPosition, position: "fixed" }}
          className={`z-[120] space-y-1 overflow-y-auto rounded-xl border p-2 text-sm shadow-2xl ${
            menuIsDark
              ? "border-slate-700 bg-[#141414] text-slate-100 ring-1 ring-white/10"
              : "border-slate-200 bg-white text-slate-800 ring-1 ring-black/5"
          }`}
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`flex min-h-10 w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 text-left text-sm transition ${
                    option.disabled
                      ? `cursor-not-allowed opacity-50 ${menuIsDark ? "text-slate-400" : "text-slate-500"}`
                      : selected
                        ? menuIsDark
                          ? "bg-orange-500/15 font-semibold text-orange-200 ring-1 ring-inset ring-orange-500/40"
                          : "bg-orange-50 font-semibold text-orange-800 ring-1 ring-inset ring-orange-200"
                        : menuIsDark
                          ? "text-slate-100 hover:bg-white/10"
                          : "text-slate-800 hover:bg-slate-100"
                  }`}
                >
                  <span>{option.label}</span>
                  {selected && <Check size={15} aria-hidden="true" className="shrink-0 text-orange-600 dark:text-orange-400" />}
                </button>
              </li>
            );
          })}
        </ul>,
        document.body
      )}
    </div>
  );
}
