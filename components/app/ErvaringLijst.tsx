"use client";

import { useState } from "react";
import Link from "next/link";
import { ervaringPeriode, ERVARING_MAX, type Ervaring, type ErvaringStand } from "@/lib/werker/ervaring";

// Maandnamen en "nu" voor het eigen profiel (Nederlands, zoals de rest van die pagina).
const MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"] as const;

/**
 * Je werkervaring op het eigen profiel: bekijken, verwijderen en toevoegen (via het scherm
 * "Maak een goede eerste indruk"). Alleen jijzelf ziet dit: voor opdrachtgevers is het nog niet
 * zichtbaar (dat besluit de eigenaar).
 */
export function ErvaringLijst({ start }: { start: Ervaring[] }) {
  const [items, setItems] = useState<Ervaring[]>(start);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function verwijder(id: string) {
    if (bezig) return;
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch("/api/me/ervaring", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const d = (await r.json().catch(() => null)) as ErvaringStand | null;
      if (!r.ok || !d || !Array.isArray(d.items)) throw new Error("mislukt");
      // de teruggegeven serverstand overnemen
      setItems(d.items);
    } catch {
      setFout("Verwijderen mislukt. Probeer het nog eens.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="px-5 py-4 text-sm">
      {items.length === 0 ? (
        <p className="text-neutralx-600">Nog geen werkervaring toegevoegd.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{e.functie || e.bedrijf}</p>
                {e.functie && <p className="text-xs text-neutralx-600">{e.bedrijf}</p>}
                <p className="text-xs text-neutralx-500">{ervaringPeriode(e, MAANDEN, "nu")}</p>
                {e.omschrijving && <p className="mt-1 whitespace-pre-line text-xs text-neutralx-600">{e.omschrijving}</p>}
              </div>
              <button type="button" disabled={bezig} onClick={() => void verwijder(e.id)} className="flex-shrink-0 text-xs text-neutralx-500 underline hover:text-crit">
                Verwijderen
              </button>
            </li>
          ))}
        </ul>
      )}
      {fout && <p role="alert" className="mt-2 text-xs text-crit">{fout}</p>}
      <p className="mt-3 text-xs text-neutralx-500">Alleen jijzelf ziet dit; opdrachtgevers krijgen je werkervaring (nog) niet te zien.</p>
      {items.length < ERVARING_MAX && (
        <Link href="/dashboard/eerste-indruk?stap=ervaring" className="mt-3 inline-block text-sm font-medium text-brand-600">
          Werkervaring toevoegen →
        </Link>
      )}
    </div>
  );
}
