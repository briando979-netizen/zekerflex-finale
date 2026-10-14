"use client";

import { useEffect, useRef, useState } from "react";

export interface PickedAddress {
  label: string;
  lat: number;
  lng: number;
}

interface Hit {
  label: string;
  lat: number;
  lng: number;
}

/**
 * Free-text address search against the PDOK Locatieserver (/api/geo/search —
 * the same gratis, gezaghebbend NL-adresregister used elsewhere in the app),
 * forcing the caller to pick a real, geocoded address rather than typing
 * arbitrary free text. Used for vestigingen (app/werkgever/locaties) and
 * eenmalige klus-locaties (NewShiftForm) so both get the same "verification".
 */
export function AddressAutocomplete({
  value,
  onPick,
  placeholder = "Zoek adres…",
}: {
  value: PickedAddress | null;
  onPick: (address: PickedAddress) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
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
        const res = await fetch(`/api/geo/search?q=${encodeURIComponent(q.trim())}`, { cache: "no-store" });
        const data = await res.json();
        setHits(data.results ?? []);
      } catch {
        setHits([]);
      }
    }, 300);
    return () => {
      if (tId.current) clearTimeout(tId.current);
    };
  }, [q]);

  return (
    <div className="relative">
      <input
        value={value ? value.label : q}
        onChange={(e) => {
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
                  onPick(h);
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
      {value && (
        <p className="mt-1 text-xs text-neutralx-500">
          ✓ Adres gevonden op {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      )}
    </div>
  );
}
