"use client";

import { useState } from "react";
import Link from "next/link";
import { useFT } from "@/components/i18n/useFT";
import { ervaringPeriode, ERVARING_MAX, type Ervaring, type ErvaringStand } from "@/lib/werker/ervaring";

export function ErvaringLijst({ start, startZichtbaar }: { start: Ervaring[]; startZichtbaar: boolean }) {
  const t = useFT().los.ervaring;
  const [items, setItems] = useState<Ervaring[]>(start);
  const [zichtbaar, setZichtbaar] = useState(startZichtbaar);
  const [bezig, setBezig] = useState(false);
  const [bizigSchakelaar, setBezigSchakelaar] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  async function verwijder(id: string) {
    if (bezig) return;
    setBezig(true);
    setFout(null);
    try {
      const r = await fetch("/api/me/ervaring", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const d = (await r.json().catch(() => null)) as ErvaringStand | null;
      if (!r.ok || !d || !Array.isArray(d.items)) throw new Error("mislukt");
      setItems(d.items);
    } catch {
      setFout(t.verwijderFout);
    } finally {
      setBezig(false);
    }
  }

  async function schakelZichtbaar() {
    if (bizigSchakelaar) return;
    setBezigSchakelaar(true);
    setFout(null);
    const nieuw = !zichtbaar;
    try {
      const r = await fetch("/api/me/ervaring", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ zichtbaar: nieuw }) });
      if (!r.ok) throw new Error("mislukt");
      setZichtbaar(nieuw);
    } catch {
      setFout(t.deelFout);
    } finally {
      setBezigSchakelaar(false);
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
      {items.length > 0 && (
        <label className="mt-4 flex cursor-pointer items-center gap-2.5">
          <button
            type="button"
            role="switch"
            aria-checked={zichtbaar}
            disabled={bizigSchakelaar}
            onClick={() => void schakelZichtbaar()}
            className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50 ${zichtbaar ? "bg-brand-500" : "bg-neutralx-300"}`}
          >
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${zichtbaar ? "translate-x-4" : "translate-x-0.5"}`} />
          </button>
          <span className="text-xs text-neutralx-700">{t.deelLabel}</span>
        </label>
      )}
      <p className="mt-3 text-xs text-neutralx-500">{items.length > 0 && zichtbaar ? "" : t.privacy}</p>
      {items.length < ERVARING_MAX && (
        <Link href="/dashboard/eerste-indruk?stap=ervaring" className="mt-3 inline-block text-sm font-medium text-brand-600">
          {t.toevoegen}
        </Link>
      )}
    </div>
  );
}
