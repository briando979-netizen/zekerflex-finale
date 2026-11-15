"use client";

import { useState, type FormEvent } from "react";
import { bedragVeld, centVan } from "@/components/rijschool/api";
import { Melding, Schakelaar, Veld } from "@/components/rijschool/ui";
import type { BeheerData, Doe } from "@/components/horeca/beheer/types";
import type { Bezorger } from "@/lib/horeca/bezorgen";

// Afhalen en bezorgen instellen (module bezorgen, lib/horeca/bezorgen.ts): wat
// kan, tot hoe ver, wat het kost en hoe lang het duurt, plus de bezorgers. De
// bestellingen zelf staan bij Bestellingen.

export function BezorgenTab({ data, doe }: { data: BeheerData; doe: Doe }) {
  return (
    <div className="space-y-5">
      <Instellingen data={data} doe={doe} />
      <Bezorgers bezorgers={data.bezorgen.bezorgers} doe={doe} />
    </div>
  );
}

function Instellingen({ data, doe }: { data: BeheerData; doe: Doe }) {
  const b = data.bezorgen;
  const [afhalen, setAfhalen] = useState(b.afhalen);
  const [bezorgen, setBezorgen] = useState(b.bezorgen);
  const [straal, setStraal] = useState(String(b.straalKm).replace(".", ","));
  const [minimum, setMinimum] = useState(bedragVeld(b.minimumCent));
  const [kosten, setKosten] = useState(bedragVeld(b.kostenCent));
  const [gratis, setGratis] = useState(b.gratisVanafCent === null ? "" : bedragVeld(b.gratisVanafCent));
  const [afhaalMin, setAfhaalMin] = useState(String(b.afhaalMinuten));
  const [bezorgMin, setBezorgMin] = useState(String(b.bezorgMinuten));
  const [fout, setFout] = useState<string | null>(null);

  async function bewaar(e: FormEvent) {
    e.preventDefault();
    const straalKm = Number(straal.replace(",", "."));
    const minimumCent = centVan(minimum);
    const kostenCent = centVan(kosten);
    const gratisVanafCent = gratis.trim() ? centVan(gratis) : null;
    if (!Number.isFinite(straalKm) || minimumCent === null || kostenCent === null || (gratis.trim() && gratisVanafCent === null)) {
      setFout("Vul de bedragen en de straal in als getal, bijvoorbeeld 2,50 en 5.");
      return;
    }
    setFout(null);
    await doe(
      { actie: "bezorg-instellingen", afhalen, bezorgen, straalKm, minimumCent, kostenCent, gratisVanafCent, afhaalMinuten: Number(afhaalMin), bezorgMinuten: Number(bezorgMin) },
      "Afhalen en bezorgen is bijgewerkt.",
    );
  }

  return (
    <form onSubmit={(e) => void bewaar(e)} className="card space-y-4 p-5" aria-labelledby="bezorg-instellingen-kop">
      <div>
        <h2 id="bezorg-instellingen-kop" className="font-display text-lg font-bold text-ink">
          Afhalen en bezorgen
        </h2>
        <p className="mt-1 text-sm text-neutralx-600">Telefonische bestellingen voer je in bij Bestellingen. Daar bevestig je ook de tijd, wijs je een bezorger toe en meld je afgeleverd.</p>
      </div>
      {!b.ligging && (
        <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-ink">
          We konden het adres van de zaak nog niet vinden. Vul straat, huisnummer en plaats in bij Gegevens: de straal en de afstand tot de klant rekenen vanaf daar.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Schakelaar label="Afhalen" aan={afhalen} onChange={setAfhalen} uitleg="De klant haalt de bestelling zelf op." />
        <Schakelaar label="Bezorgen" aan={bezorgen} onChange={setBezorgen} uitleg="Wij brengen de bestelling naar de klant." />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Veld label="Bezorgen tot (km)" uitleg="Over de weg, vanaf de zaak.">
          <input className="field-input" inputMode="decimal" value={straal} onChange={(e) => setStraal(e.target.value)} />
        </Veld>
        <Veld label="Minimaal bestelbedrag (€)" uitleg="Voor bezorgen, zonder bezorgkosten.">
          <input className="field-input" inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} />
        </Veld>
        <Veld label="Bezorgkosten (€)">
          <input className="field-input" inputMode="decimal" value={kosten} onChange={(e) => setKosten(e.target.value)} />
        </Veld>
        <Veld label="Gratis bezorgd vanaf (€)" uitleg="Leeg laten = altijd bezorgkosten.">
          <input className="field-input" inputMode="decimal" value={gratis} onChange={(e) => setGratis(e.target.value)} />
        </Veld>
        <Veld label="Klaar om af te halen na (minuten)">
          <input className="field-input" type="number" min={5} max={180} value={afhaalMin} onChange={(e) => setAfhaalMin(e.target.value)} />
        </Veld>
        <Veld label="Bezorgd na (minuten)" uitleg="Bereiden plus rijden.">
          <input className="field-input" type="number" min={10} max={240} value={bezorgMin} onChange={(e) => setBezorgMin(e.target.value)} />
        </Veld>
      </div>
      <Melding fout={fout} />
      <button type="submit" className="btn-primary">
        Bewaren
      </button>
    </form>
  );
}

function Bezorgers({ bezorgers, doe }: { bezorgers: Bezorger[]; doe: Doe }) {
  const [naam, setNaam] = useState("");
  const [telefoon, setTelefoon] = useState("");

  async function voegToe(e: FormEvent) {
    e.preventDefault();
    if (await doe({ actie: "bezorger", naam, telefoon, actief: true }, `${naam.trim()} staat bij de bezorgers.`)) {
      setNaam("");
      setTelefoon("");
    }
  }

  return (
    <section className="card space-y-4 p-5" aria-labelledby="bezorgers-kop">
      <div>
        <h2 id="bezorgers-kop" className="font-display text-lg font-bold text-ink">
          Bezorgers
        </h2>
        <p className="mt-1 text-sm text-neutralx-600">Wie er rijdt. Bij een bezorging kies je de bezorger; een bezorger die vandaag niet werkt, zet je op niet beschikbaar.</p>
      </div>
      {bezorgers.length === 0 ? (
        <p className="text-sm text-neutralx-500">Nog geen bezorgers.</p>
      ) : (
        <ul className="divide-y divide-hair rounded-lg border border-hair">
          {bezorgers.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-ink">
                <strong>{b.naam}</strong>
                {b.telefoon && <span className="text-neutralx-600"> · {b.telefoon}</span>}
                {!b.actief && <span className="text-neutralx-500"> · niet beschikbaar</span>}
              </span>
              <span className="flex gap-2">
                <button type="button" className="btn-ghost" onClick={() => void doe({ actie: "bezorger", id: b.id, naam: b.naam, telefoon: b.telefoon, actief: !b.actief })}>
                  {b.actief ? "Niet beschikbaar" : "Beschikbaar"}
                  <span className="sr-only"> ({b.naam})</span>
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    if (window.confirm(`${b.naam} uit de lijst halen?`)) void doe({ actie: "bezorger-weg", id: b.id }, `${b.naam} is uit de lijst.`);
                  }}
                >
                  Verwijderen<span className="sr-only"> ({b.naam})</span>
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void voegToe(e)} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Veld label="Naam">
          <input className="field-input" value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={40} required />
        </Veld>
        <Veld label="Telefoon (mag leeg)">
          <input className="field-input" type="tel" value={telefoon} onChange={(e) => setTelefoon(e.target.value)} maxLength={20} />
        </Veld>
        <button type="submit" className="btn-primary">
          Bezorger toevoegen
        </button>
      </form>
    </section>
  );
}
