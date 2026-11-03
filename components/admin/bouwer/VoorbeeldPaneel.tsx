"use client";

import { useCallback, useEffect, useState } from "react";
import type { VoorbeeldStand } from "@/lib/bouwer/werker";

// Live voorbeeld (deploy/bouwer/werker/voorbeeld.mjs): de site als next dev op
// demogegevens, achter een getekende link. Eén voorbeeld tegelijk, voor:
//   · "opdracht" — de wijziging van de Bouwer, vóór je goedkeurt (tabblad Bouwer)
//   · "main"     — de nieuwste versie op GitHub, vóór je hem live zet (Live zetten)

type Stand = VoorbeeldStand & { link: string | null };

const NAAM: Record<"opdracht" | "main", string> = { opdracht: "de opdracht van de Bouwer", main: "de nieuwste versie" };

export function VoorbeeldPaneel({ versie = "opdracht" }: { versie?: "opdracht" | "main" }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);

  const laad = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bouwer/voorbeeld", { cache: "no-store" });
      if (res.ok) setStand((await res.json()) as Stand);
    } catch {
      /* volgende peiling */
    }
  }, []);

  const start = stand?.staat === "start";
  useEffect(() => {
    void laad();
    const id = setInterval(() => void laad(), start ? 3000 : 15_000);
    return () => clearInterval(id);
  }, [laad, start]);

  const actie = async (naam: "start" | "stop") => {
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/admin/bouwer/voorbeeld", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actie: naam, versie }),
      });
      const d = (await res.json().catch(() => ({}))) as Stand & { error?: { message?: string } | string };
      if (!res.ok) throw new Error((typeof d.error === "string" ? d.error : d.error?.message) || `Mislukt (${res.status})`);
      setStand(d);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Mislukt");
    } finally {
      setBezig(false);
    }
  };

  if (!stand?.beschikbaar) return null;
  const draait = stand.staat === "aan" || stand.staat === "start";
  // het voorbeeld draait, maar voor iets anders dan dit paneel
  const ander = draait && (stand.versie ?? "opdracht") !== versie;

  return (
    <div className="space-y-2 rounded-xl border border-[#7CC5FF]/20 bg-[rgba(124,197,255,0.05)] p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.16em] text-[#7CC5FF]/80">Live voorbeeld</span>
        <span className="text-white/50">
          {ander
            ? `toont nu ${NAAM[stand.versie ?? "opdracht"]}`
            : stand.staat === "aan"
              ? `staat aan${stand.versie === "main" && stand.sha ? ` (${stand.sha.slice(0, 7)})` : ""}`
              : stand.staat === "start"
                ? "start op… (1 tot 3 minuten)"
                : stand.staat === "fout"
                  ? "niet gelukt"
                  : "staat uit"}
        </span>
        <span className="ml-auto flex gap-2">
          {!ander && stand.staat === "aan" && stand.link && (
            <a href={stand.link} target="_blank" rel="noreferrer" className="rounded-md bg-[#7CC5FF] px-3 py-1.5 font-semibold text-ink">
              Open voorbeeld ↗
            </a>
          )}
          {(stand.staat === "uit" || stand.staat === "fout") && (
            <button
              type="button"
              disabled={bezig}
              onClick={() => void actie("start")}
              className="rounded-md border border-[#7CC5FF]/40 px-3 py-1.5 text-[#7CC5FF] hover:bg-[rgba(124,197,255,0.1)] disabled:opacity-40"
            >
              {versie === "main" ? "Bekijk de nieuwste versie" : "Start voorbeeld"}
            </button>
          )}
          {draait && (
            <button type="button" disabled={bezig} onClick={() => void actie("stop")} className="rounded-md border border-white/15 px-3 py-1.5 text-white/60 hover:bg-white/10 disabled:opacity-40">
              Stop
            </button>
          )}
        </span>
      </div>
      <p className="leading-relaxed text-white/45">
        {versie === "main" ? "De nieuwste versie op GitHub, zoals hij live zou gaan" : "De gewijzigde site"}, met alleen demogegevens (inloggen als admin@zekerflex.nl /
        Zeker!2026). De link geldt 2 uur; zonder bezoek stopt het voorbeeld na 30 minuten.
      </p>
      {!ander && stand.fout && <p className="text-[#F07C6B]">{stand.fout}</p>}
      {fout && (
        <p role="alert" className="text-[#F07C6B]">
          {fout}
        </p>
      )}
      {!ander && stand.staat === "start" && stand.regels.length > 0 && (
        <pre className="max-h-32 overflow-auto rounded-md bg-black/40 p-2 font-mono text-[10.5px] text-white/50">{stand.regels.slice(-8).join("\n")}</pre>
      )}
    </div>
  );
}
