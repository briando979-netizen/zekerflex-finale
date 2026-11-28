"use client";

import { useState, type KeyboardEvent } from "react";
import { useT } from "@/components/i18n/I18nProvider";
import { belgieFoutMelding, belgieInvoerMelding, leesGevondenBelgischAdres, type GevondenBelgischAdres } from "@/lib/geo/vestiging-land";

// Een werklocatie in België (vlag `werk-in-belgie`, standaard uit): straat en huisnummer, postcode en plaats, en één knop
// "Adres zoeken" die het adres opzoekt bij OpenStreetMap (POST /api/werkgever/adres-belgie, lib/geo/vestiging-belgie.ts).
// PDOK kent België niet, en OpenStreetMap staat geen zoeken-tijdens-het-typen toe: daarom een knop in plaats van de
// adreszoeker. Gebruikt door de vestiging (components/werkgever/VestigingFormulier.tsx) en de eenmalige locatie bij een klus
// (components/app/NewShiftForm.tsx); die bewaren het gevonden punt op de gewone manier. Enter in een veld zoekt het adres
// op en dient het formulier eromheen niet in.
export function BelgischAdres({
  id,
  gevonden,
  onGevonden,
  onWijzig,
  beginPlaats = "",
  melding = null,
}: {
  /** voorvoegsel van de veld-id's (straat, postcode, plaats) */
  id: string;
  gevonden: GevondenBelgischAdres | null;
  onGevonden: (adres: GevondenBelgischAdres) => void;
  /** een veld veranderd na het zoeken: de aanroeper vergeet het gevonden adres */
  onWijzig: () => void;
  beginPlaats?: string;
  /** een melding van de aanroeper (bijvoorbeeld: eerst het adres zoeken) */
  melding?: string | null;
}) {
  const v = useT().vestigingForm;
  const [straat, setStraat] = useState("");
  const [postcode, setPostcode] = useState("");
  const [plaats, setPlaats] = useState(beginPlaats);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  function wijzig(zet: (waarde: string) => void, waarde: string) {
    zet(waarde);
    setFout(null);
    if (gevonden) onWijzig();
  }

  async function zoek() {
    if (bezig) return;
    const vooraf = belgieInvoerMelding(straat, postcode);
    if (vooraf) return setFout(v[vooraf]);
    setBezig(true);
    setFout(null);
    try {
      const res = await fetch("/api/werkgever/adres-belgie", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ straat: straat.trim(), postcode: postcode.trim(), plaats: plaats.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { result?: unknown; error?: { message?: unknown } } | null;
      const adres = res.ok ? leesGevondenBelgischAdres(data?.result) : null;
      if (adres) {
        onGevonden(adres);
        return;
      }
      const sleutel = belgieFoutMelding(data);
      setFout(sleutel ? v[sleutel] : typeof data?.error?.message === "string" ? data.error.message : v.belgieOnbereikbaar);
    } catch {
      setFout(v.belgieOnbereikbaar);
    } finally {
      setBezig(false);
    }
  }

  function enter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.stopPropagation();
    void zoek();
  }

  const tonen = fout ?? melding;
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${id}-straat`} className="field-label">
          {v.adresZoek}
        </label>
        <input
          id={`${id}-straat`}
          value={straat}
          onChange={(e) => wijzig(setStraat, e.target.value)}
          onKeyDown={enter}
          autoComplete="address-line1"
          className="field-input w-full"
          {...(tonen ? { "aria-describedby": `${id}-belgie-fout` } : {})}
        />
      </div>
      <div className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-3">
        <div>
          <label htmlFor={`${id}-postcode`} className="field-label">
            {v.postcode}
          </label>
          <input
            id={`${id}-postcode`}
            value={postcode}
            onChange={(e) => wijzig(setPostcode, e.target.value)}
            onKeyDown={enter}
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={8}
            className="field-input w-full"
          />
        </div>
        <div>
          <label htmlFor={`${id}-plaats`} className="field-label">
            {v.plaats}
          </label>
          <input id={`${id}-plaats`} value={plaats} onChange={(e) => wijzig(setPlaats, e.target.value)} onKeyDown={enter} autoComplete="address-level2" className="field-input w-full" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void zoek()} disabled={bezig} className="btn-ghost min-h-11 text-sm disabled:opacity-50">
          {bezig ? v.belgieZoeken : v.belgieZoek}
        </button>
        {!gevonden && <p className="text-xs text-neutralx-500">{v.belgieHint}</p>}
      </div>
      {gevonden && (
        <p role="status" className="text-xs text-neutralx-500">
          ✓ {v.belgieGevonden} {gevonden.label}
        </p>
      )}
      {tonen && (
        <p id={`${id}-belgie-fout`} role="alert" className="text-sm text-crit">
          {tonen}
        </p>
      )}
    </div>
  );
}
