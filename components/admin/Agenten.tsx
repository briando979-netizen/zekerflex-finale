"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Empty, Notice, PageHead, Panel, Pill } from "@/components/admin/kit";
import { euro } from "@/lib/admin/format";
import type { Analyse, Signaal } from "@/lib/markten/core";

// Admin → Agenten & markten: de winkel-agent (inkoop, conceptproducten) en de
// marktscanner (crypto, memecoins, goud, olie, tech). Beide draaien elke ochtend
// zelf en leggen alleen VOORSTELLEN klaar (Admin → Betalingen); er wordt niets
// besteld, gekocht of verkocht zonder jouw akkoord, en ZekerFlex handelt niet zelf.

type MarktRapport = { op: string; analyses: Analyse[]; kansen: Analyse[]; voorstellen: string[]; budgetCents: number; fouten: string[]; afwijzing: string };
type AgentRapport = { op: string; inkoop: string[]; concepten: string[]; gepubliceerd: string[]; opmerkingen: string[] };

const TOON: Record<Signaal, "ok" | "warn" | "crit" | "plan" | "neutral"> = { "sterke-stijging": "ok", herstel: "plan", dip: "warn", oververhit: "crit", onrustig: "warn", neutraal: "neutral" };
const NAAM: Record<Signaal, string> = { "sterke-stijging": "Sterke stijging", herstel: "Herstel", dip: "Dip", oververhit: "Oververhit", onrustig: "Onrustig", neutraal: "Neutraal" };
const pct = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${n.toString().replace(".", ",")}%`);
const tijd = (iso: string) => new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" });

async function api<T>(url: string, methode = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, { method: methode, headers: { "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const d = (await res.json().catch(() => ({}))) as { error?: { message?: string } } & T;
  if (!res.ok) throw new Error(d.error?.message ?? "Dat lukte niet. Probeer het nog eens.");
  return d;
}

export function Agenten() {
  const [markt, setMarkt] = useState<MarktRapport | null>(null);
  const [agent, setAgent] = useState<AgentRapport | null>(null);
  const [budget, setBudget] = useState("0");
  const [bezig, setBezig] = useState<"markt" | "agent" | "budget" | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    void api<{ rapport: MarktRapport | null; budgetCents: number }>("/api/admin/markten").then((d) => {
      setMarkt(d.rapport);
      setBudget(String(d.budgetCents / 100));
    }).catch(() => undefined);
    void api<{ rapport: AgentRapport | null }>("/api/admin/shop-ai/agent").then((d) => setAgent(d.rapport)).catch(() => undefined);
  }, []);

  async function doe(soort: "markt" | "agent" | "budget") {
    setBezig(soort);
    setFout(null);
    setOk(null);
    try {
      if (soort === "markt") {
        setMarkt((await api<{ rapport: MarktRapport }>("/api/admin/markten", "POST")).rapport);
        setOk("Markten gescand.");
      } else if (soort === "agent") {
        setAgent((await api<{ rapport: AgentRapport }>("/api/admin/shop-ai/agent", "POST")).rapport);
        setOk("De winkel-agent heeft gedraaid.");
      } else {
        const n = Number(budget.replace(",", "."));
        if (!Number.isFinite(n) || n < 0) throw new Error("Vul een bedrag in, bijvoorbeeld 100.");
        await api("/api/admin/markten", "PUT", { budgetCents: Math.round(n * 100) });
        setOk(n > 0 ? "Speelgeld opgeslagen." : "Speelgeld op 0: er worden geen voorstellen gemaakt.");
      }
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBezig(null);
    }
  }

  return (
    <>
      <PageHead title="Agenten & markten" subtitle="Twee agenten draaien elke ochtend zelf. Ze leggen alleen voorstellen klaar: niets wordt besteld, gekocht of verkocht zonder jouw akkoord." />
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}
      {ok && <Notice tone="ok">{ok}</Notice>}

      <Panel title="Winkel-agent" subtitle="Stelt inkoop voor uit voorraad en verkoop, en maakt elke week twee conceptproducten uit de trends (altijd UIT)." actions={<button type="button" className="btn-admin" disabled={bezig !== null} onClick={() => void doe("agent")}>{bezig === "agent" ? "Bezig…" : "Nu draaien"}</button>}>
        {agent ? (
          <div className="space-y-2 px-4 py-3 text-sm">
            <p style={{ color: "var(--a-mute)" }}>Laatste ronde: {tijd(agent.op)}</p>
            <p><strong>Inkoopvoorstellen:</strong> {agent.inkoop.length ? agent.inkoop.join(" · ") : "geen nieuwe"}</p>
            <p><strong>Nieuwe concepten:</strong> {agent.concepten.length ? agent.concepten.join(", ") : "geen deze ronde"}</p>
            {agent.gepubliceerd.length > 0 && <p><strong>Aangezet:</strong> {agent.gepubliceerd.join(", ")}</p>}
            {agent.opmerkingen.map((o) => <p key={o} style={{ color: "var(--a-mute)" }}>{o}</p>)}
            <p className="text-xs" style={{ color: "var(--a-mute)" }}>Voorstellen staan in <Link href="/admin/betalingen" className="underline">Betalingen</Link>, concepten in <Link href="/admin/shop" className="underline">Webshop</Link>. De agent zet een product alleen zelf aan met de vlag &ldquo;Winkel-AI zet producten zelf aan&rdquo; (Systeem → Vlaggen) én echte voorraad én een echte foto.</p>
          </div>
        ) : (
          <Empty title="Nog niet gedraaid" body="Klik op Nu draaien, of wacht op de ochtendronde." />
        )}
      </Panel>

      <Panel title="Marktscanner" subtitle="Crypto, memecoins, goud, zilver, olie, indices en tech uit gratis openbare koersen (CoinGecko, Yahoo Finance)." actions={<button type="button" className="btn-admin" disabled={bezig !== null} onClick={() => void doe("markt")}>{bezig === "markt" ? "Scannen…" : "Nu scannen"}</button>}>
        <div className="space-y-3 px-4 py-3">
          <Notice tone="warn">{markt?.afwijzing ?? "Dit zijn signalen uit openbare koersen, geen beleggingsadvies. Beleggen kan geld kosten, bij memecoins zelfs alles. ZekerFlex voert zelf geen handel uit."}</Notice>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              Speelgeld voor voorstellen (€)
              <input value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" className="mt-1 block w-36 rounded-md border px-2 py-1.5" style={{ borderColor: "var(--a-border-strong)" }} />
            </label>
            <button type="button" className="btn-admin" disabled={bezig !== null} onClick={() => void doe("budget")}>Opslaan</button>
            <p className="text-xs" style={{ color: "var(--a-mute)" }}>Zonder speelgeld (0) maakt de agent geen voorstellen. Per voorstel hoogstens 20% daarvan, minder bij meer risico; maximaal 3 per dag. Uitvoeren kan alleen via Betalingen, met jouw akkoord en als die rail aan staat.</p>
          </div>
          {!markt ? (
            <Empty title="Nog geen scan" body="Klik op Nu scannen." />
          ) : (
            <>
              <p className="text-xs" style={{ color: "var(--a-mute)" }}>Laatste scan: {tijd(markt.op)} · {markt.analyses.length} markten{markt.voorstellen.length ? ` · ${markt.voorstellen.length} voorstel(len) klaargezet` : ""}{markt.budgetCents ? ` · speelgeld ${euro(markt.budgetCents)}` : ""}</p>
              {markt.kansen.length > 0 && (
                <div>
                  <h3 className="mb-1 text-sm font-semibold">Om te volgen</h3>
                  <ul className="space-y-1.5 text-sm">
                    {markt.kansen.map((k) => (
                      <li key={k.id} className="flex flex-wrap items-center gap-2">
                        <Pill tone={TOON[k.signaal]}>{NAAM[k.signaal]}</Pill>
                        <strong>{k.naam}</strong>
                        <span style={{ color: "var(--a-mute)" }}>7 dgn {pct(k.r7)} · 30 dgn {pct(k.r30)} · risico {k.risico}/100</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr style={{ color: "var(--a-mute)" }}>
                      <th className="py-1 pr-3 font-medium">Markt</th>
                      <th className="py-1 pr-3 font-medium">Signaal</th>
                      <th className="py-1 pr-3 font-medium">1 dag</th>
                      <th className="py-1 pr-3 font-medium">7 dagen</th>
                      <th className="py-1 pr-3 font-medium">30 dagen</th>
                      <th className="py-1 font-medium">Risico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {markt.analyses.map((a) => (
                      <tr key={a.id} className="border-t" style={{ borderColor: "var(--a-border)" }}>
                        <td className="py-1 pr-3">{a.naam}</td>
                        <td className="py-1 pr-3"><Pill tone={TOON[a.signaal]}>{NAAM[a.signaal]}</Pill></td>
                        <td className="py-1 pr-3">{pct(a.r1)}</td>
                        <td className="py-1 pr-3">{pct(a.r7)}</td>
                        <td className="py-1 pr-3">{pct(a.r30)}</td>
                        <td className="py-1">{a.risico}/100</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {markt.fouten.length > 0 && <p className="text-xs" style={{ color: "var(--a-mute)" }}>Niet gelukt: {markt.fouten.join("; ")}</p>}
            </>
          )}
        </div>
      </Panel>
    </>
  );
}
