"use client";

import { useState } from "react";
import Link from "next/link";
import { useFT } from "@/components/i18n/useFT";
import { ervaringPeriode, ERVARING_MAX, type Ervaring, type ErvaringStand } from "@/lib/werker/ervaring";

/**
 * Je werkervaring op het eigen profiel: bekijken, verwijderen en toevoegen (via het scherm
 * "Maak een goede eerste indruk"). Alleen jijzelf ziet dit: voor opdrachtgevers is het nog niet
 * zichtbaar (dat besluit de eigenaar).
 */
export function ErvaringLijst({ start }: { start: Ervaring[] }) {
  const t = useFT().los.ervaring;
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
      setFout(t.verwijderFout);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="px-5 py-4 text-sm">
      {items.length === 0 ? (
        <p className="text-neutralx-600">{t.leeg}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((e) => (
            <li key={e.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{e.functie || e.bedrijf}</p>
                {e.functie && <p className="text-xs text-neutralx-600">{e.bedrijf}</p>}
                <p className="text-xs text-neutralx-500">{ervaringPeriode(e, t.maanden, t.nu)}</p>
                {e.omschrijving && <p className="mt-1 whitespace-pre-line text-xs text-neutralx-600">{e.omschrijving}</p>}
              </div>
              <button type="button" disabled={bezig} onClick={() => void verwijder(e.id)} className="flex-shrink-0 text-xs text-neutralx-500 underline hover:text-crit">
                {t.verwijder}
              </button>
            </li>
          ))}
        </ul>
      )}
      {fout && <p role="alert" className="mt-2 text-xs text-crit">{fout}</p>}
      <p className="mt-3 text-xs text-neutralx-500">{t.privacy}</p>
      {items.length < ERVARING_MAX && (
        <Link href="/dashboard/eerste-indruk?stap=ervaring" className="mt-3 inline-block text-sm font-medium text-brand-600">
          {t.toevoegen}
        </Link>
      )}
    </div>
  );
}
