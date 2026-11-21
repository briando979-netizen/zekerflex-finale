"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import type { BureauGegevens, Cao, Keurmerk } from "@/lib/uitzend/bureau-kern";

/**
 * Bureaugegevens van een uitzendpartner (/werkgever/uitzend/bureau → POST /api/werkgever/uitzend/bureau). Na het opslaan neemt
 * het formulier de bewaarde versie van de server over (het akkoord krijgt daar datum en account), en ververst de pagina de
 * meldingen erboven. Tekst: uitzendBureau.form in het werkgeverswoordenboek; de partnervoorwaarden zelf blijven Nederlands.
 */
export function BureauGegevensForm({ begin, versie, voorwaardenPad }: { begin: BureauGegevens; versie: string; voorwaardenPad: string }) {
  const u = useT().uitzendBureau;
  const f = u.form;
  const router = useRouter();
  const [g, setG] = useState<BureauGegevens>(begin);
  const [akkoord, setAkkoord] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [opgeslagen, setOpgeslagen] = useState(false);
  const alAkkoord = g.akkoord?.versie === versie;

  async function opslaan(e: React.FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout(null);
    setOpgeslagen(false);
    const r = await fetch("/api/werkgever/uitzend/bureau", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uitlener: g.uitlener,
        keurmerk: g.keurmerk,
        keurmerkTot: g.keurmerk === "geen" ? null : g.keurmerkTot || null,
        cao: g.cao,
        verzekeringTot: g.verzekeringTot || null,
        loonheffingennummer: g.loonheffingennummer,
        akkoord,
      }),
    }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { gegevens?: BureauGegevens; error?: { message?: string } } | null;
    if (r?.ok && d?.gegevens) {
      setG(d.gegevens);
      setAkkoord(false);
      setOpgeslagen(true);
      router.refresh();
    } else {
      setFout(d?.error?.message ?? f.opslaanMislukt);
    }
    setBezig(false);
  }

  const akkoordDatum = g.akkoord ? new Date(g.akkoord.op).toLocaleDateString(u.intl, { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }) : "";

  return (
    <form onSubmit={(e) => void opslaan(e)} className="space-y-5 text-sm">
      <label className="flex items-start gap-3">
        <input type="checkbox" className="mt-0.5" checked={g.uitlener} onChange={(e) => setG({ ...g, uitlener: e.target.checked })} />
        <span>
          <span className="font-medium text-ink">{f.uitlener}</span>
          <span className="block text-neutralx-500">{f.uitlenerUitleg}</span>
        </span>
      </label>

      <fieldset>
        <legend className="font-medium text-ink">{f.keurmerk}</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {(
            [
              ["sna", f.keurmerkSna],
              ["wtta", f.keurmerkWtta],
              ["geen", f.keurmerkGeen],
            ] as const satisfies readonly (readonly [Keurmerk, string])[]
          ).map(([waarde, label]) => (
            <label key={waarde} className="inline-flex items-center gap-2">
              <input type="radio" name="keurmerk" value={waarde} checked={g.keurmerk === waarde} onChange={() => setG({ ...g, keurmerk: waarde })} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      {g.keurmerk !== "geen" && (
        <label className="block max-w-xs">
          <span className="font-medium text-ink">{g.keurmerk === "sna" ? f.snaTot : f.wttaTot}</span>
          <input type="date" className="field-input mt-1 w-full" value={g.keurmerkTot ?? ""} onChange={(e) => setG({ ...g, keurmerkTot: e.target.value || null })} />
        </label>
      )}

      <label className="block max-w-xs">
        <span className="font-medium text-ink">{f.cao}</span>
        <select className="field-input mt-1 w-full" value={g.cao} onChange={(e) => setG({ ...g, cao: e.target.value as Cao })}>
          <option value="">{f.caoKies}</option>
          <option value="abu">{f.caoAbu}</option>
          <option value="nbbu">{f.caoNbbu}</option>
          <option value="anders">{f.caoAnders}</option>
        </select>
      </label>

      <label className="block max-w-xs">
        <span className="font-medium text-ink">{f.verzekeringTot}</span>
        <input type="date" className="field-input mt-1 w-full" value={g.verzekeringTot ?? ""} onChange={(e) => setG({ ...g, verzekeringTot: e.target.value || null })} />
      </label>

      <label className="block max-w-xs">
        <span className="font-medium text-ink">{f.loonheffingennummer}</span>
        <input
          type="text"
          className="field-input mt-1 w-full"
          maxLength={20}
          placeholder="123456789L01"
          value={g.loonheffingennummer}
          onChange={(e) => setG({ ...g, loonheffingennummer: e.target.value })}
        />
      </label>

      <div className="rounded-xl border border-hair bg-paper-soft p-4">
        {alAkkoord ? (
          <p className="text-neutralx-700">{fmt(f.akkoordGegeven, { versie, datum: akkoordDatum })}</p>
        ) : (
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-0.5" checked={akkoord} onChange={(e) => setAkkoord(e.target.checked)} />
            <span className="text-neutralx-700">
              {f.akkoordVoor}{" "}
              <a href={voorwaardenPad} target="_blank" rel="noopener" className="font-medium text-brand-600 underline">
                {fmt(f.akkoordLink, { versie })}
              </a>{" "}
              {f.akkoordNa}
            </span>
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className="btn-primary" disabled={bezig}>
          {bezig ? f.bezig : f.opslaan}
        </button>
        {opgeslagen && <span className="text-ok">{f.opgeslagen}</span>}
      </div>
      {fout && (
        <p role="alert" className="text-crit">
          {fout}
        </p>
      )}
    </form>
  );
}
