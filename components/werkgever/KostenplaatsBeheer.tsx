"use client";

import { useState, type FormEvent } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";
import { InstellingenKop } from "@/components/werkgever/InstellingenKop";
import { LijstTabel } from "@/components/werkgever/LijstTabel";
import { Dialoog } from "@/components/werkgever/Dialoog";

// Instellingen → Kostenplaatsen (naar YoungOnes, 23 nov 2026): de lijst, "Nieuwe kostenplaats" rechtsboven in de kop, en een dialoog
// met één veld voor toevoegen en wijzigen. Een kostenplaats die nog bij een vestiging of lopende klus staat kan niet gewijzigd of
// verwijderd worden (regels: lib/werkgever/kostenplaatsen-kern.ts). De server is leidend: na elke wijziging nemen we de teruggegeven
// lijst over (/api/werkgever/kostenplaatsen), geen lokale aanpassing van één regel. De tekst komt uit het woordenboek (Nederlands en Engels).

interface Rij {
  naam: string;
  gebruik: number;
}

type OpenDialoog = { soort: "nieuw" } | { soort: "wijzig"; naam: string } | { soort: "verwijder"; naam: string } | null;

export function KostenplaatsBeheer({ initieel, kanBeheren, max }: { initieel: Rij[]; kanBeheren: boolean; max: number }) {
  const k = useT().kostenplaatsPagina;
  const [rijen, setRijen] = useState<Rij[]>(initieel);
  const [dialoog, setDialoog] = useState<OpenDialoog>(null);
  const [invoer, setInvoer] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);

  const foutTekst = (sleutel: unknown): string => {
    switch (sleutel) {
      case "leeg":
        return k.foutLeeg;
      case "te-lang":
        return k.foutTeLang;
      case "dubbel":
        return k.foutDubbel;
      case "vol":
        return k.foutVol;
      case "onbekend":
        return k.foutOnbekend;
      case "in-gebruik":
        return k.foutInGebruik;
      default:
        return k.foutAlgemeen;
    }
  };

  const gebruikTekst = (n: number) => (n <= 0 ? k.gebruikNiet : n === 1 ? k.gebruikEen : fmt(k.gebruikMeer, { n }));

  const open = (d: Exclude<OpenDialoog, null>) => {
    setInvoer(d.soort === "wijzig" ? d.naam : "");
    setFout(null);
    setMelding(null);
    setDialoog(d);
  };
  const sluit = () => {
    if (!bezig) setDialoog(null);
  };

  async function verstuur(methode: "POST" | "PATCH" | "DELETE", body: Record<string, string>, gedaan: string) {
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch("/api/werkgever/kostenplaatsen", { method: methode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !Array.isArray(d?.kostenplaatsen)) {
        setFout(foutTekst(d?.error?.details?.fout));
        return;
      }
      setRijen(d.kostenplaatsen as Rij[]);
      setMelding(gedaan);
      setDialoog(null);
    } catch {
      setFout(k.foutAlgemeen);
    } finally {
      setBezig(false);
    }
  }

  function opslaan(e: FormEvent) {
    e.preventDefault();
    if (bezig || !dialoog || dialoog.soort === "verwijder") return;
    const naam = invoer.replace(/\s+/g, " ").trim();
    if (dialoog.soort === "nieuw") void verstuur("POST", { naam }, fmt(k.gedaanNieuw, { naam }));
    else void verstuur("PATCH", { naam: dialoog.naam, nieuw: naam }, fmt(k.gedaanWijzig, { naam }));
  }

  const vol = rijen.length >= max;
  const bewerken = dialoog?.soort === "nieuw" || dialoog?.soort === "wijzig";

  return (
    <>
      <InstellingenKop
        title={k.titel}
        subtitle={k.subtitel}
        action={
          kanBeheren ? (
            <button type="button" onClick={() => open({ soort: "nieuw" })} disabled={vol} className="btn-primary min-h-11">
              <span aria-hidden>+</span> {k.nieuw}
            </button>
          ) : undefined
        }
      />

      {melding && (
        <p role="status" className="mb-4 text-sm font-medium text-brand-700">
          {melding}
        </p>
      )}
      {!kanBeheren && <p className="mb-4 text-sm text-neutralx-600">{k.geenBeheer}</p>}

      {/* de lijst als eenvoudige tabel in een witte kaart; leeg is het één regel tekst (components/werkgever/LijstTabel.tsx) */}
      <LijstTabel
        label={k.lijstLabel}
        leeg={kanBeheren ? `${k.geen} ${k.geenUitleg}` : k.geen}
        kolommen={[{ kop: k.veldNaam }, { kop: k.kolomGebruik }]}
        actieKop={kanBeheren ? k.kolomActies : undefined}
        rijen={rijen.map((r) => ({
          id: r.naam,
          cellen: [r.naam, gebruikTekst(r.gebruik) + (r.gebruik > 0 && kanBeheren ? ` ${k.geblokkeerd}` : "")],
          actie: kanBeheren ? (
            <span className="flex flex-wrap gap-2 sm:justify-end">
              <button
                type="button"
                onClick={() => open({ soort: "wijzig", naam: r.naam })}
                disabled={r.gebruik > 0}
                aria-label={fmt(k.wijzigenNaam, { naam: r.naam })}
                className="btn-ghost min-h-11"
              >
                {k.wijzigen}
              </button>
              <button
                type="button"
                onClick={() => open({ soort: "verwijder", naam: r.naam })}
                disabled={r.gebruik > 0}
                aria-label={fmt(k.verwijderenNaam, { naam: r.naam })}
                className="btn-ghost min-h-11"
              >
                {k.verwijderen}
              </button>
            </span>
          ) : undefined,
        }))}
      />

      {/* toevoegen en wijzigen: één veld in een dialoog (focus erin, Escape sluit, tikken ernaast sluit; components/werkgever/Dialoog.tsx) */}
      <Dialoog
        open={bewerken}
        id="kostenplaats"
        titel={dialoog?.soort === "wijzig" ? k.dialoogWijzig : k.dialoogNieuw}
        uitleg={k.dialoogUitleg}
        onSluit={sluit}
        onVerstuur={opslaan}
        acties={
          <>
            <button type="button" onClick={sluit} className="btn-ghost min-h-11">
              {k.annuleren}
            </button>
            <button type="submit" disabled={bezig || invoer.trim() === ""} className="btn-primary min-h-11">
              {bezig ? k.bezig : dialoog?.soort === "wijzig" ? k.opslaan : k.toevoegen}
            </button>
          </>
        }
      >
        <label htmlFor="kostenplaats-naam" className="field-label mt-4">
          {k.veldNaam}
        </label>
        <input
          id="kostenplaats-naam"
          value={invoer}
          onChange={(e) => setInvoer(e.target.value)}
          maxLength={60}
          autoComplete="off"
          placeholder={k.voorbeeld}
          aria-invalid={fout ? true : undefined}
          aria-describedby={fout ? "kostenplaats-fout" : undefined}
          className="field-input"
        />
        {fout && (
          <p id="kostenplaats-fout" role="alert" className="mt-2 text-sm text-crit">
            {fout}
          </p>
        )}
      </Dialoog>

      {/* verwijderen: eerst vragen, met de naam erin; een afgeronde klus houdt zijn kostenplaats */}
      <Dialoog
        open={dialoog?.soort === "verwijder"}
        id="kostenplaats-weg"
        titel={k.verwijderTitel}
        uitleg={dialoog?.soort === "verwijder" ? fmt(k.verwijderVraag, { naam: dialoog.naam }) : undefined}
        onSluit={sluit}
        acties={
          <>
            <button type="button" onClick={sluit} className="btn-ghost min-h-11">
              {k.annuleren}
            </button>
            <button
              type="button"
              disabled={bezig}
              onClick={() => {
                if (dialoog?.soort === "verwijder") void verstuur("DELETE", { naam: dialoog.naam }, fmt(k.gedaanWeg, { naam: dialoog.naam }));
              }}
              className="btn-primary min-h-11"
            >
              {bezig ? k.bezig : k.verwijderKnop}
            </button>
          </>
        }
      >
        {fout && (
          <p role="alert" className="mt-3 text-sm text-crit">
            {fout}
          </p>
        )}
      </Dialoog>
    </>
  );
}
