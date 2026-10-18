"use client";

import { useCallback, useEffect, useState } from "react";

interface Worker {
  userId: string;
  name: string;
  email: string | null;
  weeksWorked: number;
  phase: "A" | "B" | "C";
  lastWeek: string;
  lastWeekGrossCents: number;
  lastWeekHours: number;
}
interface Signal {
  userId: string;
  name: string;
  level: "info" | "warn";
  text: string;
}
interface Econ {
  tenantId: string;
  name: string;
  invoices: number;
  hours: number;
  revenueCents: number;
  wageCents: number;
  markupCents: number;
  markupRate: number;
}
interface Lead {
  id: string;
  companyName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}
interface Data {
  leads: Lead[];
  pool: Worker[];
  signals: Signal[];
  economics: Econ[];
  defaultMarkup: number;
}

const eur = (c: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(c / 100);
const PHASE: Record<Worker["phase"], string> = { A: "Fase A", B: "Fase B", C: "Fase C" };
const LEAD_STATUS: Record<string, string> = { NEW: "nieuw", ENRICHED: "nieuw", REPLIED: "in gesprek", WON: "klant", LOST: "verloren", DISQUALIFIED: "afgewezen", SENT: "uitgenodigd" };

/** /admin/uitzendbureau — ABU signals, the pool, numbers per client and the aanvragen pipeline. */
export function UitzendConsole() {
  const [d, setD] = useState<Data | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/uitzendbureau", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setD(await r.json());
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function post(url: string, body: unknown, ok: string) {
    setNote(null);
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? null : JSON.stringify(body) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setNote(r?.ok ? { ok: true, text: ok } : { ok: false, text: j?.error?.message ?? "Dat lukte niet." });
    void load();
  }

  if (!d) return <p className="py-8 text-center text-sm" style={{ color: "var(--a-mute)" }}>Laden…</p>;
  const totals = d.economics.reduce((s, e) => ({ rev: s.rev + e.revenueCents, markup: s.markup + e.markupCents, hours: s.hours + e.hours }), { rev: 0, markup: 0, hours: 0 });
  const box = { background: "var(--a-elev)" };

  return (
    <div className="space-y-6">
      {note && <p className="a-panel p-3 text-sm" style={{ color: note.ok ? "#16a34a" : "#dc2626" }}>{note.text}</p>}

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Uitzendkrachten (pool)", String(d.pool.length)],
          ["Uren deze maand", totals.hours.toLocaleString("nl-NL")],
          ["Omzet deze maand", eur(totals.rev)],
          ["Opslag deze maand", eur(totals.markup)],
        ].map(([l, v]) => (
          <div key={l} className="a-panel p-4">
            <p className="text-[11px] uppercase tracking-wide" style={{ color: "var(--a-mute)" }}>{l}</p>
            <p className="mt-1 font-display text-2xl font-bold" style={{ color: "var(--a-text)" }}>{v}</p>
          </div>
        ))}
      </div>

      <section className="a-panel p-5">
        <h2 className="font-display text-lg font-semibold" style={{ color: "var(--a-text)" }}>⚠️ Actie nodig (ABU-cao)</h2>
        <p className="mb-3 text-xs" style={{ color: "var(--a-mute)" }}>Drempels die binnen enkele weken bereikt worden — op tijd een contract of pensioen regelen voorkomt claims.</p>
        {d.signals.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Geen naderende drempels.</p>
        ) : (
          <ul className="space-y-2">
            {d.signals.map((s, i) => (
              <li key={i} className="rounded-xl px-4 py-2.5 text-sm" style={box}>
                <span className="font-semibold" style={{ color: s.level === "warn" ? "#d97706" : "var(--a-text)" }}>{s.name}</span>
                <span style={{ color: "var(--a-dim)" }}> — {s.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="a-panel p-5">
        <h2 className="mb-3 font-display text-lg font-semibold" style={{ color: "var(--a-text)" }}>Cijfers per klant (deze maand)</h2>
        {d.economics.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen uitzendfacturen deze maand.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase" style={{ color: "var(--a-mute)" }}>
                  <th className="py-2">Klant</th>
                  <th className="py-2 text-right">Uren</th>
                  <th className="py-2 text-right">Loonkosten</th>
                  <th className="py-2 text-right">Opslag</th>
                  <th className="py-2 text-right">Omzet</th>
                  <th className="py-2 text-right">Opslag %</th>
                </tr>
              </thead>
              <tbody>
                {d.economics.map((e) => (
                  <tr key={e.tenantId} className="border-t" style={{ borderColor: "var(--a-border)", color: "var(--a-text)" }}>
                    <td className="py-2">{e.name}</td>
                    <td className="py-2 text-right">{e.hours.toLocaleString("nl-NL")}</td>
                    <td className="py-2 text-right">{eur(e.wageCents)}</td>
                    <td className="py-2 text-right">{eur(e.markupCents)}</td>
                    <td className="py-2 text-right font-semibold">{eur(e.revenueCents)}</td>
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        className="underline"
                        onClick={() => {
                          const v = window.prompt(`Opslag voor ${e.name} in % (leeg = standaard ${Math.round(d.defaultMarkup * 100)}%)`, String(Math.round(e.markupRate * 100)));
                          if (v === null) return;
                          const rate = v.trim() ? Number(v.replace(",", ".")) / 100 : null;
                          void post("/api/admin/uitzendbureau", { action: "markup", tenantId: e.tenantId, rate }, "Opslag opgeslagen — geldt voor nieuwe goedkeuringen.");
                        }}
                      >
                        {Math.round(e.markupRate * 100)}%
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs" style={{ color: "var(--a-mute)" }}>Opslag = wat ZekerFlex bovenop het loon factureert, vóór werkgeverslasten (vakantiegeld, premies, pensioen).</p>
      </section>

      <section className="a-panel p-5">
        <h2 className="mb-3 font-display text-lg font-semibold" style={{ color: "var(--a-text)" }}>Uitzendkrachten</h2>
        {d.pool.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen uitzendkrachten in de recente verloningen.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase" style={{ color: "var(--a-mute)" }}>
                  <th className="py-2">Naam</th>
                  <th className="py-2">Fase</th>
                  <th className="py-2 text-right">Weken</th>
                  <th className="py-2 text-right">Laatste week</th>
                  <th className="py-2 text-right">Uren</th>
                  <th className="py-2 text-right">Bruto</th>
                </tr>
              </thead>
              <tbody>
                {d.pool.map((w) => (
                  <tr key={w.userId} className="border-t" style={{ borderColor: "var(--a-border)", color: "var(--a-text)" }}>
                    <td className="py-2">{w.name}</td>
                    <td className="py-2">{PHASE[w.phase]}</td>
                    <td className="py-2 text-right">{w.weeksWorked}</td>
                    <td className="py-2 text-right">{w.lastWeek}</td>
                    <td className="py-2 text-right">{w.lastWeekHours}</td>
                    <td className="py-2 text-right">{eur(w.lastWeekGrossCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="a-panel p-5">
        <h2 className="mb-3 font-display text-lg font-semibold" style={{ color: "var(--a-text)" }}>Aanvragen ({d.leads.length})</h2>
        {d.leads.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--a-mute)" }}>Nog geen aanvragen via /uitzendbureau.</p>
        ) : (
          <ul className="space-y-2.5">
            {d.leads.map((l) => (
              <li key={l.id} className="rounded-xl px-4 py-3" style={box}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>{l.companyName}</span>
                  <span className="a-tag">{LEAD_STATUS[l.status] ?? l.status.toLowerCase()}</span>
                  <span className="ml-auto flex flex-wrap gap-2 text-xs">
                    {l.contactEmail && !["WON", "LOST", "DISQUALIFIED"].includes(l.status) && (
                      <button type="button" className="a-button" onClick={() => post(`/api/sales/leads/${l.id}/invite`, undefined, `Account-uitnodiging verstuurd naar ${l.contactEmail}.`)}>
                        Account sturen
                      </button>
                    )}
                    {!["REPLIED", "WON", "LOST", "DISQUALIFIED"].includes(l.status) && (
                      <button type="button" className="a-button" onClick={() => post("/api/admin/uitzendbureau", { action: "lead-status", leadId: l.id, status: "REPLIED" }, "Op 'in gesprek' gezet.")}>
                        In gesprek
                      </button>
                    )}
                    {l.status !== "WON" && (
                      <button type="button" className="a-button" onClick={() => post("/api/admin/uitzendbureau", { action: "lead-status", leadId: l.id, status: "WON" }, `${l.companyName} is klant!`)}>
                        Gewonnen
                      </button>
                    )}
                    {!["LOST", "WON"].includes(l.status) && (
                      <button
                        type="button"
                        className="a-button"
                        onClick={() => {
                          const n = window.prompt("Waarom verloren? (optioneel)") ?? undefined;
                          void post("/api/admin/uitzendbureau", { action: "lead-status", leadId: l.id, status: "LOST", ...(n ? { note: n } : {}) }, "Op verloren gezet.");
                        }}
                      >
                        Verloren
                      </button>
                    )}
                  </span>
                </div>
                <p className="mt-0.5 text-xs" style={{ color: "var(--a-mute)" }}>
                  {l.contactName ?? "—"}
                  {l.contactEmail ? ` · ${l.contactEmail}` : ""}
                  {l.contactPhone ? ` · ${l.contactPhone}` : ""} · {new Date(l.createdAt).toLocaleString("nl-NL")}
                </p>
                {l.notes && <p className="mt-1.5 whitespace-pre-wrap text-xs" style={{ color: "var(--a-dim)" }}>{l.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
