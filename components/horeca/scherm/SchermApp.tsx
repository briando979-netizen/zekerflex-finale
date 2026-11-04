"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SCHERMEN, type SchermRol } from "@/lib/horeca/schermen";
import { amsterdamClock } from "@/lib/time/amsterdam";
import { useLive, useNu } from "@/components/horeca/live/useLive";
import type { SchermData } from "@/components/horeca/live/types";
import { bewaarGeluid, geluidKlaarzetten, geluidVoorkeur, houdSchermAan, wisselVolledigScherm } from "@/components/horeca/scherm/apparaat";
import type { SchermDoe, SchermProps } from "@/components/horeca/scherm/ui";
import { KeukenScherm } from "@/components/horeca/scherm/KeukenScherm";
import { UitgifteScherm } from "@/components/horeca/scherm/UitgifteScherm";
import { BedieningApp } from "@/components/horeca/scherm/BedieningApp";
import { OntvangstScherm } from "@/components/horeca/scherm/OntvangstScherm";
import { AfhaalScherm, OverzichtScherm } from "@/components/horeca/scherm/TvSchermen";

// ---------------------------------------------------------------------------
// De schil om elk scherm: kop met zaak, scherm, klok en verbinding, knoppen
// voor geluid en volledig scherm, het scherm blijft aan (Wake Lock), en een
// melding onderin bij een fout of een gelukte actie (met "Ongedaan maken"
// waar dat kan). De gegevens verversen vanzelf (lib/horeca/schermen.ts).
// ---------------------------------------------------------------------------

const API = "/api/horeca/scherm";
const MET_GELUID: SchermRol[] = ["keuken", "bar", "uitgifte", "bediening", "afhaal"];

interface Toast {
  tekst: string;
  fout: boolean;
  terug?: () => void;
}

export function SchermApp({ rol, zaakNaam, apparaatNaam }: { rol: SchermRol; zaakNaam: string; apparaatNaam: string | null }) {
  const s = SCHERMEN[rol];
  const live = useLive<SchermData>(`${API}?rol=${rol}`, s.verversSec);
  const nu = useNu(rol === "afhaal" || rol === "overzicht" ? 30 : 10);
  const [gemount, setGemount] = useState(false);
  const [geluid, setGeluid] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => setGemount(true), []);
  useEffect(() => houdSchermAan(), []);

  // geluid mag pas na een tik (regel van de browser); de voorkeur onthoudt dit apparaat
  useEffect(() => {
    if (!MET_GELUID.includes(rol) || !geluidVoorkeur()) return;
    const zet = () => setGeluid(geluidKlaarzetten());
    window.addEventListener("pointerdown", zet, { once: true });
    return () => window.removeEventListener("pointerdown", zet);
  }, [rol]);

  const meld = useCallback((t: Toast) => {
    window.clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = window.setTimeout(() => setToast(null), t.terug ? 7000 : 4500);
  }, []);

  const doe: SchermDoe = useCallback(
    async (actie, ok, terug) => {
      try {
        const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rol, ...actie }) });
        const body = (await res.json().catch(() => null)) as (SchermData & { error?: { message?: string } }) | null;
        if (!res.ok || !body) throw new Error(body?.error?.message ?? "Dat lukte niet. Probeer het opnieuw.");
        live.setData(body);
        if (ok) meld({ tekst: ok, fout: false, ...(terug ? { terug } : {}) });
        return true;
      } catch (e) {
        meld({ tekst: e instanceof Error ? e.message : "Geen verbinding. Probeer het opnieuw.", fout: true });
        return false;
      }
    },
    [rol, live, meld],
  );

  function wisselGeluid() {
    const aan = !geluid;
    bewaarGeluid(aan);
    setGeluid(aan ? geluidKlaarzetten() : false);
  }

  const props: SchermProps | null = live.data ? { data: live.data, doe, nu, geluid } : null;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-[#0B0F0D]/95 px-3 py-2 backdrop-blur sm:px-5" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-[#86EFAC]">{zaakNaam}</p>
          <h1 className="truncate font-display text-lg font-bold leading-tight text-white sm:text-xl">
            {s.naam}
            {apparaatNaam && <span className="ml-2 text-sm font-semibold text-[#9BA8A1]">· {apparaatNaam}</span>}
          </h1>
        </div>
        <span className="flex items-center gap-2 text-sm text-[#B8C4BD]" role="status">
          <span className={`h-2.5 w-2.5 rounded-full ${live.verbonden ? "bg-[#22C55E]" : "animate-pulse bg-[#EF4444]"}`} aria-hidden />
          <span className={live.verbonden ? "sr-only" : "font-semibold text-[#FCA5A5]"}>{live.verbonden ? "Verbonden" : "Geen verbinding"}</span>
        </span>
        {gemount && <span className="hidden font-display text-xl font-bold tabular-nums text-white sm:block">{amsterdamClock(nu)}</span>}
        {MET_GELUID.includes(rol) && (
          <button type="button" onClick={wisselGeluid} aria-pressed={geluid} className={`rounded-full px-3 py-2 text-sm font-semibold ring-1 ${geluid ? "bg-white/10 text-white ring-white/30" : "text-[#9BA8A1] ring-white/15"}`}>
            <span aria-hidden>{geluid ? "🔔" : "🔕"}</span>
            <span className="sr-only sm:not-sr-only sm:ml-1">{geluid ? "Geluid aan" : "Geluid uit"}</span>
          </button>
        )}
        <button type="button" onClick={wisselVolledigScherm} className="hidden rounded-full px-3 py-2 text-sm font-semibold text-[#B8C4BD] ring-1 ring-white/15 hover:text-white md:block">
          Volledig scherm
        </button>
        <Link href="/scherm?kies" className="rounded-full px-3 py-2 text-sm font-semibold text-[#B8C4BD] ring-1 ring-white/15 hover:text-white">
          Menu
        </Link>
      </header>

      <main className="flex-1">
        {!props ? (
          <div className="grid min-h-[60vh] place-items-center p-6 text-center">
            {live.fout ? (
              <div role="alert">
                <p className="text-lg font-semibold text-[#FECACA]">{live.fout}</p>
                <Link href="/scherm" className="mt-4 inline-block rounded-full bg-white px-5 py-3 font-semibold text-[#0B0F0D]">
                  Opnieuw koppelen
                </Link>
              </div>
            ) : (
              <p className="text-[#9BA8A1]">Laden…</p>
            )}
          </div>
        ) : rol === "keuken" || rol === "bar" ? (
          <KeukenScherm {...props} station={rol} />
        ) : rol === "uitgifte" ? (
          <UitgifteScherm {...props} />
        ) : rol === "bediening" ? (
          <BedieningApp {...props} />
        ) : rol === "ontvangst" ? (
          <OntvangstScherm {...props} />
        ) : rol === "afhaal" ? (
          <AfhaalScherm {...props} />
        ) : (
          <OverzichtScherm {...props} />
        )}
      </main>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <div role={toast.fout ? "alert" : "status"} className={`pointer-events-auto flex max-w-xl items-center gap-4 rounded-2xl px-4 py-3 shadow-2xl ${toast.fout ? "bg-[#7F1D1D] text-white" : "bg-white text-[#0B0F0D]"}`}>
            <span className="font-semibold">{toast.tekst}</span>
            {toast.terug && (
              <button
                type="button"
                className="rounded-full bg-[#0B0F0D] px-3 py-1.5 text-sm font-bold text-white"
                onClick={() => {
                  const t = toast.terug;
                  setToast(null);
                  t?.();
                }}
              >
                Ongedaan maken
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
