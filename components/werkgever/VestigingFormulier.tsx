"use client";

import { useId, useState, type FormEvent } from "react";
import { AddressAutocomplete, type PickedAddress } from "@/components/app/AddressAutocomplete";
import { BuitenlandAdres } from "@/components/werkgever/BuitenlandAdres";
import { useT } from "@/components/i18n/I18nProvider";
import { adresUitKeuze } from "@/lib/geo/adres-keuze";
import type { GevondenBuitenlandsAdres, LandKeuze, VestigingLand } from "@/lib/geo/vestiging-land";

// Een vaste werklocatie (vestiging) toevoegen: op Locaties (BranchesBoard) en, voor een bedrijf zonder adres, meteen op
// Klus uitzetten (EersteVestiging). 22 nov 2026 (gebruikersonderzoek B16–B19): elk veld een eigen label, en postcode en
// plaats vult de adreszoeker zelf in uit PDOK; de naam wordt de plaats als je hem leeg laat. Dezelfde POST als altijd
// (/api/werkgever/branches, alleen een beheerder). 28 nov 2026: met de vlag `werk-in-belgie` of `werk-in-buitenland` (landen)
// eerst het land; buiten Nederland zoekt BuitenlandAdres het adres op bij OpenStreetMap. Zonder de vlaggen is alles zoals het was.
export function VestigingFormulier({
  beginPlaats = "",
  metKostenplaats = false,
  landen = null,
  onOpgeslagen,
  onAnnuleer,
}: {
  /** de plaats van een klus die al klaarstaat (/klus-plaatsen): alvast in de zoeker, de naam en de plaats */
  beginPlaats?: string;
  metKostenplaats?: boolean;
  /** de landen die het bedrijf mag kiezen, met hun naam (van de server, lib/geo/vestiging-buitenland.ts); null = alleen Nederland */
  landen?: LandKeuze[] | null | undefined;
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
  const [land, setLand] = useState<VestigingLand>("NL");
  const [buitenlands, setBuitenlands] = useState<GevondenBuitenlandsAdres | null>(null);
  const keuze = landen && landen.length > 1 ? landen : null;
  const gekozen = keuze?.find((l) => l.code === land && l.code !== "NL") ?? null;

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

  function kiesBuitenlands(a: GevondenBuitenlandsAdres) {
    setBuitenlands(a);
    if (a.plaats) setName((nu) => (nu.trim() ? nu : a.plaats));
    setErr(null);
  }

  async function opslaan(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // buiten Nederland: het punt dat OpenStreetMap vond ("BE-2000" als postcode); Nederland: het gekozen PDOK-adres, zoals altijd
    const plek = gekozen
      ? buitenlands && { addressLine: buitenlands.straat, postalCode: buitenlands.postcode, city: buitenlands.plaats.trim(), latitude: buitenlands.lat, longitude: buitenlands.lng }
      : address && { addressLine: adresUitKeuze(address).straat, postalCode: postalCode.trim(), city: city.trim(), latitude: address.lat, longitude: address.lng };
    if (!plek) return setErr(gekozen ? v.buitenlandEerst : v.kiesAdres);
    // een land zonder postcodes bewaart alleen de landcode ("AE-"): daar telt de lengte niet
    if (name.trim().length < 2 || (!gekozen && plek.postalCode.length < 4) || plek.city.length < 2) return setErr(v.vulAlles);
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/werkgever/branches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          ...plek,
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
      {keuze && (
        <div>
          <label htmlFor={`${id}-land`} className="field-label">
            {v.land}
          </label>
          <select
            id={`${id}-land`}
            value={land}
            onChange={(e) => {
              if (keuze.some((l) => l.code === e.target.value)) setLand(e.target.value);
              setBuitenlands(null);
              setErr(null);
            }}
            className="field-input w-full"
          >
            {keuze.map((l) => (
              <option key={l.code} value={l.code}>
                {l.naam}
              </option>
            ))}
          </select>
        </div>
      )}
      {gekozen ? (
        <BuitenlandAdres
          key={gekozen.code}
          id={id}
          land={gekozen.code}
          landNaam={gekozen.naam}
          gevonden={buitenlands}
          onGevonden={kiesBuitenlands}
          onWijzig={() => setBuitenlands(null)}
          beginPlaats={beginPlaats}
        />
      ) : (
        <>
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
        </>
      )}
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
