"use client";

import { useEffect, useState } from "react";
import { VestigingFormulier } from "@/components/werkgever/VestigingFormulier";
import { useKlusConcept } from "@/components/werkgever/useKlusConcept";
import { InstellingenKop } from "@/components/werkgever/InstellingenKop";
import { LijstTabel } from "@/components/werkgever/LijstTabel";
import { Dialoog } from "@/components/werkgever/Dialoog";
import { useT } from "@/components/i18n/I18nProvider";
import { fmt } from "@/lib/i18n/dictionaries";

// Instellingen → Locaties (23 nov 2026, zoals Locaties bij YoungOnes): de kop met "Nieuwe locatie" rechtsboven, de vestigingen als
// eenvoudige tabel in een witte kaart (naam, straat, postcode, plaats; leeg is het één regel tekst) en toevoegen in een dialoog met
// het bestaande vestigingsformulier (adreszoeker van PDOK). De gegevens, de routes en de regels zijn niet veranderd: verwijderen kan
// alleen zolang er geen diensten of urenbriefjes aan de vestiging hangen, en na elke wijziging halen we de lijst opnieuw op.
// Ronde 2 (zelfde dag): verwijderen vraagt het eerst in de dialoog van de werkgeversapp (geen window.confirm), een fout staat in
// die dialoog en "verwijderd" als een nette melding boven de lijst (geen window.alert); de knop is een prullenbak met een naam.

interface BranchRow {
  id: string;
  name: string;
  addressLine: string;
  postalCode: string;
  city: string;
  latitude: number;
  longitude: number;
  costCenter: string | null;
  geofenceRadiusMeters: number;
  _count: { shifts: number; timesheets: number };
}

export function BranchesBoard({ canManage }: { canManage: boolean }) {
  const l = useT().locaties;
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [adding, setAdding] = useState(false);
  // de vestiging waarvoor de vraag "verwijderen?" open staat
  const [weg, setWeg] = useState<{ id: string; naam: string } | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [melding, setMelding] = useState<string | null>(null);
  // de plaats van een klus die al klaarstaat (/klus-plaatsen) alvast in het formulier, zolang er nog geen locatie is
  const concept = useKlusConcept({ aan: branches !== null && branches.length === 0 });

  async function refresh() {
    const res = await fetch("/api/werkgever/branches", { cache: "no-store" });
    if (res.ok) setBranches((await res.json()).branches);
  }

  useEffect(() => {
    void refresh();
  }, []);

  function vraagWeg(id: string, naam: string) {
    setFout(null);
    setMelding(null);
    setWeg({ id, naam });
  }
  const sluitWeg = () => {
    if (!bezig) setWeg(null);
  };

  async function remove() {
    if (!weg || bezig) return;
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch(`/api/werkgever/branches/${weg.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // de server zegt waarom het niet kan (bijvoorbeeld: er hangen nog diensten aan)
        setFout(typeof data?.error?.message === "string" ? data.error.message : l.foutWeg);
        return;
      }
      setMelding(fmt(l.gedaanWeg, { naam: weg.naam }));
      setWeg(null);
      await refresh();
    } catch {
      setFout(l.foutWeg);
    } finally {
      setBezig(false);
    }
  }

  return (
    <>
      <InstellingenKop
        title={l.title}
        subtitle={l.subtitle}
        action={
          canManage ? (
            <button type="button" onClick={() => setAdding(true)} className="btn-primary min-h-11">
              <span aria-hidden>+</span> {l.nieuw}
            </button>
          ) : undefined
        }
      />

      {melding && (
        <p role="status" className="mb-4 text-sm font-medium text-brand-700">
          {melding}
        </p>
      )}
      {!canManage && <p className="mb-4 text-sm text-neutralx-600">{l.panelNoManage}</p>}

      {!branches ? (
        <p role="status" className="text-sm text-neutralx-500">
          {l.laden}
        </p>
      ) : (
        <LijstTabel
          label={l.panelTitle}
          leeg={l.leeg}
          kolommen={[{ kop: l.kolNaam }, { kop: l.kolStraat }, { kop: l.kolPostcode }, { kop: l.kolPlaats }]}
          actieKop={canManage ? l.kolActies : undefined}
          rijen={branches.map((b) => ({
            id: b.id,
            cellen: [
              <span key="naam">
                {b.name}
                <span className="mt-1 block text-xs font-normal leading-relaxed text-neutralx-500">
                  {fmt(l.incheckgebied, { m: b.geofenceRadiusMeters })}
                  {b.costCenter ? ` · ${fmt(l.kostenplaats, { naam: b.costCenter })}` : ""}
                  {" · "}
                  {fmt(l.telling, { d: b._count.shifts, u: b._count.timesheets })}
                  {" · "}
                  <a href={`/werkgever/locaties/${b.id}/baken`} className="inline-flex min-h-11 items-center font-medium text-brand-600 hover:underline sm:min-h-0">
                    {l.baken}
                  </a>
                </span>
              </span>,
              // straat en huisnummer blijven op één regel (op 1024 px brak "Grote Markt 1" in tweeën); de naamkolom vangt het op
              <span key="straat" className="sm:whitespace-nowrap">
                {b.addressLine}
              </span>,
              <span key="postcode" className="sm:whitespace-nowrap">
                {b.postalCode}
              </span>,
              b.city,
            ],
            actie:
              canManage && b._count.shifts === 0 && b._count.timesheets === 0 ? (
                <button
                  type="button"
                  onClick={() => vraagWeg(b.id, b.name)}
                  aria-label={fmt(l.verwijderNaam, { naam: b.name })}
                  title={l.verwijderen}
                  className="grid h-11 w-11 place-items-center rounded-lg border border-hairstrong text-neutralx-600 transition hover:border-crit hover:text-crit"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : undefined,
          }))}
        />
      )}

      {/* toevoegen in een dialoog; het formulier heeft zijn eigen knoppen (opslaan en annuleren), dus de dialoog heeft er geen */}
      <Dialoog open={adding} id="locatie-nieuw" titel={l.dialoogTitel} sluitLabel={l.sluiten} onSluit={() => setAdding(false)}>
        {/* elk veld een label, postcode en plaats vult de adreszoeker zelf in (22 nov 2026) */}
        <VestigingFormulier
          key={concept?.city ?? ""}
          beginPlaats={branches?.length === 0 ? (concept?.city ?? "") : ""}
          metKostenplaats
          onOpgeslagen={async () => {
            setAdding(false);
            await refresh();
          }}
          onAnnuleer={() => setAdding(false)}
        />
      </Dialoog>

      {/* verwijderen: eerst vragen, met de naam erin; een weigering van de server staat in dezelfde dialoog */}
      <Dialoog
        open={weg !== null}
        id="locatie-weg"
        titel={l.verwijderTitel}
        uitleg={weg ? fmt(l.verwijderVraag, { naam: weg.naam }) : undefined}
        sluitLabel={l.sluiten}
        onSluit={sluitWeg}
        acties={
          <>
            <button type="button" onClick={sluitWeg} className="btn-ghost min-h-11">
              {l.annuleren}
            </button>
            <button type="button" disabled={bezig} onClick={() => void remove()} className="btn-primary min-h-11">
              {bezig ? l.bezig : l.verwijderKnop}
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
