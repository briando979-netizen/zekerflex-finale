"use client";

import { useCallback, useEffect, useState } from "react";
import { Empty, Notice, PageHead, Panel, type Tone } from "@/components/admin/kit";

// ---------------------------------------------------------------------------
// Admin → Kosteloze accounts (lib/billing/comp.ts): accounts that use every paid
// feature for € 0 — Website-beheer, websites publiceren, het hoogste API-pakket,
// telefonie en de bemiddelingsfee per uur. Geen beheerdersrechten.
// ---------------------------------------------------------------------------

interface Entry {
  userId: string;
  email: string;
  tenantIds: string[];
  reason: string;
  at: string;
  by: string;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Amsterdam" });

export function CompAccountsAdmin() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: Tone; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/comp", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return setMessage({ tone: "crit", text: "Kon de lijst niet laden." });
    setRows((await r.json()).accounts);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function set(target: string, on: boolean) {
    if (!on && !window.confirm(`${target} weer gewoon laten betalen?`)) return;
    setBusy(true);
    const r = await fetch("/api/admin/comp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: target, on, reason: on ? reason : "" }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r?.ok) return setMessage({ tone: "crit", text: d?.error?.message ?? "Dat lukte niet." });
    setRows(d.accounts);
    setMessage({ tone: "ok", text: on ? `${target} gebruikt nu alle betaalde functies voor € 0.` : `${target} betaalt weer gewoon.` });
    if (on) {
      setEmail("");
      setReason("");
    }
  }

  return (
    <div className="space-y-4">
      <PageHead title="Kosteloze accounts" subtitle="Accounts die elke betaalde functie voor € 0 gebruiken, bijvoorbeeld je eigen testaccount of een relatie. Dit geeft geen beheerdersrechten." />
      <Notice>
        Gratis voor zo&apos;n account: Website-beheer, websites publiceren, het hoogste API-pakket, telefonie en de bemiddelingsfee van € 3,50 per uur (die factuur wordt € 0 en staat meteen op betaald). Producten uit de webshop blijven gewoon betaald: dat zijn spullen, geen functies.
      </Notice>
      {message && <Notice tone={message.tone} role={message.tone === "crit" ? "alert" : "status"}>{message.text}</Notice>}
      <Panel title="Account kosteloos maken" subtitle="Het account en de bedrijven waar het beheerder van is.">
        <div className="flex flex-wrap items-end gap-3">
          <label className="a-label min-w-[16rem] flex-1">
            E-mailadres van het account
            <input className="a-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="naam@bedrijf.nl" />
          </label>
          <label className="a-label min-w-[16rem] flex-1">
            Reden (komt in het auditlogboek)
            <input className="a-input" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="bv. eigen testaccount" />
          </label>
          <button type="button" disabled={busy || !email.includes("@")} onClick={() => void set(email.trim(), true)} className="a-button disabled:opacity-50">
            Kosteloos maken
          </button>
        </div>
      </Panel>
      <Panel flush title="Kosteloze accounts" subtitle={rows ? `${rows.length} in totaal` : undefined}>
        {!rows ? (
          <div className="h-16 animate-pulse" />
        ) : rows.length === 0 ? (
          <Empty title="Nog geen kosteloze accounts" />
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.userId} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5" style={{ borderTop: "1px solid var(--a-border)" }}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.8125rem] font-medium" style={{ color: "var(--a-text)" }}>{r.email}</p>
                  <p className="truncate text-xs" style={{ color: "var(--a-mute)" }}>
                    sinds {day(r.at)} · door {r.by} · {r.tenantIds.length === 1 ? "1 bedrijf" : `${r.tenantIds.length} bedrijven`}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </p>
                </div>
                <button type="button" disabled={busy} onClick={() => void set(r.email, false)} className="a-button text-xs">
                  Weer laten betalen
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
