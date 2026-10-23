"use client";

import { useCallback, useEffect, useState } from "react";

interface Line {
  naam: string;
  bsnOpDossier: boolean;
  bsnLaatste4: string | null;
  regeling: "basis" | "plus";
  fase: string;
  wekenGewerkt: number;
  uren: number;
  pensioengevendLoonCents: number;
  werknemerPremieCents: number;
  werkgeverPremieCents: number;
  totaalPremieCents: number;
  compleet: boolean;
  ontbreekt: string[];
}
interface Aangifte {
  period: string;
  label: string;
  uitvoerder: string;
  aansluitnummer: string | null;
  status: "concept" | "geleverd" | "mislukt";
  geleverdOp: string | null;
  leveringDetail: string | null;
  lines: Line[];
  totals: { werknemers: number; incompleet: number; uren: number; pensioengevendLoonCents: number; werknemerPremieCents: number; werkgeverPremieCents: number; totaalPremieCents: number };
}
interface Data {
  periods: string[];
  aangifte: Aangifte;
  deliveryConfigured: boolean;
}

const eur = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

/** Admin → Pensioen: de maandelijkse StiPP-aangifte (UPA) voor de uitzendtak. */
export function PensioenBoard() {
  const [d, setD] = useState<Data | null>(null);
  const [period, setPeriod] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback((p?: string) => {
    const q = p ? `?period=${p}` : "";
    fetch(`/api/admin/pensioen${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Data | null) => {
        if (!data) return;
        setD(data);
        setPeriod(data.aangifte.period);
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => load(), [load]);

  if (!d) return <p className="text-sm text-neutralx-500">Laden…</p>;
  const a = d.aangifte;
  const badge = a.status === "geleverd" ? "bg-brand-50 text-brand-700" : a.status === "mislukt" ? "bg-crit/10 text-crit" : "bg-paper-soft text-neutralx-600";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-hair bg-white px-5 py-4">
        <label className="text-sm text-neutralx-600">
          Tijdvak{" "}
          <select
            value={period ?? ""}
            onChange={(e) => {
              setPeriod(e.target.value);
              setMsg(null);
              load(e.target.value);
            }}
            className="field-input ml-1 w-auto py-1.5 text-sm"
          >
            {d.periods.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badge}`}>{a.status}</span>
        <span className="text-xs text-neutralx-500">
          {a.uitvoerder ?? "StiPP"} · aansluitnummer {a.aansluitnummer ?? <span className="text-crit">ontbreekt</span>}
        </span>
        <span className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={async () => {
              setBusy("gen");
              setMsg(null);
              try {
                const r = await fetch("/api/admin/pensioen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ period }) });
                if (!r.ok) throw new Error("mislukt");
                setMsg("Aangifte opnieuw opgebouwd uit de loonstroken.");
                load(period ?? undefined);
              } finally {
                setBusy(null);
              }
            }}
            className="rounded-full border border-hairstrong px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper-soft disabled:opacity-50"
          >
            {busy === "gen" ? "Bezig…" : "Opnieuw opbouwen"}
          </button>
          <a href={`/api/admin/pensioen/${period}/export`} className="rounded-full border border-hairstrong px-3 py-1.5 text-xs font-semibold text-ink hover:bg-paper-soft">
            Download CSV
          </a>
          <button
            type="button"
            disabled={busy !== null || a.lines.length === 0}
            onClick={async () => {
              if (!window.confirm(`Aangifte ${a.label} leveren aan StiPP?`)) return;
              setBusy("deliver");
              setMsg(null);
              try {
                const r = await fetch(`/api/admin/pensioen/${period}/deliver`, { method: "POST" });
                const res = await r.json();
                setMsg(res.detail ?? (r.ok ? "Geleverd." : "Niet geleverd."));
                load(period ?? undefined);
              } finally {
                setBusy(null);
              }
            }}
            className="btn-primary px-4 py-1.5 text-xs disabled:opacity-50"
          >
            {busy === "deliver" ? "Leveren…" : "Leveren aan StiPP"}
          </button>
        </span>
      </div>

      {!d.deliveryConfigured && (
        <p className="rounded-lg bg-paper-soft px-4 py-3 text-xs text-neutralx-700">
          Nog geen automatisch leverkanaal. Zet <code>STIPP_AANSLUITNUMMER</code>, <code>STIPP_UPA_ENDPOINT</code> en <code>STIPP_UPA_TOKEN</code> in de omgeving, of download de CSV en lever die in het StiPP/APG-portaal. Zodra het kanaal er is, gaat de maandelijkse levering vanzelf (1e van de maand).
        </p>
      )}
      {msg && <p className="rounded-lg bg-brand-50 px-4 py-2 text-sm text-brand-800">{msg}</p>}
      {a.leveringDetail && <p className="text-xs text-neutralx-500">Laatste levering: {a.leveringDetail}</p>}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Werknemers", String(a.totals.werknemers)],
          ["Pensioengevend loon", eur(a.totals.pensioengevendLoonCents)],
          ["Premie werkgever", eur(a.totals.werkgeverPremieCents)],
          ["Premie totaal", eur(a.totals.totaalPremieCents)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-hair bg-white px-4 py-3">
            <p className="text-xs text-neutralx-500">{k}</p>
            <p className="font-display text-lg font-bold text-ink">{v}</p>
          </div>
        ))}
      </div>

      {a.totals.incompleet > 0 && (
        <p className="rounded-lg bg-crit/10 px-4 py-2 text-sm text-crit">
          {a.totals.incompleet} werknemer(s) hebben nog ontbrekende gegevens (vaak de BSN). Die regels kunnen niet geleverd worden tot ze compleet zijn.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-hair bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs text-neutralx-500">
            <tr>
              <th className="px-4 py-2 font-medium">Naam</th>
              <th className="px-4 py-2 font-medium">BSN</th>
              <th className="px-4 py-2 font-medium">Regeling</th>
              <th className="px-4 py-2 font-medium">Fase</th>
              <th className="px-4 py-2 font-medium">Uren</th>
              <th className="px-4 py-2 font-medium">Pens. loon</th>
              <th className="px-4 py-2 font-medium">Premie wn.</th>
              <th className="px-4 py-2 font-medium">Premie wg.</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hair">
            {a.lines.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-neutralx-500">
                  Geen uitzendkrachten met pensioenopbouw in dit tijdvak.
                </td>
              </tr>
            ) : (
              a.lines.map((l) => (
                <tr key={l.naam} className="align-top">
                  <td className="px-4 py-2 font-medium text-ink">{l.naam}</td>
                  <td className="px-4 py-2 text-xs">{l.bsnOpDossier ? `…${l.bsnLaatste4 ?? ""}` : <span className="text-crit">ontbreekt</span>}</td>
                  <td className="px-4 py-2 capitalize">{l.regeling}</td>
                  <td className="px-4 py-2">{l.fase}</td>
                  <td className="px-4 py-2">{l.uren.toFixed(1).replace(".", ",")}</td>
                  <td className="px-4 py-2">{eur(l.pensioengevendLoonCents)}</td>
                  <td className="px-4 py-2">{eur(l.werknemerPremieCents)}</td>
                  <td className="px-4 py-2">{eur(l.werkgeverPremieCents)}</td>
                  <td className="px-4 py-2 text-xs">{l.compleet ? <span className="text-brand-700">compleet</span> : <span className="text-crit">{l.ontbreekt.join(", ")}</span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
