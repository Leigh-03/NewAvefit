import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../services/api";
import { SIDEBAR_COUNTS_CHANGED_EVENT } from "../../utils/sidebarCountsEvents";

const COUNT_KEYS = ["members", "trainers", "equipment", "notifications"];
const EMPTY_COUNTS = {
  members: 0,
  trainers: 0,
  equipment: 0,
  notifications: 0,
};

export default function useAdminSidebarCounts(pathname) {
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const latestRequest = useRef(0);

  const refreshCounts = useCallback(async () => {
    if (document.visibilityState === "hidden") return;
    const requestId = latestRequest.current + 1;
    latestRequest.current = requestId;

    try {
      const response = await api.get("/admin/sidebar-counts");
      const data = response.data?.data;
      const nextCounts = {};
      for (const key of COUNT_KEYS) {
        const count = Number(data?.[key]);
        if (!Number.isInteger(count) || count < 0) {
          throw new Error(`Invalid ${key} count in admin sidebar response.`);
        }
        nextCounts[key] = count;
      }
      if (requestId === latestRequest.current) setCounts(nextCounts);
    } catch (error) {
      if (requestId === latestRequest.current) {
        console.error("Admin sidebar counts refresh failed:", error.message);
      }
    }
  }, []);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshCounts();
    };
    refreshCounts();
    window.addEventListener(SIDEBAR_COUNTS_CHANGED_EVENT, refreshCounts);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const intervalId = window.setInterval(refreshWhenVisible, 30000);
    return () => {
      window.removeEventListener(SIDEBAR_COUNTS_CHANGED_EVENT, refreshCounts);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(intervalId);
    };
  }, [pathname, refreshCounts]);

  return counts;
}
