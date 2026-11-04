"use client";

import { useEffect, useState, type FormEvent } from "react";
import { plusDagen } from "@/lib/horeca/reserveren";

// Online een tafel reserveren: kies dag en aantal personen, dan een vrije tijd
// (live opgehaald), dan je gegevens. De server controleert alles opnieuw.

const dagTekst = (d: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const VELD = "mt-1.5 w-full rounded-2xl border-0 bg-white px-4 py-3 text-[#0A120E] ring-1 ring-[#0A120E]/15 focus:outline-none focus:ring-2 focus:ring-[var(--rs-kleur)]";

export function ReserveerFormulier({ slug, vandaag, maxGroep, dagenVooruit, telefoon }: { slug: string; vandaag: string; maxGroep: number; dagenVooruit: number; telefoon: string }) {
  const [datum, setDatum] = useState(vandaag);
  const [personen, setPersonen] = useState(Math.min(2, maxGroep));
  const [tijden, setTijden] = useState<{ tijd: string; vrij: boolean }[] | null>(null);
  const [tijd, setTijd] = useState("");
  const [g, setG] = useState({ naam: "", email: "", telefoon: "", opmerking: "" });
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [klaar, setKlaar] = useState<{ datum: string; tijd: string; personen: number } | null>(null);

  useEffect(() => {
    let weg = false;
    setTijden(null);
    setTijd("");
    void fetch(`/api/horeca/site/${slug}/beschikbaar?datum=${datum}&personen=${personen}`, { cache: "no-store" })
      .then(async (r) => ((await r.json()) as { tijden?: { tijd: string; vrij: boolean }[]; error?: { message?: string } }))
      .then((d) => {
        if (weg) return;
        setTijden(d.tijden ?? []);
        setFout(d.tijden ? "" : (d.error?.message ?? "Tijden ophalen lukte niet."));
      })
      .catch(() => !weg && setFout("Tijden ophalen lukte niet."));
    return () => {
      weg = true;
    };
  }, [slug, datum, personen]);

  async function reserveer(e: FormEvent) {
    e.preventDefault();
    if (!tijd) return setFout("Kies eerst een tijd.");
    setBezig(true);
    setFout("");
    try {
      const r = await fetch(`/api/horeca/site/${slug}/reserveren`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ datum, tijd, personen, ...g }) });
      const d = (await r.json().catch(() => ({}))) as { datum?: string; tijd?: string; personen?: number; error?: { message?: string } };
      if (!r.ok || !d.datum || !d.tijd) throw new Error(d.error?.message ?? "Reserveren lukte niet.");
      setKlaar({ datum: d.datum, tijd: d.tijd, personen: d.personen ?? personen });
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Reserveren lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  if (klaar) {
    return (
      <div role="status" className="rounded-[1.75rem] bg-[var(--rs-nacht)] p-7 text-[var(--rs-creme)]">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--rs-accent-op-nacht)]">Gereserveerd</p>
        <h2 className="mt-2 font-display text-3xl font-bold">Tot dan!</h2>
        <p className="mt-3 text-lg">
          Je tafel staat klaar op {dagTekst(klaar.datum)} om {klaar.tijd} uur voor {klaar.personen} {klaar.personen === 1 ? "persoon" : "personen"}.
        </p>
        <p className="mt-2 text-[var(--rs-creme)]/80">Kun je toch niet? Laat het ons even weten{telefoon ? ` via ${telefoon}` : ""}.</p>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void reserveer(e)} className="space-y-6 rounded-[1.75rem] bg-white p-6 shadow-[0_1px_2px_rgba(10,18,14,0.06)] sm:p-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Dag
          <input type="date" className={VELD} value={datum} min={vandaag} max={plusDagen(vandaag, dagenVooruit)} onChange={(e) => e.target.value && setDatum(e.target.value)} required />
        </label>
        <label className="block text-sm font-semibold">
          Aantal personen
          <select className={VELD} value={personen} onChange={(e) => setPersonen(Number(e.target.value))}>
            {Array.from({ length: maxGroep }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "persoon" : "personen"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-[#4B5563]">Met meer dan {maxGroep} personen? Bel ons{telefoon ? ` op ${telefoon}` : ""}, dan regelen we het samen.</p>

      <fieldset>
        <legend className="text-sm font-semibold">Tijd op {dagTekst(datum)}</legend>
        {tijden === null && <p className="mt-2 text-sm text-[#4B5563]">Tijden laden…</p>}
        {tijden && tijden.length === 0 && <p className="mt-2 text-sm text-[#4B5563]">Op deze dag kun je niet (meer) online reserveren. Kies een andere dag.</p>}
        {tijden && tijden.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {tijden.map((t) => (
              <label key={t.tijd} className={`cursor-pointer rounded-full px-4 py-2 text-sm font-semibold ring-1 ${!t.vrij ? "cursor-not-allowed text-[#4B5563] line-through ring-[#0A120E]/10" : tijd === t.tijd ? "bg-[var(--rs-kleur-knop)] text-[var(--rs-op-kleur)] ring-transparent" : "ring-[#0A120E]/20"}`}>
                <input type="radio" name="tijd" value={t.tijd} className="sr-only" disabled={!t.vrij} checked={tijd === t.tijd} onChange={() => setTijd(t.tijd)} />
                {t.tijd}
                {!t.vrij && <span className="sr-only"> (vol)</span>}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Naam
          <input className={VELD} autoComplete="name" value={g.naam} onChange={(e) => setG({ ...g, naam: e.target.value })} required minLength={2} maxLength={80} />
        </label>
        <label className="block text-sm font-semibold">
          Telefoon
          <input className={VELD} type="tel" autoComplete="tel" value={g.telefoon} onChange={(e) => setG({ ...g, telefoon: e.target.value })} required minLength={6} maxLength={40} />
        </label>
        <label className="block text-sm font-semibold sm:col-span-2">
          E-mailadres
          <input className={VELD} type="email" autoComplete="email" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} required maxLength={200} />
        </label>
        <label className="block text-sm font-semibold sm:col-span-2">
          Opmerking (mag leeg)
          <input className={VELD} value={g.opmerking} onChange={(e) => setG({ ...g, opmerking: e.target.value })} maxLength={500} placeholder="Bijvoorbeeld: verjaardag, kinderstoel" />
        </label>
      </div>
      {fout && (
        <p role="alert" className="rounded-2xl bg-[#FDE2E2] p-3 text-sm font-semibold text-[#B91C1C]">
          {fout}
        </p>
      )}
      <button type="submit" disabled={bezig} className="w-full rounded-full bg-[var(--rs-accent-knop)] py-4 font-bold text-[var(--rs-op-accent)] disabled:opacity-60">
        {bezig ? "Bezig…" : tijd ? `Reserveer om ${tijd}` : "Reserveer"}
      </button>
      <p className="text-xs text-[#4B5563]">
        We gebruiken je gegevens alleen voor deze reservering. Na 12 maanden wissen we je naam, e-mailadres, telefoonnummer en opmerking.
      </p>
    </form>
  );
}
