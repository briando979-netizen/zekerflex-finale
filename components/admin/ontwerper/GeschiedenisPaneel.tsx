"use client";

import { LETTERTYPES, type OntwerpVersie } from "@/lib/ontwerp/thema";

// ---------------------------------------------------------------------------
// Tabblad Geschiedenis: de laatste 30 gepubliceerde versies. Terugzetten zet
// een versie in het concept; je bekijkt hem in het voorbeeld en publiceert zelf.
// ---------------------------------------------------------------------------

const tijd = (iso: string) =>
  new Date(iso).toLocaleString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function GeschiedenisPaneel({ versies, onTerug, bezig }: { versies: OntwerpVersie[]; onTerug: (v: OntwerpVersie) => void; bezig: boolean }) {
  if (!versies.length) {
    return (
      <p className="rounded-xl p-4 text-sm" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)", color: "var(--a-mute)" }}>
        Nog niets gepubliceerd met de ontwerper. Elke keer dat je publiceert, komt hier een versie bij die je later terug kunt zetten.
      </p>
    );
  }
  return (
    <ol className="space-y-2">
      {versies.map((v, i) => (
        <li key={v.id} className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--a-panel)", border: "1px solid var(--a-border)" }}>
          <span className="flex h-9 w-16 flex-shrink-0 overflow-hidden rounded-md" aria-hidden="true">
            <span className="flex-1" style={{ background: v.thema.inkt }} />
            <span className="flex-1" style={{ background: v.thema.primair }} />
            <span className="flex-1" style={{ background: v.thema.accent }} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold" style={{ color: "var(--a-text)" }}>
              {i === 0 ? "Nu live · " : ""}
              {tijd(v.op)}
            </span>
            <span className="block truncate text-xs" style={{ color: "var(--a-mute)" }}>
              {v.notitie || `${LETTERTYPES[v.thema.koppen].label}, ${v.thema.hoeken === "standaard" ? "afgeronde" : v.thema.hoeken} hoeken`}
            </span>
          </span>
          <button type="button" onClick={() => onTerug(v)} disabled={bezig} className="a-button flex-shrink-0 text-xs">
            Zet terug
          </button>
        </li>
      ))}
    </ol>
  );
}
