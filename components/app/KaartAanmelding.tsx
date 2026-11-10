"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PLEK_SOORTEN, type Aanmelding } from "@/lib/kaart/aanmelden";

// Het formulier waarmee een bedrijf zichzelf op ZekerFlex Kaart zet. Alles wat je invult is openbaar zodra
// ZekerFlex het goedkeurt. Een wijziging gaat opnieuw naar ZekerFlex.

const STATUS: Record<Aanmelding["status"], { titel: string; tekst: string; klas: string }> = {
  wacht: { titel: "Wacht op goedkeuring", tekst: "ZekerFlex kijkt je gegevens na, meestal binnen een paar werkdagen. Daarna staat je bedrijf op de kaart.", klas: "bg-warn/10 text-warn" },
  goedgekeurd: { titel: "Je staat op de kaart", tekst: "Je bedrijf is goedgekeurd en staat als oranje stip op ZekerFlex Kaart. Pas je iets aan, dan kijkt ZekerFlex opnieuw mee.", klas: "bg-ok/10 text-ok" },
  afgewezen: { titel: "Niet goedgekeurd", tekst: "", klas: "bg-crit/10 text-crit" },
};

export function KaartAanmeldingForm({ begin }: { begin: Aanmelding | null }) {
  const router = useRouter();
  const [naam, setNaam] = useState(begin?.naam ?? "");
  const [soort, setSoort] = useState<string>(begin?.soort ?? "");
  const [adres, setAdres] = useState(begin?.adres ?? "");
  const [website, setWebsite] = useState(begin?.website ?? "");
  const [omschrijving, setOmschrijving] = useState(begin?.omschrijving ?? "");
  const [telefoon, setTelefoon] = useState(begin?.telefoon ?? "");
  const [toestemming, setToestemming] = useState(Boolean(begin?.telefoon));
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [gedaan, setGedaan] = useState(false);
  const [stand, setStand] = useState<Aanmelding | null>(begin);

  async function verstuur(e: React.FormEvent) {
    e.preventDefault();
    if (bezig) return;
    setBezig(true);
    setFout(null);
    setGedaan(false);
    try {
      const res = await fetch("/api/werkgever/kaart", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ naam, soort, adres, website, omschrijving, telefoon, toestemming }),
      });
      const d = (await res.json().catch(() => null)) as { aanmelding?: Aanmelding; error?: { message?: string } } | null;
      if (!res.ok || !d?.aanmelding) {
        setFout(d?.error?.message ?? "Opslaan lukte niet. Probeer het opnieuw.");
        return;
      }
      setStand(d.aanmelding);
      setGedaan(true);
      router.refresh();
    } catch {
      setFout("Opslaan lukte niet. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }

  const s = stand ? STATUS[stand.status] : null;

  return (
    <div className="space-y-5">
      {s && stand && (
        <div role="status" className={`rounded-xl px-4 py-3 text-sm ${s.klas}`}>
          <p className="font-semibold">{s.titel}</p>
          <p className="mt-0.5">{stand.status === "afgewezen" ? `${stand.reden || "Er klopte iets niet."} Pas het aan en dien opnieuw in.` : s.tekst}</p>
        </div>
      )}
      <form onSubmit={(e) => void verstuur(e)} className="space-y-4">
        {fout && <p role="alert" className="rounded-lg bg-crit/10 px-3 py-2.5 text-sm text-crit">{fout}</p>}
        {gedaan && <p role="status" className="rounded-lg bg-ok/10 px-3 py-2.5 text-sm text-ok">Opgeslagen. ZekerFlex kijkt je gegevens na.</p>}
        <label className="block">
          <span className="field-label">Naam van je bedrijf</span>
          <input value={naam} onChange={(e) => setNaam(e.target.value)} required maxLength={80} className="field-input" />
        </label>
        <label className="block">
          <span className="field-label">Wat voor bedrijf is het?</span>
          <select value={soort} onChange={(e) => setSoort(e.target.value)} required className="field-input">
            <option value="" disabled>Kies een soort</option>
            {PLEK_SOORTEN.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Adres</span>
          <input value={adres} onChange={(e) => setAdres(e.target.value)} required placeholder="Straat 1, 1234 AB Plaats" className="field-input" />
          <span className="mt-1 block text-xs text-neutralx-500">We zoeken het adres op bij de gratis adressenlijst van de overheid (PDOK).</span>
        </label>
        <label className="block">
          <span className="field-label">Website (niet verplicht)</span>
          <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://jouwbedrijf.nl" inputMode="url" className="field-input" />
        </label>
        <label className="block">
          <span className="field-label">Korte omschrijving (niet verplicht)</span>
          <textarea value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} maxLength={200} rows={3} className="field-input" />
          <span className="mt-1 block text-xs text-neutralx-500">{omschrijving.length} van 200 tekens. Alleen tekst, geen links.</span>
        </label>
        <label className="block">
          <span className="field-label">Telefoonnummer (niet verplicht)</span>
          <input value={telefoon} onChange={(e) => setTelefoon(e.target.value)} inputMode="tel" className="field-input" />
        </label>
        {telefoon.trim() && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={toestemming} onChange={(e) => setToestemming(e.target.checked)} className="mt-1" />
            <span>Ik wil dat dit telefoonnummer openbaar op de kaart staat.</span>
          </label>
        )}
        <p className="text-xs text-neutralx-500">
          Alles wat je hier invult, komt openbaar op de kaart zodra ZekerFlex het goedkeurt. Zet er geen persoonsgegevens in die niet openbaar mogen zijn. Foto&apos;s toevoegen kan later.
        </p>
        <button type="submit" disabled={bezig} className="btn-primary disabled:opacity-60">
          {bezig ? "Bezig…" : stand ? "Wijzigingen indienen" : "Zet mijn bedrijf op de kaart"}
        </button>
      </form>
    </div>
  );
}
