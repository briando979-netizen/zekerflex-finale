"use client";

import { useEffect, useState } from "react";
import { tijdNl, type TekstWijziging } from "@/components/admin/ontwerper/TekstenPaneel";

// ---------------------------------------------------------------------------
// Tabblad Geschiedenis, onderaan: de laatst opgeslagen tekstwijzigingen (wat
// er stond en wat er nu staat). "Bekijk" opent die tekst in het tabblad
// Teksten, waar je onder "Eerdere versies" een oude tekst terugzet.
// ---------------------------------------------------------------------------

const kort = (t: string, n = 110) => (t.length > n ? `${t.slice(0, n).trimEnd()}…` : t) || "(leeg)";

export function TekstWijzigingen({ onBekijk }: { onBekijk: (key: string) => void }) {
  const [lijst, setLijst] = useState<TekstWijziging[] | null>(null);
  const [labels, setLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/content", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { registry?: { key: string; label: string; group?: string }[]; geschiedenis?: TekstWijziging[] } | null) => {
        setLijst((d?.geschiedenis ?? []).slice(0, 40));
        setLabels(Object.fromEntries((d?.registry ?? []).map((i) => [i.key, `${i.group ? `${i.group} — ` : ""}${i.label}`])));
      })
      .catch(() => setLijst([]));
  }, []);

  return (
    <section className="space-y-2 rounded-xl p-4" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}>
      <h2 className="text-sm font-semibold" style={{ color: "var(--a-text)" }}>
        Recente tekstwijzigingen
      </h2>
      {lijst === null ? (
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
          Laden…
        </p>
      ) : !lijst.length ? (
        <p className="text-xs" style={{ color: "var(--a-mute)" }}>
          Nog geen tekst gewijzigd sinds deze geschiedenis bestaat. Elke opgeslagen tekst komt hier, met wat er eerst stond.
        </p>
      ) : (
        <ol className="space-y-2">
          {lijst.map((w) => (
            <li key={w.id} className="rounded-lg p-2.5 text-xs" style={{ background: "var(--a-elev)", color: "var(--a-text)" }}>
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-semibold">{labels[w.key] ?? w.key}</span>
                  <span className="block text-[11px]" style={{ color: "var(--a-mute)" }}>
                    {tijdNl(w.op)}
                  </span>
                </span>
                <button type="button" onClick={() => onBekijk(w.key)} className="a-button flex-shrink-0 text-[11px]">
                  Bekijk
                </button>
              </div>
              <p className="mt-1.5">
                <span style={{ color: "var(--a-mute)" }}>Was: </span>
                {kort(w.oud)}
              </p>
              <p className="mt-0.5">
                <span style={{ color: "var(--a-mute)" }}>Werd: </span>
                {kort(w.nieuw)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
