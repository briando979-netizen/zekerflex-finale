"use client";

import { useEffect, useState } from "react";
import type { Begrip, GraafKnoop, GraafLijn } from "@/lib/rag/graph-analyse";
import { KnowledgeGraph, type ThemaKort } from "@/components/admin/KnowledgeGraph";
import { Brein } from "@/components/admin/Brein";

// De keuze tussen de vlakke grafiek en het Brein (3D) op Admin → Kennisgraaf. De keuze blijft per
// apparaat bewaard (localStorage, altijd in try/catch); zonder keuze de vlakke weergave, die ook de
// terugweg is als 3D niet kan. three.js wordt pas geladen als iemand het Brein kiest.

export type Weergave = "vlak" | "brein";
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
      if (w === "brein") setWeergave("brein");
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

  const knop = (w: Weergave, tekst: string) => (
    <button
      type="button"
      aria-pressed={weergave === w}
      onClick={() => kies(w)}
      className="rounded-md border px-2.5 py-1 font-medium"
      style={{ borderColor: weergave === w ? "var(--a-ok)" : "var(--a-border)", color: "var(--a-text)", background: weergave === w ? "var(--a-elev)" : "transparent" }}
    >
      {tekst}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="Weergave van de kennisgraaf">
        <span style={{ color: "var(--a-mute)" }}>Weergave</span>
        {knop("vlak", "Vlak")}
        {knop("brein", "Brein (3D)")}
        <span style={{ color: "var(--a-mute)" }}>
          {weergave === "brein" ? "elk geheugenstuk een neuron, elk cluster een thema of bron, stralen tussen verwante stukken; typ onderaan om het brein te voeden" : "elke stip een document, elke ruit een begrip, elke lijn een verband"}
        </span>
      </div>
      {geladen && weergave === "brein" ? (
        <Brein onVlak={() => kies("vlak")} />
      ) : (
        <KnowledgeGraph nodes={nodes} edges={edges} begrippen={begrippen} centraal={centraal} bruggen={bruggen} themas={themas} maten={maten} />
      )}
    </div>
  );
}
