"use client";

import { useState } from "react";
import {
  BRONNEN,
  BRON_LABEL,
  BRON_UITLEG,
  KEUZE_UITLEG,
  type Bron,
  type KeuzeDienst,
} from "@/lib/gratis/keuze-soorten";

// Per dienst kiezen welke bron hij pakt. Dit werkt los van de grote knop, zodat
// je de betaalde kaart- en bedrijvenbron kwijt kunt zonder de AI te verkleinen.
export function GratisKeuzes({ begin }: { begin: Record<KeuzeDienst, Bron> }) {
  const [keuzes, setKeuzes] = useState(begin);
  const [bezig, setBezig] = useState<KeuzeDienst | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function kies(dienst: KeuzeDienst, bron: Bron) {
    setBezig(dienst);
    setFout(null);
    try {
      const r = await fetch("/api/admin/gratis/keuze", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dienst, bron }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.message ?? "Opslaan mislukt");
      setKeuzes(d.keuzes as Record<KeuzeDienst, Bron>);
    } catch (e) {
      setFout((e as Error).message);
    } finally {
      setBezig(null);
    }
  }

  return (
    <div className="space-y-3">
      {KEUZE_UITLEG.map((d) => {
        const nu = keuzes[d.id];
        return (
          <div
            key={d.id}
            className="rounded-xl p-3 sm:p-4"
            style={{ background: "var(--a-elev)", border: "1px solid var(--a-border)" }}
          >
            <p className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
              {d.naam}
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--a-mute)" }}>
              {d.gevolg}
            </p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={`Bron voor ${d.naam}`}>
              {BRONNEN.map((b) => (
                <button
                  key={b}
                  type="button"
                  disabled={bezig === d.id}
                  aria-pressed={nu === b}
                  onClick={() => void kies(d.id, b)}
                  title={BRON_UITLEG[b]}
                  className={
                    nu === b ? "a-btn a-btn-primary disabled:opacity-50" : "a-btn a-btn-ghost disabled:opacity-50"
                  }
                >
                  {BRON_LABEL[b]}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>
              Nu: {BRON_LABEL[nu]} — {BRON_UITLEG[nu]}.
            </p>
          </div>
        );
      })}
      {fout && (
        <p role="alert" className="text-xs" style={{ color: "var(--a-crit)" }}>
          {fout}
        </p>
      )}
    </div>
  );
}
