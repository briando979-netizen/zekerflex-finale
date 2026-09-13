"use client";

import { useCallback, useEffect, useState } from "react";

type State = "loading" | "unsupported" | "unconfigured" | "off" | "on" | "denied" | "busy";

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      try {
        const res = await fetch("/api/me/push", { cache: "no-store" });
        const data = await res.json();
        if (cancelled) return;
        setVapidKey(data.vapidPublicKey ?? null);
        if (!data.supported) return setState("unsupported");
        if (!data.configured || !data.vapidPublicKey) return setState("unconfigured");
        if (Notification.permission === "denied") return setState("denied");
        setState(data.subscribed ? "on" : "off");
      } catch {
        if (!cancelled) setState("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setError(null);
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToBuffer(vapidKey as string),
        }));
      const json = sub.toJSON();
      const res = await fetch("/api/me/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!res.ok) throw new Error("server");
      setState("on");
    } catch (e) {
      setError("Aanzetten lukte niet. Probeer het opnieuw.");
      setState("off");
    }
  }, [vapidKey]);

  const disable = useCallback(async () => {
    setError(null);
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/me/push", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  }, []);

  if (state === "loading" || state === "unsupported") return null;

  return (
    <div className="rounded-xl border border-hair bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Pushmeldingen</p>
          <p className="mt-0.5 text-xs text-neutralx-500">
            Krijg een melding zodra er een dienst voor jou klaarstaat — ook als de app dicht is.
          </p>
        </div>
        {state === "unconfigured" ? (
          <span className="shrink-0 text-xs text-neutralx-400">Niet beschikbaar</span>
        ) : state === "denied" ? (
          <span className="shrink-0 text-xs text-warn">Geblokkeerd in je browser</span>
        ) : (
          <button
            type="button"
            onClick={state === "on" ? disable : enable}
            disabled={state === "busy"}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
              state === "on"
                ? "border border-hairstrong text-ink hover:bg-paper-soft"
                : "bg-brand-500 text-white hover:brightness-105"
            }`}
          >
            {state === "busy" ? "Bezig…" : state === "on" ? "Uitzetten" : "Aanzetten"}
          </button>
        )}
      </div>
      {state === "denied" && (
        <p className="mt-2 text-xs text-neutralx-500">
          Je hebt meldingen eerder geweigerd. Zet ze weer aan via het slotje in de adresbalk.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-crit">{error}</p>}
    </div>
  );
}
