"use client";

import { useState, type FormEvent } from "react";
import { AButton } from "@/components/admin/ui";
import { STRAAL_OPTIES_KM, lijktOpPostcode, type Punt, type StraalKm } from "@/lib/admin/locatie-straal";

export interface GekozenPlek extends Punt {
  label: string;
}

interface ZoekResultaat {
  label: string;
  lat: number;
  lng: number;
  soort: string | null;
}

interface FreelancerLocationFilterProps {
  punt: GekozenPlek | null;
  straalKm: StraalKm;
  /** Aantal flexwerkers binnen de straal van het gekozen punt. */
  treffers: number;
  onPunt: (plek: GekozenPlek | null) => void;
  onStraal: (km: StraalKm) => void;
}

// Zoekt een plaats of postcode via /api/geo/search (PDOK) en meldt het punt
// terug. De straal en het aantal rekent de bovenliggende tabel uit.
export function FreelancerLocationFilter({ punt, straalKm, treffers, onPunt, onStraal }: FreelancerLocationFilterProps) {
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function zoek(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = invoer.trim().replace(/\s+/g, " ");
    if (q.length < 2) {
      setFout("Vul een plaatsnaam of postcode in, bijvoorbeeld Groningen of 9711.");
      return;
    }
    setBezig(true);
    setFout(null);
    try {
      const params = new URLSearchParams({ q });
      // Een postcode zoeken we als adres: dan komt er altijd een postcode mee terug.
      if (lijktOpPostcode(q)) params.set("soort", "adres");
      const res = await fetch(`/api/geo/search?${params.toString()}`);
      const data = (await res.json()) as { results?: ZoekResultaat[] };
      const lijst = data.results ?? [];
      // Bij een gewone plaatsnaam ("Groningen") liever de woonplaats dan een straat met die naam.
      const woonplaats = lijst.find((r) => r.soort === "woonplaats");
      const gekozen = (!/\d/.test(q) && woonplaats) || lijst[0];
      if (!gekozen) {
        setFout(`Geen plaats of postcode gevonden voor "${q}".`);
        onPunt(null);
        return;
      }
      onPunt({ label: gekozen.label, lat: gekozen.lat, lon: gekozen.lng });
    } catch {
      setFout("Zoeken lukt nu niet. Probeer het zo nog eens.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="w-full space-y-2.5">
      <form onSubmit={zoek} role="search" className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <label htmlFor="flexwerker-locatie" className="mb-1 block text-xs font-medium" style={{ color: "var(--a-mute)" }}>
            Plaats of postcode
          </label>
          <input
            id="flexwerker-locatie"
            type="text"
            autoComplete="off"
            placeholder="Bijv. Groningen of 9711"
            value={invoer}
            onChange={(e) => setInvoer(e.target.value)}
            className="a-input !py-1.5 text-[0.8125rem]"
          />
        </div>
        <AButton type="submit">{bezig ? "Zoeken..." : "Zoeken"}</AButton>
      </form>

      <div role="group" aria-label="Straal" className="flex flex-wrap items-center gap-1">
        <span className="mr-1 text-xs" style={{ color: "var(--a-mute)" }}>Straal</span>
        {STRAAL_OPTIES_KM.map((km) => (
          <AButton key={km} variant={km === straalKm ? "primary" : "ghost"} onClick={() => onStraal(km)}>
            {km} km
          </AButton>
        ))}
      </div>

      <div aria-live="polite" className="text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
        {punt ? (
          <>
            <span className="num font-semibold" style={{ color: "var(--a-text)" }}>{treffers}</span>{" "}
            {treffers === 1 ? "flexwerker" : "flexwerkers"} binnen {straalKm} km van {punt.label}.{" "}
            <button type="button" onClick={() => onPunt(null)} className="underline underline-offset-2" style={{ color: "var(--a-mute)" }}>
              Wis locatie
            </button>
          </>
        ) : (
          "Zoek een plaats of postcode om te zien hoeveel flexwerkers er in de buurt wonen."
        )}
      </div>

      {fout && (
        <p role="alert" className="text-[0.8125rem]" style={{ color: "var(--a-crit)" }}>
          {fout}
        </p>
      )}
    </div>
  );
}
