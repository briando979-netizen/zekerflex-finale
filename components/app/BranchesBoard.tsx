"use client";

import { useEffect, useState } from "react";
import { VestigingFormulier } from "@/components/werkgever/VestigingFormulier";
import { useKlusConcept } from "@/components/werkgever/useKlusConcept";

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
    <div className="space-y-4">
      {!branches ? (
        <p className="text-sm text-neutralx-500">Laden…</p>
      ) : branches.length === 0 ? (
        <p className="text-sm text-neutralx-500">Nog geen vestigingen toegevoegd.</p>
      ) : (
        <div className="divide-y divide-hair rounded-xl border border-hair">
          {branches.map((b) => (
            <div key={b.id} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">{b.name}</p>
                <p className="mt-0.5 text-xs text-neutralx-500">
                  {b.addressLine}, {b.postalCode} {b.city}
                </p>
                <p className="mt-1 text-[11px] text-neutralx-400">
                  Incheckgebied {b.geofenceRadiusMeters} m
                  {b.costCenter ? ` · Kostenplaats ${b.costCenter}` : ""}
                  {" · "}
                  {b._count.shifts} diensten · {b._count.timesheets} urenbriefjes
                  {" · "}
                  <a href={`/werkgever/locaties/${b.id}/baken`} className="font-medium text-brand-600 hover:underline">
                    Locatiebaken (QR, Bluetooth, automatisch inchecken)
                  </a>
                </p>
              </div>
              {canManage && b._count.shifts === 0 && b._count.timesheets === 0 && (
                <button
                  type="button"
                  onClick={() => remove(b.id)}
                  className="text-[11px] font-medium text-neutralx-500 hover:text-crit"
                >
                  Verwijderen
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canManage && (
        <>
          {!adding ? (
            <button type="button" onClick={() => setAdding(true)} className="btn-ghost text-sm">
              + Vestiging toevoegen
            </button>
          ) : (
            <div className="rounded-xl border border-hair p-4">
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
