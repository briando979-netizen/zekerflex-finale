"use client";

import { useCallback, useEffect, useState } from "react";
import { bannerWeerTonen, PUSH_BANNER_NL, type PushBannerTexts, type PushStapTexts } from "@/components/app/push-banner-texts";
import { useInIosApp } from "@/components/app/useInIosApp";
import { PUSH_KAART_NL, type PushKaartTeksten } from "@/lib/account/teksten";
import { vulIn } from "@/lib/i18n/vul-in";
import { volgendeStap, ZELF_UIT_KEY } from "@/lib/notifications/push/aanmelding";

type State = "loading" | "unsupported" | "ios-install" | "unconfigured" | "off" | "on" | "denied" | "busy";

const DISMISS_KEY = "zf-push-banner-dismissed";

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

/** iPhone/iPad Safari only offers Web Push to a site added to the home screen (iOS 16.4+). */
function needsIosInstall(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

const sameKey = (raw: ArrayBuffer | null, want: Uint8Array) => {
  const have = raw ? new Uint8Array(raw) : null;
  return !!have && have.length === want.length && have.every((b, i) => b === want[i]);
};

let healing: Promise<boolean> | null = null;

/** Heb je meldingen op dit apparaat zelf uitgezet? Onleesbare opslag telt als ja: dan niet stil aanmelden. */
function zelfUitgezet(): boolean {
  try {
    return window.localStorage.getItem(ZELF_UIT_KEY) === "1";
  } catch {
    return true;
  }
}

function onthoudZelfUit(uit: boolean) {
  try {
    if (uit) window.localStorage.setItem(ZELF_UIT_KEY, "1");
    else window.localStorage.removeItem(ZELF_UIT_KEY);
  } catch {
    /* niet onthouden — dan meldt dit apparaat zich niet stil opnieuw aan */
  }
}

/** De registratie van de service worker; zonder (nog) geen actieve worker na 10 s: null. */
async function werker(): Promise<ServiceWorkerRegistration | null> {
  const wacht = new Promise<null>((klaar) => window.setTimeout(() => klaar(null), 10_000));
  return Promise.race([navigator.serviceWorker.ready, wacht]);
}

/** Geeft de aanmelding aan de server. uitgezet = de pushdienst had hem eerder al weggegooid. */
async function doorgeven(sub: PushSubscription): Promise<{ ok: boolean; uitgezet: boolean }> {
  const json = sub.toJSON();
  const res = await fetch("/api/me/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
  const d = (await res.json().catch(() => ({}))) as { uitgezet?: boolean };
  return { ok: res.ok, uitgezet: d.uitgezet === true };
}

/** Oude aanmelding weg (bij de server en in de browser), een nieuwe met de huidige sleutel. */
async function vervang(reg: ServiceWorkerRegistration, oud: PushSubscription, key: ArrayBuffer): Promise<PushSubscription> {
  await fetch("/api/me/push", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: oud.endpoint }) }).catch(() => undefined);
  await oud.unsubscribe().catch(() => undefined);
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

/**
 * Houdt de pushmelding van dit apparaat werkend, stil en zonder vraag (de toestemming is er al;
 * lib/notifications/push/aanmelding.ts). Een aanmelding met een ANDERE VAPID-sleutel wordt geruild,
 * een kwijtgeraakte opnieuw gemaakt, en een goede opnieuw doorgegeven: had de pushdienst die al
 * weggegooid (de server zette hem uit), dan komt er een nieuwe. Eén keer per pagina.
 * true = dit apparaat staat aangemeld.
 */
export function healPushSubscription(vapidKey: string): Promise<boolean> {
  healing ??= (async () => {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return false;
      if (Notification.permission !== "granted") return false;
      const reg = await werker();
      if (!reg) return false;
      const key = urlBase64ToBuffer(vapidKey);
      const existing = await reg.pushManager.getSubscription();
      const stap = volgendeStap({
        toestemming: Notification.permission,
        heeftAanmelding: Boolean(existing),
        zelfdeSleutel: Boolean(existing) && sameKey(existing?.options.applicationServerKey ?? null, new Uint8Array(key)),
        zelfUitgezet: zelfUitgezet(),
      });
      if (stap === "niets") return false;
      let sub =
        stap === "aanmelden" || !existing
          ? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
          : stap === "vervangen"
            ? await vervang(reg, existing, key)
            : existing;
      let r = await doorgeven(sub);
      // de pushdienst kende deze aanmelding niet meer: een nieuwe vragen (één keer)
      if (r.ok && r.uitgezet && stap === "doorgeven") {
        sub = await vervang(reg, sub, key);
        r = await doorgeven(sub);
      }
      return r.ok;
    } catch {
      return false;
    }
  })();
  return healing;
}

/**
 * Meldingen aanzetten op dit apparaat (de knop in PushToggle en in Admin → Systeem): toestemming
 * vragen, aanmelden met de huidige sleutel (een oude ruilen) en aan de server geven.
 * Gooit bij een fout; "geweigerd"/"uit" als de browser geen toestemming gaf.
 */
export async function meldingenAanzetten(vapidKey: string): Promise<"aan" | "geweigerd" | "uit"> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "geweigerd" : "uit";
  const reg = await navigator.serviceWorker.ready;
  const appServerKey = urlBase64ToBuffer(vapidKey);
  let existing = await reg.pushManager.getSubscription();
  // Een bestaande subscription van een ANDERE (vorige) VAPID-sleutel kan
  // onze meldingen niet ontvangen — na een sleutelwissel opruimen en
  // opnieuw aanmelden met de huidige sleutel.
  if (existing && !sameKey(existing.options.applicationServerKey, new Uint8Array(appServerKey))) {
    await existing.unsubscribe().catch(() => undefined);
    existing = null;
  }
  let sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey }));
  let r = await doorgeven(sub);
  // de server had deze aanmelding uitgezet (de pushdienst kende hem niet meer): een nieuwe
  if (r.ok && r.uitgezet && existing) {
    sub = await vervang(reg, sub, appServerKey);
    r = await doorgeven(sub);
  }
  if (!r.ok) throw new Error("server");
  onthoudZelfUit(false);
  return "aan";
}

/** Onzichtbaar: houdt de pushmelding van dit apparaat op de huidige sleutel, voor schermen zonder PushToggle (zoals het beheer). */
export function PushSelfHeal() {
  useEffect(() => {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    fetch("/api/me/push", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { configured?: boolean; vapidPublicKey?: string | null } | null) => {
        if (d?.configured && d.vapidPublicKey) void healPushSubscription(d.vapidPublicKey);
      })
      .catch(() => undefined);
  }, []);
  return null;
}

/** Draait dit in de geïnstalleerde app (Play Store-TWA of op het beginscherm)? */
function inStandaloneApp(): boolean {
  try {
    return (
      /(?:^|;\s*)zf_app=1(?:;|$)/.test(document.cookie) ||
      window.matchMedia("(display-mode: standalone)").matches
    );
  } catch {
    return false;
  }
}

/**
 * texts: alleen voor de banner; de werker-app geeft eigen teksten in vijf talen mee.
 * variant "stap": de grote knop in "Maak een goede eerste indruk", met stapTexts (vijf talen) en
 * onAan zodra meldingen aanstaan.
 */
export function PushToggle({
  variant = "card",
  texts = PUSH_BANNER_NL,
  stapTexts,
  cardTexts = PUSH_KAART_NL,
  onAan,
}: {
  variant?: "card" | "banner" | "stap";
  texts?: PushBannerTexts;
  stapTexts?: PushStapTexts;
  /** de kaart (variant card) in de taal van de werker; zonder: Nederlands (werkgever, chat-instellingen) */
  cardTexts?: PushKaartTeksten;
  onAan?: () => void;
}) {
  const k = cardTexts;
  const [state, setState] = useState<State>("loading");
  const [vapidKey, setVapidKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [app, setApp] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const ios = useInIosApp();

  useEffect(() => {
    let cancelled = false;
    setApp(inStandaloneApp());
    try {
      setDismissed(!bannerWeerTonen(window.localStorage.getItem(DISMISS_KEY), Date.now()));
    } catch {
      /* storage blocked — show the banner */
    }
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState(needsIosInstall() ? "ios-install" : "unsupported");
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
        // an old subscription (another key) is swapped quietly when permission is already there
        const healed = await healPushSubscription(data.vapidPublicKey);
        if (cancelled) return;
        setState(healed || data.subscribed ? "on" : "off");
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
      if (!vapidKey) throw new Error("geen sleutel");
      const uitslag = await meldingenAanzetten(vapidKey);
      if (uitslag !== "aan") {
        setState(uitslag === "geweigerd" ? "denied" : "off");
        return;
      }
      setState("on");
      onAan?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : k.onbekend;
      setError(vulIn(k.aanzettenMislukt, { melding: msg }));
      setState("off");
    }
  }, [vapidKey, onAan, k]);

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
      // zelf uitgezet: dit apparaat meldt zich dan niet stil opnieuw aan (healPushSubscription)
      onthoudZelfUit(true);
      setState("off");
    } catch {
      setState("on");
    }
  }, []);

  const sendTest = useCallback(async () => {
    setTestMsg(k.testVersturen);
    try {
      const r = await fetch("/api/me/push/test", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      setTestMsg(
        r.ok
          ? d.delivered > 0
            ? vulIn(k.testVerstuurd, { n: d.delivered })
            : k.testGeen
          : k.testMislukt,
      );
    } catch {
      setTestMsg(k.testMislukt);
    }
  }, [k]);

  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now())); // na 14 dagen komt hij terug
    } catch {
      /* not remembered — fine */
    }
  };

  // De iPhone-app (ios-app/) vraagt zelf om toestemming en ontvangt meldingen via Apple (APNs,
  // lib/notifications/push/apns.ts). Web Push werkt in een WKWebView niet: hier dus niets, ook geen
  // "zet op je beginscherm" (anders een knop die niets doet, reden voor afkeur door Apple).
  if (ios !== false) return null;

  if (variant === "stap" && stapTexts) {
    const t = stapTexts;
    if (state === "loading") return <p className="text-sm text-neutralx-500" aria-busy="true">…</p>;
    if (state === "on") {
      return (
        <p role="status" className="rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-600">
          ✓ {t.ok}
        </p>
      );
    }
    if (state === "ios-install") return <p className="rounded-xl border border-hair bg-white px-4 py-3 text-sm leading-relaxed text-neutralx-700">{t.ios}</p>;
    if (state === "unsupported" || state === "unconfigured") return <p className="rounded-xl border border-hair bg-white px-4 py-3 text-sm leading-relaxed text-neutralx-700">{t.nietMogelijk}</p>;
    if (state === "denied") return <p className="rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm leading-relaxed text-neutralx-700">{app ? t.geweigerdApp : t.geweigerd}</p>;
    return (
      <div>
        <button type="button" onClick={enable} disabled={state === "busy"} className="btn-primary block w-full py-3.5 text-center text-base disabled:opacity-60">
          {state === "busy" ? t.bezig : t.knop}
        </button>
        {error && (
          <p role="alert" className="mt-2 text-sm text-crit">
            {t.fout}
          </p>
        )}
      </div>
    );
  }

  if (variant === "banner") {
    if (dismissed || !(state === "off" || state === "busy" || state === "ios-install")) return null;
    return (
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand-100 bg-brand-50 px-4 py-2.5 text-sm">
        <span aria-hidden className="text-lg">🔔</span>
        {/* basis-60: op een smal scherm gaat de knop naar een eigen regel, anders wordt de tekst een smalle kolom */}
        <span className="min-w-0 flex-1 basis-60 text-neutralx-700">
          {state === "ios-install" ? texts.ios : texts.aanzetten}
          {error && <span role="alert" className="ml-1 text-crit">{error}</span>}
        </span>
        {state !== "ios-install" && (
          <button
            type="button"
            onClick={enable}
            disabled={state === "busy"}
            className="rounded-lg bg-brand-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {state === "busy" ? texts.bezig : texts.knop}
          </button>
        )}
        <button type="button" onClick={dismiss} className="text-neutralx-400 hover:text-ink" aria-label={texts.nietNu}>
          ✕
        </button>
      </div>
    );
  }

  if (state === "loading" || state === "unsupported") return null;

  return (
    <div className="rounded-xl border border-hair bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{k.titel}</p>
          <p className="mt-0.5 text-xs text-neutralx-500">
            {state === "ios-install"
              ? k.uitlegIos
              : k.uitleg}
          </p>
        </div>
        {state === "ios-install" ? null : state === "unconfigured" ? (
          <span className="shrink-0 text-xs text-neutralx-400">{k.nietBeschikbaar}</span>
        ) : state === "denied" ? (
          <span className="shrink-0 text-xs text-warn">{k.geblokkeerd}</span>
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
            {state === "busy" ? k.bezig : state === "on" ? k.uitzetten : k.aanzetten}
          </button>
        )}
      </div>
      {state === "on" && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-hair pt-3">
          <button
            type="button"
            onClick={sendTest}
            className="rounded-lg border border-hairstrong px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper-soft"
          >
            {k.testKnop}
          </button>
          {testMsg && <span className="text-xs text-neutralx-500">{testMsg}</span>}
        </div>
      )}
      {state === "denied" && (
        <p className="mt-2 text-xs text-neutralx-500">
          {app
            ? k.geweigerdApp
            : k.geweigerdBrowser}
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-crit">{error}</p>}
    </div>
  );
}
