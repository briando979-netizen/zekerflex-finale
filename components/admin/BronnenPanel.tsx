"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, KpiStrip, Notice, Panel, Pill } from "@/components/admin/kit";
import { Chart } from "@/components/admin/kit-client";
import { dateTimeNl, timeAgoNl } from "@/lib/admin/format";
import type { Bron, BronId, Meting } from "@/lib/bronnen/catalogus";
import type { ReeksPunt } from "@/lib/bronnen/store";

// De bronnen: per bron de laatste stand, de regels eronder, "Nu ophalen", de
// grafiek van de pompprijzen en de schermafdrukken van de eigen site.

interface Antwoord {
  bronnen: (Bron & { laatste: Meting | null })[];
  brandstofReeks: ReeksPunt[];
  schermPaginas: readonly string[];
  scraper: { ingesteld: boolean; gezond: boolean };
}

const TOON: Record<NonNullable<Meting["regels"][number]["toon"]>, string> = { ok: "var(--a-ok)", "let-op": "var(--a-warn)", fout: "var(--a-crit)" };

export function BronnenPanel() {
  const [data, setData] = useState<Antwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState<BronId | null>(null);
  const [beeld, setBeeld] = useState<string | null>(null);
  const now = new Date();

  const laad = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/bronnen", { cache: "no-store" });
      if (!r.ok) throw new Error("Bronnen laden lukte niet.");
      setData((await r.json()) as Antwoord);
      setFout(null);
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Bronnen laden lukte niet.");
    }
  }, []);
  useEffect(() => {
    void laad();
  }, [laad]);

  async function haal(id: BronId) {
    setBezig(id);
    setFout(null);
    try {
      const r = await fetch("/api/admin/bronnen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const d = (await r.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!r.ok) throw new Error(d.error?.message ?? "Ophalen lukte niet.");
      await laad();
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Ophalen lukte niet.");
    } finally {
      setBezig(null);
    }
  }

  if (!data) return fout ? <Notice tone="crit" role="alert">{fout}</Notice> : <p className="text-sm" style={{ color: "var(--a-mute)" }}>Laden…</p>;

  const ok = data.bronnen.filter((b) => b.laatste?.ok).length;
  const mis = data.bronnen.filter((b) => b.laatste && !b.laatste.ok && !/Nog niet ingesteld/.test(b.laatste.tekst)).length;
  const brandstof = data.bronnen.find((b) => b.id === "brandstof")?.laatste;
  const minloon = data.bronnen.find((b) => b.id === "minimumloon")?.laatste;
  const reeks = data.brandstofReeks.filter((p) => typeof p.waarden.benzine === "number");
  const perDag = new Map<string, ReeksPunt>();
  for (const p of reeks) perDag.set(String(p.waarden.datum ?? p.op.slice(0, 10)), p);
  const dagen = [...perDag.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-30);

  return (
    <div className="space-y-5">
      <KpiStrip
        items={[
          { label: "Bronnen in orde", value: `${ok} / ${data.bronnen.length}`, tone: mis ? "crit" : "ok" },
          { label: "Euro95 vandaag", value: typeof brandstof?.waarden.benzine === "number" ? `€ ${brandstof.waarden.benzine.toFixed(3)}` : "–", hint: "per liter, CBS" },
          { label: "Minimumuurloon 21+", value: typeof minloon?.waarden.uurloon21 === "number" ? `€ ${minloon.waarden.uurloon21.toFixed(2)}` : "–", hint: "bruto, Rijksoverheid" },
          { label: "Browser-werker", value: data.scraper.gezond ? "Draait" : data.scraper.ingesteld ? "Reageert niet" : "Uit", tone: data.scraper.gezond ? "ok" : data.scraper.ingesteld ? "crit" : "neutral", hint: "Playwright in Docker" },
        ]}
      />
      {fout && <Notice tone="crit" role="alert">{fout}</Notice>}

      <div className="grid gap-4 lg:grid-cols-2">
        {data.bronnen.map((b) => {
          const m = b.laatste;
          const uit = m && !m.ok && /Nog niet ingesteld/.test(m.tekst);
          return (
            <Panel
              key={b.id}
              title={b.naam}
              subtitle={b.kort}
              actions={
                <span className="flex items-center gap-2">
                  <Pill tone={!m ? "neutral" : uit ? "neutral" : m.ok ? "ok" : "crit"}>{!m ? "Nog niet opgehaald" : uit ? "Niet ingesteld" : m.ok ? "In orde" : "Mislukt"}</Pill>
                  <button type="button" className="a-btn a-btn-ghost" disabled={bezig !== null} onClick={() => void haal(b.id)}>
                    {bezig === b.id ? "Ophalen…" : "Nu ophalen"}
                  </button>
                </span>
              }
            >
              {m ? (
                <>
                  <p className="text-[0.9375rem] font-semibold" style={{ color: "var(--a-text)" }}>
                    {m.ok ? m.tekst : m.fout || m.tekst}
                  </p>
                  <p className="mt-1 text-xs" style={{ color: "var(--a-mute)" }}>
                    {dateTimeNl(m.op, now)} ({timeAgoNl(m.op, now.getTime())}) · {m.duurMs} ms · elke {b.elkeUur < 24 ? `${b.elkeUur} uur` : b.elkeUur === 24 ? "dag" : `${Math.round(b.elkeUur / 24)} dagen`} ·{" "}
                    <a href={b.bronUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      {b.bronNaam}
                    </a>
                  </p>
                  {m.regels.length > 0 && (
                    <ul className="mt-3 space-y-1 text-[0.8125rem]">
                      {m.regels.map((r, i) => (
                        <li key={i} className="flex gap-2">
                          <span aria-hidden className="mt-1.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ background: r.toon ? TOON[r.toon] : "var(--a-mute)" }} />
                          {r.url ? (
                            <a href={r.url} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--a-text)" }}>
                              {r.tekst}
                            </a>
                          ) : (
                            <span style={{ color: "var(--a-text)" }}>{r.tekst}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-xs" style={{ color: "var(--a-mute)" }}>{b.nut}</p>
                </>
              ) : (
                <Empty title="Nog niet opgehaald" body={`De planner haalt deze bron elk uur op als hij aan de beurt is. ${b.nut}`} />
              )}
            </Panel>
          );
        })}
      </div>

      {dagen.length > 1 && (
        <Panel title="Pompprijzen, laatste 30 dagen" subtitle="Landelijk gemiddelde per liter (CBS)">
          <Chart
            title="Pompprijzen per dag"
            kind="line"
            unit="money"
            labels={dagen.map(([d]) => d.slice(5).replace("-", "/"))}
            series={[
              { label: "Euro95", values: dagen.map(([, p]) => Math.round(Number(p.waarden.benzine) * 100)) },
              { label: "Diesel", values: dagen.map(([, p]) => Math.round(Number(p.waarden.diesel) * 100)) },
            ]}
          />
        </Panel>
      )}

      <Panel title="Schermcontrole" subtitle="Zo zag een echte browser de site de laatste keer. Klik voor groot.">
        {!data.scraper.ingesteld ? (
          <Empty title="Browser-werker staat uit" body="Zet SCRAPER_TOKEN in .env.production op de server (de uitrol maakt hem vanzelf aan) en start de scraper-container; daarna verschijnen hier dagelijks schermafdrukken." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {data.schermPaginas.map((pad) => (
              <li key={pad}>
                <button type="button" onClick={() => setBeeld(pad)} className="block w-full overflow-hidden rounded-lg text-left" style={{ border: "1px solid var(--a-border)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/admin/bronnen?beeld=${encodeURIComponent(pad)}`} alt={`Schermafdruk van ${pad}`} className="aspect-[16/11] w-full object-cover object-top" loading="lazy" />
                  <span className="block px-2 py-1 font-mono text-xs" style={{ color: "var(--a-mute)" }}>
                    {pad}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {beeld && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setBeeld(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Schermafdruk van ${beeld}`} className="max-h-full max-w-5xl overflow-auto rounded-xl bg-white p-2" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/admin/bronnen?beeld=${encodeURIComponent(beeld)}`} alt={`Schermafdruk van ${beeld}`} className="w-full" />
            <button type="button" className="a-btn mt-2" onClick={() => setBeeld(null)}>
              Sluiten
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
