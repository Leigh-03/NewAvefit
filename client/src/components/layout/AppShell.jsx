import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { LogOut, Menu, Search, X } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Brand block — shared by the sidebar, the drawer and the mobile bar */
/* ------------------------------------------------------------------ */
export function Brand({ subtitle, onNavigate }) {
  return (
    <Link
      to="/"
      onClick={onNavigate}
      className="flex items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-500"
    >
      <span className="ave-logo grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg font-black">
        A
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-black leading-none tracking-tight text-slate-900 dark:text-white">
          Ave<span className="text-orange-500">Fit</span>
        </span>
        <span className="ave-brand-subtitle mt-1 block truncate text-[10px] font-semibold uppercase tracking-[0.14em]">
          {subtitle}
        </span>
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation list                                                     */
/* ------------------------------------------------------------------ */
function NavList({ items, pathname, onNavigate, className = "" }) {
  return (
    <ul className={`space-y-1 ${className}`}>
      {items.map((item) => {
        const isActive = pathname === item.to;
        const Icon = item.icon;
        return (
          <li key={item.to}>
            <Link
              to={item.to}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={`ave-nav-item flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors duration-200 ${
                isActive ? "active" : ""
              }`}
            >
              {Icon ? <Icon size={19} strokeWidth={2} /> : null}
              <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
              {item.badge > 0 && (
                <span className="min-w-[1.4rem] rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-white">
                  {item.badge > 9 ? "9+" : item.badge}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Sidebar contents (reused by the desktop rail and the mobile drawer) */
/* ------------------------------------------------------------------ */
function SidebarBody({ nav, pathname, subtitle, user, onLogout, onNavigate, onClose }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-inherit px-5 py-4">
        <Brand subtitle={subtitle} onNavigate={onNavigate} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        )}
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
        <NavList items={nav} pathname={pathname} onNavigate={onNavigate} />
      </nav>

      <div className="shrink-0 border-t border-inherit p-3">
        {user && (
          <div className="mb-2 flex items-center gap-3 rounded-xl px-2 py-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-orange-100 text-xs font-bold text-orange-600 dark:bg-orange-500/15 dark:text-orange-400">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                user.initials
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">
                {user.name}
              </span>
              <span className="block truncate text-xs text-slate-500">{user.meta}</span>
            </span>
          </div>
        )}

        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            <LogOut size={18} />
            Log out
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App shell                                                           */
/* ------------------------------------------------------------------ */
export default function AppShell({
  nav = [],
  subtitle = "",
  user = null,
  onLogout = null,
  search = false,
  searchPlaceholder = "Search…",
  actions = null,
  topbarLeft = null,
  bottomNav = false,
  contentClassName = "p-4 sm:p-6 lg:p-8",
  contentWidth = "max-w-[1600px]",
  portalClassName = "",
  children,
}) {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Lock background scroll + support Escape while the drawer is open.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  return (
    <div className={`ave-portal-shell flex min-h-dvh w-full ${portalClassName}`}>
      {/* Desktop rail */}
      <aside className="ave-sidebar sticky top-0 hidden h-dvh w-[var(--ave-sidebar-w)] shrink-0 border-r lg:block">
        <SidebarBody
          nav={nav}
          pathname={location.pathname}
          subtitle={subtitle}
          user={user}
          onLogout={onLogout}
        />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="ave-scrim absolute inset-0 h-full w-full cursor-default"
          />
          <aside className="ave-sidebar absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] flex-col border-r shadow-2xl">
            <SidebarBody
              nav={nav}
              pathname={location.pathname}
              subtitle={subtitle}
              user={user}
              onLogout={onLogout}
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="ave-topbar sticky top-0 z-40 flex h-16 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-6 lg:h-[var(--ave-topbar-h)] lg:px-8">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white lg:hidden"
          >
            <Menu size={20} />
          </button>

          <div className="min-w-0 flex-1">
            {topbarLeft ?? (
              <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                {subtitle}
              </span>
            )}
          </div>

          {search && (
            <label className="ave-search hidden h-10 w-full max-w-xs items-center gap-2 rounded-xl border px-3 md:flex xl:max-w-sm">
              <Search size={17} className="shrink-0 text-slate-400" />
              <span className="sr-only">{searchPlaceholder}</span>
              <input
                type="search"
                placeholder={searchPlaceholder}
                className="w-full border-0 bg-transparent p-0 text-sm outline-none placeholder:text-slate-500 focus:ring-0"
              />
            </label>
          )}

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {actions}
          </div>
        </header>

        {/* Page content */}
        <main className={`portal-content min-w-0 flex-1 ${bottomNav ? "pb-16 lg:pb-0" : ""}`}>
          <div className={`mx-auto w-full min-w-0 ${contentWidth} ${contentClassName}`}>{children}</div>
        </main>
      </div>

      {/* Mobile bottom tabs */}
      {bottomNav && (
        <nav
          aria-label="Main"
          className="ave-mobile-nav fixed inset-x-0 bottom-0 z-50 flex items-stretch justify-around border-t px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {nav.map((item) => {
            const isActive = location.pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-[10px] font-semibold transition-colors ${
                  isActive
                    ? "text-orange-500"
                    : "text-slate-500 hover:text-orange-500 dark:text-slate-400"
                }`}
              >
                {Icon ? <Icon size={20} strokeWidth={isActive ? 2.4 : 2} /> : null}
                <span className="truncate">{item.label}</span>
                <span
                  className={`h-0.5 w-4 rounded-full transition-colors ${
                    isActive ? "bg-orange-500" : "bg-transparent"
                  }`}
                />
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
