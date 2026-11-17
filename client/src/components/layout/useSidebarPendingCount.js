import { useEffect, useState } from "react";
import { SIDEBAR_COUNTS_CHANGED_EVENT } from "../../utils/sidebarCountsEvents";

export default function useSidebarPendingCount(apiClient, endpoint, countKey, pathname, label) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    let latestRequest = 0;
    const refreshCount = async () => {
      if (document.visibilityState === "hidden") return;
      const requestId = ++latestRequest;
      try {
        const response = await apiClient.get(endpoint);
        const nextCount = Number(response.data?.data?.[countKey]);
        if (!Number.isInteger(nextCount) || nextCount < 0) {
          throw new Error(`Invalid ${countKey} count in sidebar response.`);
        }
        if (active && requestId === latestRequest) setCount(nextCount);
      } catch (error) {
        if (active && requestId === latestRequest) {
          console.error(`${label} sidebar count refresh failed:`, error.message);
        }
      }
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
  }, [apiClient, countKey, endpoint, label, pathname]);

  return count;
}
