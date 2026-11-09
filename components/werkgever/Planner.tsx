"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PlanVoorstel } from "@/lib/planner/plan";
import { weekLabel, weekPlus } from "@/lib/planner/week";
import { STANDAARD_INSTELLINGEN, type PlanInstellingen } from "@/lib/planner/solver";
import { teWeinigGeplaatst, type WeekDrukte } from "@/lib/planner/drukte";

const WEEKDAG_KORT = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const aantal = (n: number) => n.toLocaleString("nl-NL", { maximumFractionDigits: 1 });

// ---------------------------------------------------------------------------
// Werkgever → Roosterplanner: kies een week, stel de regels in, laat het rooster
// uitrekenen en stuur de aanbiedingen naar de gekozen krachten. De krachten
// accepteren zelf in de app; niets wordt zonder hun ja ingepland.
// ---------------------------------------------------------------------------

const euro = (c: number) => `€ ${(c / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const tijd = (iso: string) => new Date(iso).toLocaleTimeString("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit" });
const dag = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "short", day: "numeric", month: "short" });

export function Planner({ startWeek }: { startWeek: string }) {
  const [week, setWeek] = useState(startWeek);
  const [inst, setInst] = useState<PlanInstellingen>(STANDAARD_INSTELLINGEN);
  const [voorstel, setVoorstel] = useState<PlanVoorstel | null>(null);
  const [laden, setLaden] = useState(true);
  const [bezig, setBezig] = useState<"rekenen" | "versturen" | null>(null);
  const [weg, setWeg] = useState<Set<string>>(new Set());
  const [melding, setMelding] = useState<{ ok: boolean; text: string } | null>(null);
  const [drukte, setDrukte] = useState<WeekDrukte | null>(null);

  const laad = useCallback(async (w: string) => {
    setLaden(true);
    const r = await fetch(`/api/werkgever/planner?week=${encodeURIComponent(w)}`, { cache: "no-store" }).catch(() => null);
    const d = r?.ok ? await r.json() : null;
    setVoorstel(d?.voorstel ?? null);
    setDrukte(d?.drukte ?? null);
    if (d?.voorstel?.instellingen) setInst(d.voorstel.instellingen);
    setWeg(new Set());
    setLaden(false);
  }, []);

  useEffect(() => {
    void laad(week);
  }, [week, laad]);

  async function reken() {
    setBezig("rekenen");
    setMelding(null);
    const r = await fetch("/api/werkgever/planner", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week, instellingen: inst }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBezig(null);
    if (!r?.ok) return setMelding({ ok: false, text: d?.error?.message ?? "Uitrekenen lukte niet." });
    setVoorstel(d.voorstel);
    setWeg(new Set());
    const t = (d.voorstel as PlanVoorstel).resultaat.totaal;
    setMelding({ ok: true, text: t.plekken === 0 ? "Geen open diensten in deze week." : `${t.gevuld} van ${t.plekken} plekken gevuld (${t.bezettingPct}%).` });
  }

  async function verstuur() {
    if (!voorstel) return;
    const keuze = voorstel.resultaat.toewijzingen.filter((t) => !weg.has(`${t.dienstId}|${t.krachtId}`)).map((t) => ({ dienstId: t.dienstId, krachtId: t.krachtId }));
    if (keuze.length === 0) return setMelding({ ok: false, text: "Er is niets geselecteerd om te versturen." });
    if (!window.confirm(`${keuze.length} aanbiedingen versturen? De krachten krijgen een melding en accepteren zelf in de app.`)) return;
    setBezig("versturen");
    setMelding(null);
    const r = await fetch("/api/werkgever/planner/verstuur", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ week, keuze }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBezig(null);
    if (!r?.ok) return setMelding({ ok: false, text: d?.error?.message ?? "Versturen lukte niet." });
    setMelding({ ok: true, text: `${d.aanbiedingen} aanbiedingen verstuurd voor ${d.diensten} diensten.${d.overgeslagen?.length ? ` Overgeslagen: ${d.overgeslagen.join("; ")}` : ""}` });
    void laad(week);
  }

  const perDienst = useMemo(() => {
    if (!voorstel) return [];
    return voorstel.diensten.map((d) => ({
      dienst: d,
      rijen: voorstel.resultaat.toewijzingen.filter((t) => t.dienstId === d.id),
      open: voorstel.resultaat.onvervuld.find((o) => o.dienstId === d.id) ?? null,
    }));
  }, [voorstel]);

  const geselecteerd = voorstel ? voorstel.resultaat.toewijzingen.filter((t) => !weg.has(`${t.dienstId}|${t.krachtId}`)).length : 0;
  const t = voorstel?.resultaat.totaal;

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <button type="button" className="btn-ghost text-sm" onClick={() => setWeek(weekPlus(week, -1))} aria-label="Vorige week">
          ‹
        </button>
        <p className="min-w-[14rem] text-center text-sm font-semibold text-ink">{weekLabel(week)}</p>
        <button type="button" className="btn-ghost text-sm" onClick={() => setWeek(weekPlus(week, 1))} aria-label="Volgende week">
          ›
        </button>
        <span className="flex-1" />
        <button type="button" className="btn-primary text-sm" disabled={bezig !== null} onClick={() => void reken()}>
          {bezig === "rekenen" ? "Bezig met rekenen…" : voorstel ? "Opnieuw uitrekenen" : "Rooster uitrekenen"}
        </button>
      </div>

      {drukte && (
        <section className="card p-4" aria-labelledby="drukte-kop">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="drukte-kop" className="text-sm font-semibold text-ink">
              Verwachte drukte
            </h2>
            <p className="text-xs text-neutralx-600">
              Gemiddeld aantal plekken per dag uit je eigen diensten van de afgelopen {drukte.weken} weken.
            </p>
          </div>
          <ul className="mt-3 grid grid-cols-7 gap-1.5 text-center">
            {drukte.dagen.map((d) => {
              const tekort = teWeinigGeplaatst(d);
              return (
                <li key={d.datum} className="relative rounded-lg border border-hair px-1 py-2">
                  <p className="text-xs font-semibold text-ink">
                    {WEEKDAG_KORT[d.weekdag]} {Number(d.datum.slice(8))}
                  </p>
                  <p className="mt-1 text-xs text-neutralx-600">
                    <span className="sr-only">verwacht </span>~{aantal(d.verwacht)}
                  </p>
                  <p className={`mt-0.5 text-xs font-semibold ${tekort ? "text-warn" : "text-ink"}`}>
                    <span className="sr-only">geplaatst </span>
                    {d.geplaatst}
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-neutralx-600">
            Boven: gewoonlijk nodig. Onder: al geplaatst{drukte.dagen.some(teWeinigGeplaatst) ? "; oranje = minder dan gewoonlijk, plaats er op tijd een klus bij." : "."}
          </p>
        </section>
      )}

      <details className="card p-4" open={!voorstel}>
        <summary className="cursor-pointer text-sm font-semibold text-ink">Regels voor de planner</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="font-medium text-ink">Maximale reisafstand</span>
            <span className="mt-1 flex items-center gap-2">
              <input type="range" min={5} max={150} step={5} value={inst.maxReisKm} onChange={(e) => setInst({ ...inst, maxReisKm: Number(e.target.value) })} className="w-full" />
              <span className="num w-14 text-right text-neutralx-600">{inst.maxReisKm} km</span>
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Maximaal uren per week</span>
            <span className="mt-1 flex items-center gap-2">
              <input type="range" min={8} max={60} step={1} value={inst.maxWeekUren} onChange={(e) => setInst({ ...inst, maxWeekUren: Number(e.target.value) })} className="w-full" />
              <span className="num w-14 text-right text-neutralx-600">{inst.maxWeekUren} u</span>
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Rust tussen diensten</span>
            <span className="mt-1 flex items-center gap-2">
              <input type="range" min={8} max={16} step={1} value={inst.rustUren} onChange={(e) => setInst({ ...inst, rustUren: Number(e.target.value) })} className="w-full" />
              <span className="num w-14 text-right text-neutralx-600">{inst.rustUren} u</span>
            </span>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-ink">Kiezen op</span>
            <select value={inst.voorkeur} onChange={(e) => setInst({ ...inst, voorkeur: e.target.value as PlanInstellingen["voorkeur"] })} className="mt-1 w-full rounded-lg border border-hairstrong px-3 py-2 text-sm">
              <option value="kosten">Laagste kosten</option>
              <option value="balans">Balans kosten en betrouwbaarheid</option>
              <option value="betrouwbaarheid">Hoogste betrouwbaarheid</option>
            </select>
          </label>
        </div>
        <p className="mt-3 text-xs text-neutralx-500">
          Altijd: vereiste certificaten (VCA, BHV), het vak van de dienst, nooit twee diensten tegelijk, geblokkeerde krachten nooit, favorieten eerst bij gelijke kosten. Reiskosten tellen als € {(inst.reiskostenPerKmCents / 100).toFixed(2).replace(".", ",")} per km heen en terug.
        </p>
      </details>

      {melding && (
        <p role={melding.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-sm ${melding.ok ? "bg-ok/10 text-ok" : "bg-crit/10 text-crit"}`}>
          {melding.text}
        </p>
      )}

      {laden ? (
        <p className="text-sm text-neutralx-500">Laden…</p>
      ) : !voorstel ? (
        <div className="card p-8 text-center">
          <p className="font-display text-lg font-bold text-ink">Nog geen rooster voor deze week</p>
          <p className="mt-2 text-sm text-neutralx-600">Klik op “Rooster uitrekenen”. De planner kijkt naar alle open diensten in deze week en alle krachten die ze mogen doen.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Bezetting" value={`${t!.bezettingPct}%`} hint={`${t!.gevuld} van ${t!.plekken} plekken`} />
            <Kpi label="Loonkosten" value={euro(t!.loonCents)} hint="voor de gevulde plekken" />
            <Kpi label="Reiskosten" value={euro(t!.reisCents)} hint={`${t!.reisKm} km heen en terug`} />
            <Kpi label="Berekend" value={voorstel.resultaat.oplosser === "ortools" ? "OR-Tools" : "ZekerFlex"} hint={`${voorstel.krachten} krachten bekeken, ${voorstel.resultaat.ms} ms`} />
          </div>

          {voorstel.verstuurd && (
            <p className="text-xs text-neutralx-500">
              Laatst verstuurd {new Date(voorstel.verstuurd.at).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", dateStyle: "short", timeStyle: "short" })}: {voorstel.verstuurd.aanbiedingen} aanbiedingen voor {voorstel.verstuurd.diensten} diensten. Opnieuw versturen stuurt alleen naar wie nog niet is ingepland.
            </p>
          )}

          <div className="space-y-4">
            {perDienst.length === 0 && <p className="card p-6 text-sm text-neutralx-600">Geen open diensten in deze week. Plaats eerst een klus.</p>}
            {perDienst.map(({ dienst, rijen, open }) => (
              <section key={dienst.id} className="card overflow-hidden">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hair px-5 py-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-ink">{dienst.titel}</h2>
                    <p className="text-xs text-neutralx-500">
                      {dag(dienst.start)} {tijd(dienst.start)}–{tijd(dienst.einde)} · {dienst.locatie} · {dienst.plekken} {dienst.plekken === 1 ? "plek" : "plekken"} · {euro(dienst.uurtariefCents)}/u
                      {dienst.certificaten.length > 0 && ` · vereist ${dienst.certificaten.join(", ")}`}
                    </p>
                  </div>
                  {open ? <span className="rounded-full bg-warn/10 px-2 py-0.5 text-xs font-semibold text-warn">{open.open} open: {open.reden}</span> : <span className="rounded-full bg-ok/10 px-2 py-0.5 text-xs font-semibold text-ok">Gevuld</span>}
                </header>
                {rijen.length > 0 && (
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-neutralx-500">
                      <tr>
                        <th className="px-5 py-2">Versturen</th>
                        <th className="px-5 py-2">Kracht</th>
                        <th className="px-5 py-2 text-right">Reis</th>
                        <th className="px-5 py-2 text-right">Loon</th>
                        <th className="px-5 py-2 text-right">Reiskosten</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rijen.map((r) => {
                        const sleutel = `${r.dienstId}|${r.krachtId}`;
                        return (
                          <tr key={sleutel} className="border-t border-hair">
                            <td className="px-5 py-2">
                              <input type="checkbox" checked={!weg.has(sleutel)} onChange={(e) => setWeg((cur) => { const n = new Set(cur); if (e.target.checked) n.delete(sleutel); else n.add(sleutel); return n; })} aria-label={`${r.naam} voor ${dienst.titel}`} />
                            </td>
                            <td className="px-5 py-2 font-medium text-ink">{r.naam}</td>
                            <td className="num px-5 py-2 text-right text-neutralx-600">{r.reisKm} km · {r.reisMinuten} min</td>
                            <td className="num px-5 py-2 text-right">{euro(r.loonCents)}</td>
                            <td className="num px-5 py-2 text-right text-neutralx-600">{euro(r.reisCents)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            ))}
          </div>

          {voorstel.resultaat.toewijzingen.length > 0 && (
            <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-neutralx-600">{geselecteerd} van {voorstel.resultaat.toewijzingen.length} aanbiedingen geselecteerd. Krachten krijgen een melding en accepteren zelf; wat ze afslaan komt terug in de gewone matching.</p>
              <button type="button" className="btn-primary text-sm" disabled={bezig !== null || geselecteerd === 0} onClick={() => void verstuur()}>
                {bezig === "versturen" ? "Versturen…" : `Stuur ${geselecteerd} aanbiedingen`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-neutralx-500">{label}</p>
      <p className="num mt-1 font-display text-2xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs text-neutralx-500">{hint}</p>
    </div>
  );
}
