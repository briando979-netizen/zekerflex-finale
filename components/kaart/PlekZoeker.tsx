"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ZoekResultaat } from "@/lib/kaart/geo";

// ---------------------------------------------------------------------------
// Een adres zoeken voor de Route op ZekerFlex Kaart (van en naar), met dezelfde
// PDOK-zoekfunctie als het grote zoekveld (/api/kaart/zoek). De resultaten staan
// onder het veld in de kaart zelf (niet zwevend), zodat ze ook in een smal,
// scrollend paneel op een telefoon van 320 px passen.
// ---------------------------------------------------------------------------

export function PlekZoeker({
  id,
  label,
  waarde,
  placeholder,
  onKies,
  extra,
}: {
  id: string;
  label: string;
  /** de naam van de gekozen plek (ook als die van buiten komt: mijn plek, tik op de kaart) */
  waarde: string;
  placeholder: string;
  onKies: (r: ZoekResultaat) => void;
  /** een knop naast het label, zoals "Mijn plek" */
  extra?: ReactNode;
}) {
  const [tekst, setTekst] = useState(waarde);
  const [resultaten, setResultaten] = useState<ZoekResultaat[]>([]);
  const gekozen = useRef(waarde);

  // een plek die van buiten gekozen is, in het veld zetten (zonder opnieuw te zoeken)
  useEffect(() => {
    gekozen.current = waarde;
    setTekst(waarde);
    setResultaten([]);
  }, [waarde]);

  useEffect(() => {
    const q = tekst.trim();
    if (q.length < 2 || q === gekozen.current) {
      setResultaten([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/kaart/zoek?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d: { resultaten?: ZoekResultaat[] }) => setResultaten((d.resultaten ?? []).slice(0, 6)))
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [tekst]);

  function kies(r: ZoekResultaat) {
    gekozen.current = r.naam;
    setTekst(r.naam);
    setResultaten([]);
    onKies(r);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-xs font-semibold text-neutralx-600">
          {label}
        </label>
        {extra}
      </div>
      <input
        id={id}
        type="search"
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setResultaten([]);
          if (e.key === "Enter" && resultaten[0]) {
            e.preventDefault();
            kies(resultaten[0]);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        className="field-input mt-1 w-full"
      />
      {resultaten.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-auto rounded-xl bg-white py-1 ring-1 ring-black/10" aria-label={`Gevonden plekken voor ${label.toLowerCase()}`}>
          {resultaten.map((r) => (
            <li key={`${r.naam}-${r.lon}`}>
              <button type="button" onClick={() => kies(r)} className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-paper-soft">
                <span className="min-w-0 truncate">{r.naam}</span>
                <span className="flex-shrink-0 text-xs text-neutralx-500">{r.soort}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
