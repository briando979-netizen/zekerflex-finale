"use client";

import { useCallback, useEffect, useState } from "react";
import { Panel, Pill } from "@/components/admin/kit";

// Beheer → Winkel-AI → Leverancier: de voortgang van "Alles overnemen" (18 nov 2026). De wachtrij zelf draait op de
// server (cron elke 2 minuten, lib/shop/cj/wachtrij.ts); dit scherm kijkt elke 10 s mee en heeft Pauze, Hervat en Stop.

type Wachtrij = {
  id: string; getypt: string; q: string; land: string; categorie: string | null; actief: boolean; totaal: number;
  gedaan: number; bestaand: number; mislukt: number; nogTeVertalen: number; fouten: { pid: string; fout: string }[];
  status: "loopt" | "pauze" | "gestopt" | "klaar"; gestartOp: string; bijgewerktOp: string; laatsteFout: string | null;
};
type Stand = { wachtrij: Wachtrij | null; voortgang: { afgehandeld: number; rest: number; procent: number } | null; schatting: string };

async function vraag<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: body === undefined ? "GET" : "POST", headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(d.error?.message ?? "Dat lukte niet. Probeer het nog eens.");
  return d;
}
const datum = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" });

/** `tik` verandert als de zoekpagina een wachtrij startte: dan meteen verversen. */
export function CjWachtrij({ tik }: { tik: number }) {
  const [stand, setStand] = useState<Stand | null>(null);
  const [bezig, setBezig] = useState("");
  const [fout, setFout] = useState<string | null>(null);

  const laad = useCallback(async () => {
    try {
      setStand(await vraag<Stand>("/api/admin/shop-ai/cj/wachtrij"));
    } catch (e) {
      setFout((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad, tik]);
  // meekijken zolang hij loopt
  const loopt = stand?.wachtrij?.status === "loopt";
  useEffect(() => {
    if (!loopt) return;
    const t = setInterval(() => void laad(), 10_000);
    return () => clearInterval(t);
  }, [loopt, laad]);

  const doe = (actie: "pauze" | "loopt" | "gestopt" | "ronde" | "wis") =>
    (async () => {
      setBezig(actie);
      setFout(null);
      try {
        setStand(await vraag<Stand>("/api/admin/shop-ai/cj/wachtrij", { actie }));
      } catch (e) {
        setFout((e as Error).message);
      } finally {
        setBezig("");
      }
    })();

  const w = stand?.wachtrij;
  if (!w) return null;
  const v = stand?.voortgang ?? { afgehandeld: 0, rest: w.totaal, procent: 0 };
  const toon: Record<Wachtrij["status"], { tone: "ok" | "warn" | "neutral" | "plan"; tekst: string }> = {
    loopt: { tone: "plan", tekst: "loopt (elke 2 minuten een paar)" },
    pauze: { tone: "warn", tekst: "op pauze" },
    gestopt: { tone: "neutral", tekst: "gestopt" },
    klaar: { tone: "ok", tekst: "klaar" },
  };
  return (
    <Panel title={`Alles overnemen: "${w.getypt || w.q}"${w.categorie ? ` → ${w.categorie}` : ""}`} subtitle={`Gestart ${datum(w.gestartOp)} · ${w.totaal} treffers bij CJ${w.land ? ` met voorraad in ${w.land}` : ""} · ${w.actief ? "meteen aan (met foto en Nederlandse tekst)" : "staan uit tot je ze aanzet"}`}>
      {fout && <p role="alert" className="mb-3 text-sm" style={{ color: "var(--a-crit, #b91c1c)" }}>{fout}</p>}
      <div className="mb-2 flex flex-wrap items-center gap-3 text-sm" style={{ color: "var(--a-text)" }}>
        <Pill tone={toon[w.status].tone}>{toon[w.status].tekst}</Pill>
        <strong>{v.afgehandeld} van {w.totaal}</strong>
        {stand?.schatting && <span style={{ color: "var(--a-mute)" }}>nog {stand.schatting}</span>}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--a-soft, #eee)" }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={v.procent} aria-label="Voortgang alles overnemen">
        <div className="h-full rounded-full" style={{ width: `${v.procent}%`, background: "var(--a-accent, #52E0A4)" }} />
      </div>
      <p className="mt-2 text-sm" style={{ color: "var(--a-mute)" }}>
        {w.gedaan} overgenomen{w.nogTeVertalen ? ` (waarvan ${w.nogTeVertalen} nog te vertalen: die staan uit tot de knop Bijwerken ze vertaalt)` : ""} · {w.bestaand} stonden er al · {w.mislukt} mislukt · {v.rest} te gaan
        {w.laatsteFout ? ` · laatste fout: ${w.laatsteFout}` : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {w.status === "loopt" && <button type="button" className="a-btn" disabled={bezig !== ""} onClick={() => void doe("pauze")}>Pauze</button>}
        {w.status === "pauze" && <button type="button" className="a-btn a-btn-primary" disabled={bezig !== ""} onClick={() => void doe("loopt")}>Hervatten</button>}
        {(w.status === "loopt" || w.status === "pauze") && (
          <>
            <button type="button" className="a-btn" disabled={bezig !== ""} onClick={() => { if (window.confirm("Stoppen? Wat al overgenomen is blijft staan; de rest komt niet meer.")) void doe("gestopt"); }}>Stop</button>
            <button type="button" className="a-btn" disabled={bezig !== "" || w.status !== "loopt"} onClick={() => void doe("ronde")}>{bezig === "ronde" ? "Bezig…" : "Nu een ronde doen"}</button>
          </>
        )}
        {(w.status === "klaar" || w.status === "gestopt") && <button type="button" className="a-btn" disabled={bezig !== ""} onClick={() => void doe("wis")}>Opruimen</button>}
      </div>
      {w.fouten.length > 0 && (
        <details className="mt-3 text-sm" style={{ color: "var(--a-text)" }}>
          <summary className="cursor-pointer font-semibold">Laatste fouten ({w.fouten.length})</summary>
          <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--a-mute)" }}>
            {w.fouten.map((f, i) => <li key={`${f.pid}-${i}`}><span className="font-mono">{f.pid}</span>: {f.fout}</li>)}
          </ul>
        </details>
      )}
    </Panel>
  );
}
