"use client";

import { useCallback, useEffect, useState } from "react";
import { voorvertoning, type BerichtRij, type Gesprek as GesprekSamenvatting } from "@/lib/rijschool/berichten-lijst";
import { datumKort, tijd } from "@/lib/rijschool/format";
import { amsterdamDayKey } from "@/lib/time/amsterdam";
import { foutVan } from "@/components/rijschool/api";
import { Gesprek } from "@/components/rijschool/Gesprek";
import { Melding, Veld } from "@/components/rijschool/ui";

// Berichten aan de kant van de rijschool (beheer en instructeur-app): de lijst
// met gesprekken en het open gesprek met één leerling (lib/rijschool/berichten.ts).

/** De gesprekken, ongelezen vet met een amber teller, en een gesprek beginnen met een leerling zonder gesprek. */
export function GesprekkenLijst({
  gesprekken,
  kandidaten,
  focus,
  onFocus,
  leeg,
  className = "",
}: {
  gesprekken: GesprekSamenvatting[];
  /** leerlingen met wie je een nieuw gesprek kunt beginnen */
  kandidaten: { id: string; naam: string }[];
  focus: string | null;
  onFocus: (leerlingId: string) => void;
  leeg: string;
  className?: string;
}) {
  const [nieuw, setNieuw] = useState("");
  const vandaag = amsterdamDayKey(new Date());
  const metGesprek = new Set(gesprekken.map((g) => g.leerlingId));
  const zonderGesprek = kandidaten.filter((l) => !metGesprek.has(l.id)).sort((a, b) => a.naam.localeCompare(b.naam, "nl"));

  return (
    <section className={`card p-4 ${className}`} aria-labelledby="gesprekken-kop">
      <h2 id="gesprekken-kop" className="font-display text-lg font-bold text-ink">
        Gesprekken
      </h2>
      {gesprekken.length === 0 ? (
        <p className="mt-2 text-sm text-neutralx-600">{leeg}</p>
      ) : (
        <ul className="mt-2 divide-y divide-hair">
          {gesprekken.map((g) => (
            <li key={g.leerlingId}>
              <button
                type="button"
                onClick={() => onFocus(g.leerlingId)}
                aria-current={focus === g.leerlingId ? "true" : undefined}
                className={`flex w-full items-start gap-3 rounded-lg px-2 py-3 text-left hover:bg-paper-soft ${focus === g.leerlingId ? "bg-paper-soft" : ""}`}
              >
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-sm text-ink ${g.ongelezen > 0 ? "font-bold" : "font-semibold"}`}>{g.leerlingNaam}</span>
                  <span className="block truncate text-xs text-neutralx-600">
                    {g.laatste.vanLeerling ? "" : "Jij: "}
                    {voorvertoning(g.laatste.tekst, 70)}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <span className="num text-[0.7rem] text-neutralx-500">{amsterdamDayKey(g.laatste.at) === vandaag ? tijd(g.laatste.at) : datumKort(g.laatste.at)}</span>
                  {g.ongelezen > 0 && <span className="pill-warn !px-2 !py-0 text-[0.7rem]">{g.ongelezen} nieuw</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {zonderGesprek.length > 0 && (
        <form
          className="mt-4 flex items-end gap-2 border-t border-hair pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (nieuw) onFocus(nieuw);
          }}
        >
          <div className="min-w-0 flex-1">
            <Veld label="Nieuw gesprek met">
              <select className="field-input" value={nieuw} onChange={(e) => setNieuw(e.target.value)}>
                <option value="">Kies een leerling</option>
                {zonderGesprek.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.naam}
                  </option>
                ))}
              </select>
            </Veld>
          </div>
          <button type="submit" className="btn-ghost" disabled={!nieuw}>
            Openen
          </button>
        </form>
      )}
    </section>
  );
}

/**
 * Het open gesprek met één leerling: laden, elke 30 seconden verversen zolang het
 * scherm zichtbaar is, wat de leerling stuurde als gelezen markeren, en antwoorden.
 * Geef stabiele functies mee (useCallback), anders laadt het paneel bij elke weergave opnieuw.
 */
export function GesprekPaneel({
  leerlingNaam,
  uitleg,
  kleur,
  laad,
  verstuur,
  gelezen,
  onTerug,
  terugAltijd = false,
}: {
  leerlingNaam: string;
  /** korte regel onder de naam: hoe de leerling het bericht krijgt */
  uitleg: string;
  kleur: string;
  laad: () => Promise<BerichtRij[]>;
  /** een bericht namens de school; gooit bij een fout */
  verstuur: (tekst: string) => Promise<void>;
  /** wat de leerling stuurde als gelezen markeren */
  gelezen: () => Promise<void>;
  onTerug: () => void;
  /** terugknop ook op een breed scherm (instructeur-app) */
  terugAltijd?: boolean;
}) {
  const [berichten, setBerichten] = useState<BerichtRij[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const ververs = useCallback(async () => {
    try {
      const lijst = await laad();
      setBerichten(lijst);
      setFout(null);
      if (lijst.some((b) => b.vanLeerling && !b.gelezen)) await gelezen().catch(() => undefined);
    } catch (e) {
      setFout(foutVan(e));
    }
  }, [laad, gelezen]);

  useEffect(() => {
    void ververs();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void ververs();
    }, 30_000);
    return () => clearInterval(t);
  }, [ververs]);

  async function stuurEnLaad(tekst: string) {
    try {
      await verstuur(tekst);
    } catch (e) {
      throw new Error(foutVan(e));
    }
    await ververs();
  }

  return (
    <section className="card p-4 sm:p-5" aria-labelledby="gesprek-kop">
      <button type="button" className={`mb-2 text-sm font-semibold text-brand-600 hover:underline ${terugAltijd ? "" : "lg:hidden"}`} onClick={onTerug}>
        ← Alle gesprekken
      </button>
      <h2 id="gesprek-kop" className="font-display text-lg font-bold text-ink">
        {leerlingNaam}
      </h2>
      <p className="mb-3 text-xs text-neutralx-500">{uitleg}</p>
      <Melding fout={fout} />
      {berichten === null ? (
        !fout && <p className="text-sm text-neutralx-500">Laden…</p>
      ) : (
        <Gesprek
          berichten={berichten}
          eigen="school"
          kleur={kleur}
          naamAnder={leerlingNaam}
          leeg={`Nog geen berichten met ${leerlingNaam}. Schrijf hieronder het eerste bericht.`}
          onStuur={stuurEnLaad}
        />
      )}
    </section>
  );
}

/** Hoe de leerling een bericht krijgt, voor onder de naam in het gesprek. */
export function bezorgUitleg(l: { email: string; heeftWachtwoord: boolean }): string {
  return l.heeftWachtwoord
    ? "Krijgt een mail bij een nieuw bericht en antwoordt in de app."
    : `Heeft de app nog niet in gebruik: je bericht komt per mail binnen (${l.email}).`;
}
