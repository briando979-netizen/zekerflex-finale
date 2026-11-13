"use client";

import { useEffect, useState } from "react";
import type { Begrip, GraafKnoop, GraafLijn } from "@/lib/rag/graph-analyse";
import { KnowledgeGraph, type ThemaKort } from "@/components/admin/KnowledgeGraph";
import { Sterrenstelsel } from "@/components/admin/Sterrenstelsel";

// De keuze tussen de vlakke grafiek en het Sterrenstelsel (3D) op Admin → Kennisgraaf. De keuze
// blijft per apparaat bewaard (localStorage, altijd in try/catch); zonder keuze de vlakke weergave,
// die ook de terugweg is als 3D niet kan. three.js wordt pas geladen als iemand het Sterrenstelsel kiest.

export type Weergave = "vlak" | "sterrenstelsel";
const SLEUTEL = "zf:kennisgraaf:modus";

export function KennisgraafWeergave({
  nodes,
  edges,
  begrippen,
  centraal,
  bruggen,
  themas,
  maten,
}: {
  nodes: GraafKnoop[];
  edges: GraafLijn[];
  begrippen: Begrip[];
  centraal: string[];
  bruggen: string[];
  themas: ThemaKort[];
  maten: Record<string, { c: number; b: number }>;
}) {
  const [weergave, setWeergave] = useState<Weergave>("vlak");
  const [geladen, setGeladen] = useState(false);

  useEffect(() => {
    try {
      const w = window.localStorage.getItem(SLEUTEL);
      if (w === "sterrenstelsel") setWeergave("sterrenstelsel");
    } catch {
      /* geen opslag: de vlakke weergave */
    }
    setGeladen(true);
  }, []);

  const kies = (w: Weergave) => {
    setWeergave(w);
    try {
      window.localStorage.setItem(SLEUTEL, w);
    } catch {
      /* dan onthouden we het niet */
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="Weergave van de kennisgraaf">
        <span style={{ color: "var(--a-mute)" }}>Weergave</span>
        <button
          type="button"
          aria-pressed={weergave === "vlak"}
          onClick={() => kies("vlak")}
          className="rounded-md border px-2.5 py-1 font-medium"
          style={{ borderColor: weergave === "vlak" ? "var(--a-ok)" : "var(--a-border)", color: "var(--a-text)", background: weergave === "vlak" ? "var(--a-elev)" : "transparent" }}
        >
          Vlak
        </button>
        <button
          type="button"
          aria-pressed={weergave === "sterrenstelsel"}
          onClick={() => kies("sterrenstelsel")}
          className="rounded-md border px-2.5 py-1 font-medium"
          style={{ borderColor: weergave === "sterrenstelsel" ? "var(--a-ok)" : "var(--a-border)", color: "var(--a-text)", background: weergave === "sterrenstelsel" ? "var(--a-elev)" : "transparent" }}
        >
          Sterrenstelsel (3D)
        </button>
        <span style={{ color: "var(--a-mute)" }}>{weergave === "sterrenstelsel" ? "elke ster een document, elk zonnestelsel een thema, heldere stralen de bruggen" : "elke stip een document, elke ruit een begrip, elke lijn een verband"}</span>
      </div>
      {geladen && weergave === "sterrenstelsel" ? (
        <Sterrenstelsel nodes={nodes} edges={edges} begrippen={begrippen} themas={themas} bruggen={bruggen} onVlak={() => kies("vlak")} />
      ) : (
        <KnowledgeGraph nodes={nodes} edges={edges} begrippen={begrippen} centraal={centraal} bruggen={bruggen} themas={themas} maten={maten} />
      )}
    </div>
  );
}
