"use client";

import { useState, type FormEvent } from "react";
import { Card, btn, input } from "@/components/studio/ui";

// Studio → Verdienen: op welk rekeningnummer ZekerFlex de partnervergoeding uitbetaalt.

export function PartnerRekening({ huidig }: { huidig: { iban: string; tenaamstelling: string } | null }) {
  const [iban, setIban] = useState(huidig?.iban ?? "");
  const [naam, setNaam] = useState(huidig?.tenaamstelling ?? "");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [klaar, setKlaar] = useState(false);

  const opslaan = async (e: FormEvent) => {
    e.preventDefault();
    setFout("");
    setKlaar(false);
    setBezig(true);
    try {
      const res = await fetch("/api/werkgever/partner/rekening", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ iban, tenaamstelling: naam }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFout(data?.error?.message ?? "Opslaan is niet gelukt. Probeer het opnieuw.");
        return;
      }
      // de server geeft het rekeningnummer genormaliseerd terug
      setIban(data.rekening?.iban ?? iban);
      setNaam(data.rekening?.tenaamstelling ?? naam);
      setKlaar(true);
    } catch {
      setFout("Geen verbinding. Controleer je internet en probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  };

  return (
    <Card title="Uitbetalen op">
      <form onSubmit={opslaan} className="grid gap-3">
        <label className="grid gap-1.5 text-xs font-semibold text-[#616161]">
          Rekeningnummer (IBAN)
          <input value={iban} onChange={(e) => setIban(e.target.value)} required autoComplete="off" spellCheck={false} placeholder="NL00 BANK 0123 4567 89" className={`${input} font-mono`} />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-[#616161]">
          Naam op de rekening
          <input value={naam} onChange={(e) => setNaam(e.target.value)} required maxLength={70} className={input} />
        </label>
        {fout && (
          <p role="alert" className="text-sm font-semibold text-[#b42318]">
            {fout}
          </p>
        )}
        <p role="status" className="text-sm font-semibold text-[#014b1a]">
          {klaar ? "Opgeslagen. Hierop betalen we je vergoeding uit." : ""}
        </p>
        <div>
          <button type="submit" disabled={bezig} className={btn.primary}>
            {bezig ? "Bezig…" : "Opslaan"}
          </button>
        </div>
      </form>
    </Card>
  );
}
