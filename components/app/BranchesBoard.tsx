"use client";

import { useEffect, useState } from "react";
import { VestigingFormulier } from "@/components/werkgever/VestigingFormulier";
import { useKlusConcept } from "@/components/werkgever/useKlusConcept";
import { InstellingenKop } from "@/components/werkgever/InstellingenKop";
import { LijstTabel } from "@/components/werkgever/LijstTabel";
import { Dialoog } from "@/components/werkgever/Dialoog";
import { useT } from "@/components/i18n/I18nProvider";

// Instellingen → Locaties (23 nov 2026, zoals Locaties bij YoungOnes): de kop met "Nieuwe locatie" rechtsboven, de vestigingen als
// eenvoudige tabel in een witte kaart (naam, straat, postcode, plaats; leeg is het één regel tekst) en toevoegen in een dialoog met
// het bestaande vestigingsformulier (adreszoeker van PDOK). De gegevens, de routes en de regels zijn niet veranderd: verwijderen kan
// alleen zolang er geen diensten of urenbriefjes aan de vestiging hangen, en na elke wijziging halen we de lijst opnieuw op.

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
  // de plaats van een klus die al klaarstaat (/klus-plaatsen) alvast in het formulier, zolang er nog geen locatie is
  const concept = useKlusConcept({ aan: branches !== null && branches.length === 0 });

  async function refresh() {
    const res = await fetch("/api/werkgever/branches", { cache: "no-store" });
    if (res.ok) setBranches((await res.json()).branches);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function remove(id: string) {
    if (!window.confirm("Deze vestiging verwijderen?")) return;
    const res = await fetch(`/api/werkgever/branches/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(data?.error?.message ?? "Verwijderen mislukt");
      return;
    }
    await refresh();
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
                  Incheckgebied {b.geofenceRadiusMeters} m
                  {b.costCenter ? ` · Kostenplaats ${b.costCenter}` : ""}
                  {" · "}
                  {b._count.shifts} diensten · {b._count.timesheets} urenbriefjes
                  {" · "}
                  <a href={`/werkgever/locaties/${b.id}/baken`} className="font-medium text-brand-600 hover:underline">
                    Locatiebaken (QR, Bluetooth, automatisch inchecken)
                  </a>
                </span>
              </span>,
              b.addressLine,
              b.postalCode,
              b.city,
            ],
            actie:
              canManage && b._count.shifts === 0 && b._count.timesheets === 0 ? (
                <button type="button" onClick={() => remove(b.id)} className="btn-ghost min-h-11">
                  {l.verwijderen}
                </button>
              ) : undefined,
          }))}
        />
      )}

      {/* toevoegen in een dialoog; het formulier heeft zijn eigen knoppen (opslaan en annuleren), dus de dialoog heeft er geen */}
      <Dialoog open={adding} id="locatie-nieuw" titel={l.dialoogTitel} onSluit={() => setAdding(false)}>
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
    </>
  );
}
