"use client";

import { useState, type FormEvent } from "react";
import { ACTIVITEITEN, CONTACT, DOELGROEPEN, THEMAFEESTEN } from "@/lib/voorstel/schwarzwald";

// Aanvraagformulier voor groepen. Er is (nog) geen eigen backend: het formulier
// zet de aanvraag netjes in een e-mail aan info@. Direct boeken gaat via hun
// bestaande reserveringssysteem (Stackbase), dat staat ernaast.

const VELD = "mt-1.5 w-full rounded-2xl border-0 bg-white px-4 py-3.5 text-schw-night ring-1 ring-schw-night/15 focus:outline-none focus:ring-2 focus:ring-schw-orange";
const LABEL = "text-sm font-semibold text-schw-night";

export function ReserveerAanvraag({ activiteit = "", thema = "", voor = "" }: { activiteit?: string; thema?: string; voor?: string }) {
  const [programma, setProgramma] = useState(activiteit ? `a:${activiteit}` : thema ? `t:${thema}` : "");
  const [gelegenheid, setGelegenheid] = useState(voor);
  const [datum, setDatum] = useState("");
  const [aantal, setAantal] = useState("");
  const [naam, setNaam] = useState("");
  const [telefoon, setTelefoon] = useState("");
  const [klaar, setKlaar] = useState(false);

  const programmaNaam =
    ACTIVITEITEN.find((a) => `a:${a.slug}` === programma)?.naam ?? THEMAFEESTEN.find((t) => `t:${t.slug}` === programma)?.naam ?? "Nog niet gekozen";
  const gelegenheidNaam = DOELGROEPEN.find((d) => d.slug === gelegenheid)?.naam ?? "Anders";

  function verstuur(e: FormEvent) {
    e.preventDefault();
    const body = [
      `Naam: ${naam}`,
      `Telefoon: ${telefoon}`,
      `Gelegenheid: ${gelegenheidNaam}`,
      `Activiteit of feest: ${programmaNaam}`,
      `Datum: ${datum || "nog flexibel"}`,
      `Aantal personen: ${aantal}`,
    ].join("\n");
    const onderwerp = `Aanvraag ${gelegenheidNaam.toLowerCase()} voor ${aantal} personen`;
    window.location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent(onderwerp)}&body=${encodeURIComponent(body)}`;
    setKlaar(true);
  }

  return (
    <form onSubmit={verstuur} className="rounded-xl3 bg-schw-sand p-6 sm:p-8">
      <h2 className="font-display text-2xl font-bold">Vraag een voorstel aan</h2>
      <p className="mt-1 text-schw-mute">Vertel wat jullie zoeken, dan stellen wij een programma op maat voor.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={LABEL}>Wat willen jullie doen?</span>
          <select value={programma} onChange={(e) => setProgramma(e.target.value)} className={VELD}>
            <option value="">Weet ik nog niet, adviseer ons</option>
            <optgroup label="Activiteiten">
              {ACTIVITEITEN.map((a) => (
                <option key={a.slug} value={`a:${a.slug}`}>
                  {a.naam}
                </option>
              ))}
            </optgroup>
            <optgroup label="Themafeesten">
              {THEMAFEESTEN.map((t) => (
                <option key={t.slug} value={`t:${t.slug}`}>
                  {t.naam}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Gelegenheid</span>
          <select value={gelegenheid} onChange={(e) => setGelegenheid(e.target.value)} className={VELD}>
            <option value="">Anders</option>
            {DOELGROEPEN.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.naam}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Aantal personen</span>
          <input type="number" inputMode="numeric" min={2} max={500} required value={aantal} onChange={(e) => setAantal(e.target.value)} className={VELD} />
        </label>
        <label className="block">
          <span className={LABEL}>Datum (mag ook later)</span>
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className={VELD} />
        </label>
        <label className="block">
          <span className={LABEL}>Je naam</span>
          <input type="text" autoComplete="name" required value={naam} onChange={(e) => setNaam(e.target.value)} className={VELD} />
        </label>
        <label className="block sm:col-span-2">
          <span className={LABEL}>Telefoonnummer</span>
          <input type="tel" autoComplete="tel" required value={telefoon} onChange={(e) => setTelefoon(e.target.value)} className={VELD} />
        </label>
      </div>
      <button type="submit" className="mt-6 w-full rounded-full bg-schw-orange py-4 font-bold text-schw-night transition-transform hover:-translate-y-0.5">
        Verstuur aanvraag
      </button>
      {klaar && (
        <p role="status" className="mt-4 rounded-2xl bg-white p-4 text-sm">
          Je mailprogramma opent met de aanvraag. Opent er niets? Mail naar {CONTACT.email} of bel {CONTACT.telefoon}.
        </p>
      )}
    </form>
  );
}
