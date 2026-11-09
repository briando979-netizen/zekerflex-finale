"use client";

import { useCallback, useEffect, useState } from "react";
import { useFT } from "@/components/i18n/useFT";
import { WACHTRIJ_GEBEURTENIS, laadTikken, opVolgorde, sleutelVoor, wisTikken, type BewaardeTik } from "@/lib/checkin/wachtrij";
import { verstuurBewaard, weigerTekst, type Uitslag, type WachtrijMelding } from "@/lib/checkin/verzenden";

// ---------------------------------------------------------------------------
// Overal in de werker-app (app/dashboard/layout.tsx): verstuurt de in- en
// uitchecks die zonder bereik op dit toestel zijn bewaard (lib/checkin) zodra
// het weer kan — bij openen, bij de online-gebeurtenis, als de app weer in
// beeld komt, en elke 30 s zolang er iets wacht (in een kelder komt niet
// altijd een online-gebeurtenis). Toont wat wacht en wat is aangekomen of
// geweigerd. Bewaarde tikken van een ander account op dit toestel gaan weg:
// die persoon is uitgelogd.
// ---------------------------------------------------------------------------

const OPNIEUW_MS = 30_000;

export function BewaardeTikken({ userId }: { userId: string }) {
  const ft = useFT();
  const c = ft.checkin;
  const [wacht, setWacht] = useState<BewaardeTik[]>([]);
  const [uitslagen, setUitslagen] = useState<Uitslag[]>([]);
  const [bezig, setBezig] = useState(false);
  const tijd = (s: string) => new Date(s).toLocaleTimeString(ft.intl, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

  const ververs = useCallback(() => setWacht(opVolgorde(laadTikken(userId))), [userId]);

  useEffect(() => {
    wisTikken(userId);
    ververs();
    const opMelding = (e: Event) => {
      const d = (e as CustomEvent<WachtrijMelding>).detail;
      if (!d || d.userId !== userId) return;
      ververs();
      if (d.uitslagen.length > 0) setUitslagen((vorig) => [...vorig, ...d.uitslagen].slice(-4));
    };
    const opOnline = () => {
      void verstuurBewaard(userId);
    };
    const opZicht = () => {
      if (document.visibilityState === "visible") void verstuurBewaard(userId);
    };
    // een ander tabblad bewaarde of verstuurde iets
    const opOpslag = (e: StorageEvent) => {
      if (e.key === null || e.key === sleutelVoor(userId)) ververs();
    };
    window.addEventListener(WACHTRIJ_GEBEURTENIS, opMelding);
    window.addEventListener("online", opOnline);
    window.addEventListener("storage", opOpslag);
    document.addEventListener("visibilitychange", opZicht);
    // pas na het aanmelden van de luisteraars: de uitslag mag niet langs ons heen gaan
    void verstuurBewaard(userId);
    return () => {
      window.removeEventListener(WACHTRIJ_GEBEURTENIS, opMelding);
      window.removeEventListener("online", opOnline);
      window.removeEventListener("storage", opOpslag);
      document.removeEventListener("visibilitychange", opZicht);
    };
  }, [userId, ververs]);

  useEffect(() => {
    if (wacht.length === 0) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void verstuurBewaard(userId);
    }, OPNIEUW_MS);
    return () => clearInterval(id);
  }, [wacht.length, userId]);

  async function nu() {
    setBezig(true);
    try {
      await verstuurBewaard(userId);
    } finally {
      ververs();
      setBezig(false);
    }
  }

  if (wacht.length === 0 && uitslagen.length === 0) return null;

  return (
    <div className="mx-auto mt-3 max-w-2xl space-y-2 px-4">
      {wacht.length > 0 && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          <span className="min-w-0 flex-1">
            <strong className="block text-ink">{c.waiting(wacht.length)}</strong>
            <span className="block text-neutralx-600">{wacht.map((t) => (t.type === "CHECK_IN" ? c.itemIn : c.itemOut)(tijd(t.tikOp))).join(" · ")}</span>
            <span className="mt-1 block text-xs text-neutralx-500">{c.waitingHint}</span>
          </span>
          <button type="button" disabled={bezig} onClick={() => void nu()} className="rounded-xl border border-hair px-4 py-2 text-sm font-semibold text-ink disabled:opacity-60">
            {c.sendNow}
          </button>
        </div>
      )}
      {uitslagen.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-hair bg-paper-soft px-4 py-3 text-sm">
          <ul className="min-w-0 flex-1 space-y-1">
            {uitslagen.map((u) => {
              const t = tijd(u.antwoord?.recordedAt ?? u.tik.tikOp);
              const inn = u.tik.type === "CHECK_IN";
              return u.uitkomst === "aangekomen" ? (
                <li key={u.tik.id} role="status" className="font-medium text-ok">
                  {(inn ? c.arrivedIn : c.arrivedOut)(t)}
                </li>
              ) : (
                <li key={u.tik.id} role="alert" className="font-medium text-crit">
                  {(inn ? c.refusedIn : c.refusedOut)(t, weigerTekst(c, u))}
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => setUitslagen([])} className="text-xs font-semibold text-neutralx-500 hover:underline">
            {c.close}
          </button>
        </div>
      )}
    </div>
  );
}
