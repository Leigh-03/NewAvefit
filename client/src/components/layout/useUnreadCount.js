import { useEffect, useState } from "react";
import { createNotificationsApi } from "../../services/notificationsApi";
import { SIDEBAR_COUNTS_CHANGED_EVENT } from "../../utils/sidebarCountsEvents";

/**
 * Re-fetches unread notifications on navigation and after notification changes.
 */
export default function useUnreadCount(key, audience = "admin") {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    let latestRequest = 0;
    const notificationsApi = createNotificationsApi(audience);
    const refreshCount = () => {
      if (document.visibilityState === "hidden") return;
      const requestId = ++latestRequest;
      notificationsApi.get("/unread-count")
        .then((res) => {
          const nextCount = Number(res.data.count);
          if (!Number.isInteger(nextCount) || nextCount < 0) {
            throw new Error("Invalid unread notification count.");
          }
          if (active && requestId === latestRequest) setCount(nextCount);
        })
        .catch((err) => {
          if (active && requestId === latestRequest) {
            console.error("Unread notification count fetch failed:", err.message);
          }
        });
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshCount();
    };
    refreshCount();
    window.addEventListener(SIDEBAR_COUNTS_CHANGED_EVENT, refreshCount);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    const intervalId = window.setInterval(refreshWhenVisible, 30000);
    return () => {
      active = false;
      window.removeEventListener(SIDEBAR_COUNTS_CHANGED_EVENT, refreshCount);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.clearInterval(intervalId);
    };
  }, [key, audience]);

  return count;
}
