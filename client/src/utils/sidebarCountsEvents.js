export const SIDEBAR_COUNTS_CHANGED_EVENT = "avefit:sidebar-counts-changed";

export function notifySidebarCountsChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SIDEBAR_COUNTS_CHANGED_EVENT));
  }
}
