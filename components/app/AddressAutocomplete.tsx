"use client";

import { useEffect, useRef, useState } from "react";

export interface PickedAddress {
  label: string;
  lat: number;
  lng: number;
  /** from PDOK (/api/geo/search); empty for a street or place without a postcode */
  postcode?: string | null | undefined;
  plaats?: string | null | undefined;
}

interface Hit {
  label: string;
  lat: number;
  lng: number;
  postcode?: string | null;
  plaats?: string | null;
}

/**
 * Free-text address search against the PDOK Locatieserver (/api/geo/search —
 * the same gratis, gezaghebbend NL-adresregister used elsewhere in the app),
 * forcing the caller to pick a real, geocoded address rather than typing
 * arbitrary free text. Used for vestigingen (components/werkgever/VestigingFormulier.tsx)
 * and eenmalige klus-locaties (NewShiftForm) so both get the same "verification".
 * The pick carries PDOK's postcode and place, so the caller fills those in itself.
 */
export function AddressAutocomplete({
  value,
  onPick,
  placeholder = "Zoek adres…",
  id,
  beginZoek = "",
  alleenAdressen = false,
  onWijzig,
}: {
  value: PickedAddress | null;
  onPick: (address: PickedAddress) => void;
  placeholder?: string;
  /** for a <label htmlFor> */
  id?: string;
  /** text already in the search box, e.g. the place of a drafted klus */
  beginZoek?: string;
  /** only real addresses (always with a postcode), for a vestiging */
  alleenAdressen?: boolean;
  /** typing after a pick: the caller forgets the picked address, so the field can be changed */
  onWijzig?: () => void;
}) {
  const [q, setQ] = useState(beginZoek);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const tId = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (tId.current) clearTimeout(tId.current);
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    tId.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q.trim())}${alleenAdressen ? "&soort=adres" : ""}`, { cache: "no-store" });
        const data = await res.json();
        setHits(data.results ?? []);
      } catch {
        setHits([]);
      }
    }, 300);
    return () => {
      if (tId.current) clearTimeout(tId.current);
    };
  }, [q, alleenAdressen]);

  return (
    <div className="relative">
      <input
        {...(id ? { id } : {})}
        value={value ? value.label : q}
        onChange={(e) => {
          if (value && onWijzig) onWijzig();
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="field-input w-full"
        autoComplete="off"
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-hair bg-white py-1 shadow-lift">
          {hits.map((h, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onPick({ label: h.label, lat: h.lat, lng: h.lng, postcode: h.postcode ?? null, plaats: h.plaats ?? null });
                  setQ("");
                  setHits([]);
                  setOpen(false);
                }}
                className="block w-full truncate px-3 py-2 text-left text-sm text-ink hover:bg-paper-soft"
              >
                {h.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && <p className="mt-1 text-xs text-neutralx-500">✓ Adres gevonden</p>}
    </div>
  );
}
