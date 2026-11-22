"use client";

import { useId, useState, type FormEvent } from "react";
import { AddressAutocomplete, type PickedAddress } from "@/components/app/AddressAutocomplete";
import { useT } from "@/components/i18n/I18nProvider";
import { adresUitKeuze } from "@/lib/geo/adres-keuze";

// Een vaste werklocatie (vestiging) toevoegen: op Locaties (BranchesBoard) en, voor een bedrijf zonder adres, meteen op
// Klus uitzetten (EersteVestiging). 22 nov 2026 (gebruikersonderzoek B16–B19): elk veld een eigen label, en postcode en
// plaats vult de adreszoeker zelf in uit PDOK; de naam wordt de plaats als je hem leeg laat. Dezelfde POST als altijd
// (/api/werkgever/branches, alleen een beheerder).
export function VestigingFormulier({
  beginPlaats = "",
  metKostenplaats = false,
  onOpgeslagen,
  onAnnuleer,
}: {
  /** de plaats van een klus die al klaarstaat (/klus-plaatsen): alvast in de zoeker, de naam en de plaats */
  beginPlaats?: string;
  metKostenplaats?: boolean;
  onOpgeslagen: (branch: { id: string; name: string }) => void | Promise<void>;
  onAnnuleer?: () => void;
}) {
  const v = useT().vestigingForm;
  const id = useId();
  const [name, setName] = useState(beginPlaats);
  const [address, setAddress] = useState<PickedAddress | null>(null);
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState(beginPlaats);
  const [costCenter, setCostCenter] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function kies(a: PickedAddress) {
    setAddress(a);
    const velden = adresUitKeuze(a);
    if (velden.postcode) setPostalCode(velden.postcode);
    if (velden.plaats) {
      setCity(velden.plaats);
      setName((nu) => (nu.trim() ? nu : velden.plaats));
    }
    setErr(null);
  }

  async function opslaan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!address) return setErr(v.kiesAdres);
    if (name.trim().length < 2 || postalCode.trim().length < 4 || city.trim().length < 2) return setErr(v.vulAlles);
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/werkgever/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          addressLine: adresUitKeuze(address).straat,
          postalCode: postalCode.trim(),
          city: city.trim(),
          latitude: address.lat,
          longitude: address.lng,
          ...(metKostenplaats && costCenter.trim() ? { costCenter: costCenter.trim() } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { branch?: { id: string; name: string }; error?: { message?: string } };
      if (!res.ok || !data.branch) throw new Error(data.error?.message ?? v.mislukt);
      await onOpgeslagen(data.branch);
    } catch (fout) {
      setErr((fout as Error).message || v.mislukt);
    } finally {
      setBusy(false);
    }
  }

  const fout = err ? { "aria-describedby": `${id}-fout` } : {};
  return (
    <form onSubmit={opslaan} className="space-y-3" noValidate>
      <div>
        <label htmlFor={`${id}-adres`} className="field-label">
          {v.adres}
        </label>
        <AddressAutocomplete
          id={`${id}-adres`}
          value={address}
          onPick={kies}
          onWijzig={() => setAddress(null)}
          placeholder={v.adresZoek}
          beginZoek={beginPlaats}
          alleenAdressen
        />
        {!address && <p className="mt-1 text-xs text-neutralx-500">{v.adresHint}</p>}
      </div>
      <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-3">
        <div>
          <label htmlFor={`${id}-postcode`} className="field-label">
            {v.postcode}
          </label>
          <input id={`${id}-postcode`} value={postalCode} onChange={(e) => setPostalCode(e.target.value)} autoComplete="postal-code" className="field-input w-full" {...fout} />
        </div>
        <div>
          <label htmlFor={`${id}-plaats`} className="field-label">
            {v.plaats}
          </label>
          <input id={`${id}-plaats`} value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" className="field-input w-full" {...fout} />
        </div>
      </div>
      <div>
        <label htmlFor={`${id}-naam`} className="field-label">
          {v.naam}
        </label>
        <input id={`${id}-naam`} value={name} onChange={(e) => setName(e.target.value)} aria-describedby={`${id}-naam-hint`} className="field-input w-full" />
        <p id={`${id}-naam-hint`} className="mt-1 text-xs text-neutralx-500">
          {v.naamHint}
        </p>
      </div>
      {metKostenplaats && (
        <div>
          <label htmlFor={`${id}-kostenplaats`} className="field-label">
            {v.kostenplaats} <span className="text-neutralx-400">{v.optioneel}</span>
          </label>
          <input id={`${id}-kostenplaats`} value={costCenter} onChange={(e) => setCostCenter(e.target.value)} className="field-input w-full" />
        </div>
      )}
      {err && (
        <p id={`${id}-fout`} role="alert" className="text-sm text-crit">
          {err}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className="btn-primary text-sm disabled:opacity-50">
          {busy ? v.bezig : v.opslaan}
        </button>
        {onAnnuleer && (
          <button type="button" onClick={onAnnuleer} className="btn-ghost text-sm">
            {v.annuleren}
          </button>
        )}
      </div>
    </form>
  );
}
