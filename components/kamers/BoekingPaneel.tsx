"use client";

import { useEffect, useState } from "react";
import { OVERGANGEN, STATUS_NAAM, aantalNachten, isDag, nlDag, totaalCent, type Boeking, type BoekingStatus, type Kamer } from "@/lib/kamers/model";
import { euro, euroVeld, centUitVeld, leesFout } from "@/components/kamers/hulp";

// Een boeking maken of bewerken. Bij het maken zoekt het scherm vanzelf de vrije kamers voor de gekozen nachten en
// het aantal personen; bij een bestaande boeking staan er ook de statusknoppen en "gastgegevens wissen" bij.

const knopKlein = "rounded-lg border border-hairstrong px-2.5 py-1 text-xs font-semibold text-ink hover:border-brand-500 disabled:opacity-40";

interface Props {
  kamers: Kamer[];
  begin?: Boeking;
  vandaag: string;
  /** de boeking (nieuw of bijgewerkt) zoals de server hem teruggaf; bij een statuswissel ook de kamer (uitchecken maakt hem vuil) */
  opgeslagen: (b: Boeking, kamer?: Kamer | null) => void;
  sluit: () => void;
}

export function BoekingPaneel({ kamers, begin, vandaag, opgeslagen, sluit }: Props) {
  const gewist = begin !== undefined && begin.gastGewistOp !== null;
  const vergrendeld = begin?.status === "geannuleerd";
  const [aankomst, setAankomst] = useState(begin?.aankomst ?? vandaag);
  const [vertrek, setVertrek] = useState(begin?.vertrek ?? "");
  const [personen, setPersonen] = useState(String(begin?.personen ?? 2));
  const [kamerId, setKamerId] = useState(begin?.kamerId ?? "");
  const [naam, setNaam] = useState(begin?.naam ?? "");
  const [telefoon, setTelefoon] = useState(begin?.telefoon ?? "");
  const [email, setEmail] = useState(begin?.email ?? "");
  const [opmerking, setOpmerking] = useState(begin?.opmerking ?? "");
  const [prijs, setPrijs] = useState(euroVeld(begin?.prijsOverschrijfCent ?? null));
  const [vrij, setVrij] = useState<Kamer[] | null>(null);
  const [zoekFout, setZoekFout] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [wisVraag, setWisVraag] = useState(false);
  const pre = begin ? `bk-${begin.id}` : "bk-nieuw";
  const aantalPersonen = Number(personen);
  const nachten = isDag(aankomst) && isDag(vertrek) ? aantalNachten(aankomst, vertrek) : 0;

  // De vrije kamers zoeken zodra de nachten en het aantal personen kloppen.
  const zoekbaar = nachten >= 1 && Number.isInteger(aantalPersonen) && aantalPersonen >= 1 && aantalPersonen <= 20;
  useEffect(() => {
    if (!zoekbaar) {
      setVrij(null);
      setZoekFout(null);
      return;
    }
    let actueel = true;
    const q = new URLSearchParams({ modus: "vrij", aankomst, vertrek, personen: String(aantalPersonen) });
    if (begin) q.set("negeer", begin.id);
    void (async () => {
      try {
        const res = await fetch(`/api/werkgever/kamers?${q.toString()}`, { cache: "no-store" });
        if (!actueel) return;
        if (!res.ok) {
          setZoekFout(await leesFout(res, "De vrije kamers konden niet worden opgezocht."));
          setVrij(null);
          return;
        }
        setZoekFout(null);
        setVrij(((await res.json()) as { kamers: Kamer[] }).kamers);
      } catch {
        if (actueel) setZoekFout("De vrije kamers konden niet worden opgezocht. Controleer je verbinding.");
      }
    })();
    return () => {
      actueel = false;
    };
  }, [zoekbaar, aankomst, vertrek, aantalPersonen, begin]);

  const gekozen = kamers.find((k) => k.id === kamerId);
  const overschrijf = centUitVeld(prijs);
  const prijsGoed = !Number.isNaN(overschrijf);
  const verwacht = gekozen && gekozen.prijsCent !== null && nachten > 0 ? nachten * gekozen.prijsCent : null;

  async function bewaar(e: React.FormEvent) {
    e.preventDefault();
    setFout(null);
    if (!prijsGoed) {
      setFout("De totaalprijs is geen bedrag. Vul bijvoorbeeld 250,00 in, of laat het leeg.");
      return;
    }
    setBezig(true);
    try {
      const gedeeld = { kamerId, aankomst, vertrek, naam, telefoon, email, personen: aantalPersonen, opmerking, prijsOverschrijfCent: overschrijf };
      const res = await fetch("/api/werkgever/kamers/boekingen", {
        method: begin ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(begin ? { ...gedeeld, id: begin.id, actie: "bewerken" } : gedeeld),
      });
      if (!res.ok) {
        setFout(await leesFout(res, "De boeking kon niet worden bewaard."));
        return;
      }
      opgeslagen(((await res.json()) as { boeking: Boeking }).boeking);
    } catch {
      setFout("De boeking kon niet worden bewaard. Controleer je verbinding.");
    } finally {
      setBezig(false);
    }
  }

  async function actie(body: Record<string, unknown>, standaard: string): Promise<{ boeking: Boeking; kamer?: Kamer | null } | null> {
    setFout(null);
    setBezig(true);
    try {
      const res = await fetch("/api/werkgever/kamers/boekingen", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: begin?.id, ...body }) });
      if (!res.ok) {
        setFout(await leesFout(res, standaard));
        return null;
      }
      return (await res.json()) as { boeking: Boeking; kamer?: Kamer | null };
    } catch {
      setFout("Dit lukte niet. Controleer je verbinding.");
      return null;
    } finally {
      setBezig(false);
    }
  }

  async function zetStatus(naar: BoekingStatus) {
    const r = await actie({ actie: "status", status: naar }, "De status kon niet worden gewijzigd.");
    if (r) opgeslagen(r.boeking, r.kamer ?? null);
  }

  async function wisGast() {
    const r = await actie({ actie: "wis-gast" }, "De gastgegevens konden niet worden gewist.");
    setWisVraag(false);
    if (r) opgeslagen(r.boeking);
  }

  const zelfBepaald = prijsGoed ? overschrijf !== null : (begin?.prijsOverschrijfCent ?? null) !== null;
  const kamerGeldig = vrij !== null && vrij.some((k) => k.id === kamerId);
  const totaal = begin ? totaalCent({ ...begin, aankomst, vertrek, prijsOverschrijfCent: prijsGoed ? overschrijf : null }) : null;

  return (
    <section aria-labelledby={`${pre}-kop`} className="rounded-xl border border-hairstrong bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${pre}-kop`} className="font-display text-base font-bold text-ink">
          {begin ? `Boeking ${begin.nummer}` : "Nieuwe boeking"}
          {begin && <span className="ml-2 pill pill-neutral">{STATUS_NAAM[begin.status]}</span>}
        </h2>
        <button type="button" className={knopKlein} onClick={sluit}>
          Sluiten
        </button>
      </div>

      {fout && (
        <p role="alert" className="mt-3 rounded-xl bg-crit/10 px-4 py-3 text-sm text-crit">
          {fout}
        </p>
      )}

      {begin && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {OVERGANGEN[begin.status].map((naar) => (
            <button key={naar} type="button" disabled={bezig} className={naar === "ingecheckt" || naar === "uitgecheckt" ? "btn-primary px-3 py-1.5 text-sm" : knopKlein} onClick={() => void zetStatus(naar)}>
              {naar === "ingecheckt" ? "Inchecken" : naar === "uitgecheckt" ? "Uitchecken" : naar === "geannuleerd" ? "Annuleren" : "Zet op gereserveerd"}
            </button>
          ))}
          {begin.status === "ingecheckt" && <span className="text-xs text-neutralx-600">Bij uitchecken wordt de kamer automatisch op vuil gezet.</span>}
        </div>
      )}

      <form onSubmit={(e) => void bewaar(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${pre}-aankomst`} className="field-label">
            Aankomst (eerste nacht)
          </label>
          <input id={`${pre}-aankomst`} type="date" className="field-input" value={aankomst} required onChange={(e) => setAankomst(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${pre}-vertrek`} className="field-label">
            Vertrek (ochtend)
          </label>
          <input id={`${pre}-vertrek`} type="date" className="field-input" value={vertrek} min={isDag(aankomst) ? aankomst : undefined} required onChange={(e) => setVertrek(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${pre}-personen`} className="field-label">
            Aantal personen
          </label>
          <input id={`${pre}-personen`} type="number" min={1} max={20} className="field-input" value={personen} required onChange={(e) => setPersonen(e.target.value)} />
        </div>
        <p className="self-end text-sm text-neutralx-600" aria-live="polite">
          {nachten >= 1 ? `${nachten} ${nachten === 1 ? "nacht" : "nachten"}` : vertrek ? "Het vertrek moet na de aankomst liggen." : "Kies de datums."}
        </p>

        <fieldset className="sm:col-span-2">
          <legend className="field-label">Kamer</legend>
          {zoekFout && (
            <p role="alert" className="mb-2 rounded-xl bg-crit/10 px-4 py-2 text-sm text-crit">
              {zoekFout}
            </p>
          )}
          {!zoekbaar && <p className="text-sm text-neutralx-600">Vul de datums en het aantal personen in: dan zie je hier de vrije kamers.</p>}
          {zoekbaar && vrij === null && !zoekFout && <p className="text-sm text-neutralx-500">Vrije kamers zoeken…</p>}
          {zoekbaar && vrij !== null && vrij.length === 0 && <p className="text-sm text-neutralx-600">Er is in deze nachten geen vrije kamer voor {aantalPersonen} {aantalPersonen === 1 ? "persoon" : "personen"}.</p>}
          {zoekbaar && vrij !== null && vrij.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {vrij.map((k) => (
                <label key={k.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm ${kamerId === k.id ? "border-brand-500 bg-brand-50" : "border-hair bg-white"}`}>
                  <input type="radio" name={`${pre}-kamer`} className="mt-1" checked={kamerId === k.id} onChange={() => setKamerId(k.id)} />
                  <span>
                    <span className="font-semibold text-ink">{k.naam}</span>
                    <span className="text-neutralx-600">
                      {" "}
                      {k.type ? `${k.type}, ` : ""}tot {k.capaciteit} {k.capaciteit === 1 ? "persoon" : "personen"}
                      {k.prijsCent !== null ? `, ${euro(k.prijsCent)} per nacht` : ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          {begin && !kamerId && <p className="text-sm text-neutralx-600">Kies een kamer.</p>}
          {begin && kamerId && zoekbaar && vrij !== null && !vrij.some((k) => k.id === kamerId) && (
            <p role="alert" className="mt-2 text-sm text-crit">
              De huidige kamer is in de gekozen nachten niet meer beschikbaar (bezet, te klein of gearchiveerd). Kies een andere kamer.
            </p>
          )}
        </fieldset>

        <div>
          <label htmlFor={`${pre}-naam`} className="field-label">
            Naam van de gast
          </label>
          <input id={`${pre}-naam`} className="field-input" value={naam} maxLength={80} required={!gewist} disabled={gewist} onChange={(e) => setNaam(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${pre}-tel`} className="field-label">
            Telefoon (niet verplicht)
          </label>
          <input id={`${pre}-tel`} type="tel" className="field-input" value={telefoon} maxLength={40} disabled={gewist} onChange={(e) => setTelefoon(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${pre}-mail`} className="field-label">
            E-mail (niet verplicht)
          </label>
          <input id={`${pre}-mail`} type="email" className="field-input" value={email} maxLength={120} disabled={gewist} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${pre}-prijs`} className="field-label">
            Totaalprijs zelf bepalen in euro (niet verplicht)
          </label>
          <input id={`${pre}-prijs`} className="field-input" inputMode="decimal" value={prijs} onChange={(e) => setPrijs(e.target.value)} placeholder={verwacht !== null ? `Nu: ${euro(verwacht)}` : "Leeg = nachten × prijs per nacht"} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${pre}-opm`} className="field-label">
            Opmerking (niet verplicht)
          </label>
          <textarea id={`${pre}-opm`} className="field-input" rows={2} value={opmerking} maxLength={500} disabled={gewist} onChange={(e) => setOpmerking(e.target.value)} />
        </div>

        {begin && (
          <p className="text-sm text-neutralx-600 sm:col-span-2">
            Totaalprijs: {totaal === null ? "geen prijs ingevuld bij de kamer" : euro(totaal)} (inclusief btw, {zelfBepaald ? "zelf bepaald" : "nachten × prijs per nacht"}).
          </p>
        )}
        {vergrendeld && <p className="text-sm text-neutralx-600 sm:col-span-2">Een geannuleerde boeking kan niet worden bewerkt. Zet hem eerst terug naar gereserveerd.</p>}
        {gewist && <p className="text-sm text-neutralx-600 sm:col-span-2">De gastgegevens van deze boeking zijn gewist. De boeking blijft staan voor de bezetting.</p>}

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" className="btn-primary px-4 py-2 text-sm" disabled={bezig || !kamerGeldig || vergrendeld}>
            {begin ? "Wijzigingen bewaren" : "Boeking maken"}
          </button>
          <button type="button" className={knopKlein} onClick={sluit}>
            Annuleren
          </button>
        </div>
      </form>

      {begin && !gewist && (
        <div className="mt-4 rounded-xl border border-hair bg-paper-soft p-3">
          <p className="text-sm font-semibold text-ink">Gastgegevens wissen</p>
          <p className="mt-1 text-sm text-neutralx-600">
            Een gast is een derde: wil die dat zijn gegevens verdwijnen, of is de bewaartermijn (twee jaar na vertrek) voorbij, dan wis je hier de naam, het telefoonnummer, het e-mailadres en de opmerking. De boeking
            blijft als lege regel staan met kamer, nachten en aantal personen, zodat de bezetting klopt. Wissen kan niet ongedaan worden gemaakt.
          </p>
          {wisVraag ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink">Zeker weten?</span>
              <button type="button" disabled={bezig} className="rounded-lg bg-crit px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40" onClick={() => void wisGast()}>
                Ja, wis de gastgegevens
              </button>
              <button type="button" className={knopKlein} onClick={() => setWisVraag(false)}>
                Nee
              </button>
            </div>
          ) : (
            <button type="button" className={`${knopKlein} mt-2`} onClick={() => setWisVraag(true)}>
              Gastgegevens wissen
            </button>
          )}
        </div>
      )}
      {begin && <p className="mt-2 text-xs text-neutralx-500">Verblijf van {nlDag(begin.aankomst)} tot {nlDag(begin.vertrek)}.</p>}
    </section>
  );
}
