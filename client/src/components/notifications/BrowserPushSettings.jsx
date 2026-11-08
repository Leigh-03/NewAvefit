import { useEffect, useMemo, useState } from "react";
import { BellRing } from "lucide-react";
import { createNotificationsApi, getWebPushPublicKey } from "../../services/notificationsApi";

const base64ToUint8Array = (value) => {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const decoded = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
};

export default function BrowserPushSettings({ audience }) {
  const notificationsApi = useMemo(() => createNotificationsApi(audience), [audience]);
  const [state, setState] = useState("checking");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const supported =
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window;

  useEffect(() => {
    let active = true;
    const syncSubscription = async () => {
      if (!supported) {
        setState("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (!active) return;
        if (subscription && Notification.permission === "granted") {
          await notificationsApi.post("/subscription", subscription.toJSON());
          if (active) setState("enabled");
        } else {
          setState("disabled");
        }
      } catch (err) {
        if (!active) return;
        setError(err.response?.data?.message || err.message || "Unable to check browser notification settings.");
        setState("error");
      }
    };
    syncSubscription();
    return () => { active = false; };
  }, [notificationsApi, supported]);

  const enable = async () => {
    setBusy(true);
    setError("");
    try {
      if (!supported) {
        setState("unsupported");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "disabled");
        return;
      }
      const { data } = await getWebPushPublicKey();
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(data.publicKey),
      });
      await notificationsApi.post("/subscription", subscription.toJSON());
      setState("enabled");
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Unable to enable browser notifications.");
      setState("error");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError("");
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await notificationsApi.delete("/subscription", { data: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
      }
      setState("disabled");
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Unable to disable browser notifications.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#111]">
      <div className="flex items-start gap-3">
        <BellRing size={19} className="mt-0.5 text-orange-500" />
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Browser push notifications</p>
          <p className="mt-1 text-xs text-slate-500">
            {state === "enabled" ? "Enabled on this browser." :
              state === "denied" ? "Permission is blocked. Change it in your browser site settings." :
                state === "unsupported" ? "This browser does not support push notifications." :
                  state === "checking" ? "Checking this browser…" :
                    state === "error" ? "Browser push is unavailable until server setup is complete. In-app notifications still work." :
                      "Get alerts even when AveFit is not open."}
          </p>
          {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </div>
      {(state === "enabled" || state === "disabled" || state === "error") && (
        <button
          type="button"
          onClick={state === "enabled" ? disable : enable}
          disabled={busy}
          className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {busy ? "Saving…" : state === "enabled" ? "Disable" : "Enable"}
        </button>
      )}
    </section>
  );
}
