"use client";

import { useEffect, useState } from "react";
import { AddressAutocomplete, type PickedAddress } from "@/components/app/AddressAutocomplete";

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
  const [name, setName] = useState("");
  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [costCenter, setCostCenter] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/werkgever/branches", { cache: "no-store" });
    if (res.ok) setBranches((await res.json()).branches);
  }

  useEffect(() => {
    void refresh();
  }, []);

  function resetForm() {
    setName("");
    setAddress(null);
    setPostalCode("");
    setCity("");
    setCostCenter("");
    setAdding(false);
    setErr(null);
  }

  async function create() {
    if (!address) {
      setErr("Kies een adres uit de suggesties.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/werkgever/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          addressLine: address.label,
          postalCode,
          city,
          latitude: address.lat,
          longitude: address.lng,
          costCenter: costCenter || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message ?? "Toevoegen mislukt");
      resetForm();
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
                  Geofence {b.geofenceRadiusMeters}m
                  {b.costCenter ? ` · Kostenplaats ${b.costCenter}` : ""}
                  {" · "}
                  {b._count.shifts} diensten · {b._count.timesheets} urenbriefjes
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
              <div className="space-y-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Naam (bijv. 'Rotterdam centrum')"
                  className="field-input w-full"
                />
                <AddressAutocomplete value={address} onPick={setAddress} placeholder="Zoek adres…" />
                <div className="flex gap-3">
                  <input
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="Postcode"
                    className="field-input w-32"
                  />
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Plaats"
                    className="field-input flex-1"
                  />
                </div>
                <input
                  value={costCenter}
                  onChange={(e) => setCostCenter(e.target.value)}
                  placeholder="Kostenplaats (optioneel)"
                  className="field-input w-full"
                />
                {err && <p role="alert" className="text-sm text-crit">{err}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={create}
                    disabled={busy || !name || !address || !postalCode || !city}
                    className="btn-primary text-sm disabled:opacity-50"
                  >
                    {busy ? "Bezig…" : "Opslaan"}
                  </button>
                  <button type="button" onClick={resetForm} className="btn-ghost text-sm">
                    Annuleren
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
