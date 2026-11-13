"use client";

import { useState } from "react";
import { FORMATEN, type Formaat, type Project } from "@/lib/video/model";
import { STEMMINGEN, type Stemming } from "@/lib/video/muziek";
import { TEKSTVIDEO_LENGTES, TEKSTVIDEO_VOORBEELD, bouwTekstVideo, tekstVideoRegels, verdeelRegels } from "@/lib/video/tekst-video";
import { Venster } from "@/components/admin/video/Venster";

interface Props {
  onSluit: () => void;
  onKlaar: (project: Project, muziek: Stemming | null) => Promise<void>;
}

/** Tekstvideo in één klik: chatbubbels, een 3D-woord, een venster en een eindbeeld, met glitch ertussen. */
export function TekstVideo({ onSluit, onKlaar }: Props) {
  const [tekst, setTekst] = useState(TEKSTVIDEO_VOORBEELD.join("\n"));
  const [formaat, setFormaat] = useState<Formaat>("9:16");
  const [lengte, setLengte] = useState<number>(15);
  const [muziek, setMuziek] = useState<Stemming | "geen">("stoer");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const regels = tekstVideoRegels(tekst);
  const delen = verdeelRegels(regels);

  async function maak() {
    setBezig(true);
    setFout(null);
    try {
      await onKlaar(bouwTekstVideo({ regels, formaat, lengte }), muziek === "geen" ? null : muziek);
    } catch (err) {
      setFout((err as Error).message || "De tekstvideo kon niet gemaakt worden.");
    } finally {
      setBezig(false);
    }
  }

  return (
    <Venster titel="Tekstvideo in één klik" onSluit={bezig ? () => undefined : onSluit} breed>
      <div className="space-y-4">
        <p className="text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
          Zet je tekst regel voor regel neer. De eerste regels worden chatbubbels die woord voor woord groeien, een regel van één woord komt groot in 3D, de laatste zinnen worden in een venster getypt en de laatste regel staat op het eindbeeld. Tussen de delen zit een glitch.
        </p>
        <label className="a-label">
          Tekst (één regel per bericht)
          <textarea className="a-input" rows={8} value={tekst} onChange={(e) => setTekst(e.target.value)} disabled={bezig} />
        </label>

        <ul className="space-y-0.5 rounded-lg p-3 text-[0.75rem]" style={{ background: "var(--a-elev)", color: "var(--a-dim)" }} aria-live="polite">
          <li>
            <span className="font-semibold" style={{ color: "var(--a-text)" }}>Chatbubbels:</span> {delen.bubbels.length ? delen.bubbels.join(" · ") : "geen"}
          </li>
          <li>
            <span className="font-semibold" style={{ color: "var(--a-text)" }}>3D-woord:</span> {delen.woord}
          </li>
          <li>
            <span className="font-semibold" style={{ color: "var(--a-text)" }}>Venster:</span> {delen.venster.length ? delen.venster.join(" · ") : "geen (zet er meer regels bij)"}
          </li>
          <li>
            <span className="font-semibold" style={{ color: "var(--a-text)" }}>Eindbeeld:</span> {delen.eind}
          </li>
        </ul>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="a-label">
            Formaat
            <select className="a-input" value={formaat} onChange={(e) => setFormaat(e.target.value as Formaat)} disabled={bezig}>
              {(Object.keys(FORMATEN) as Formaat[]).map((f) => (
                <option key={f} value={f}>{f}: {FORMATEN[f].kort}</option>
              ))}
            </select>
          </label>
          <label className="a-label">
            Lengte
            <select className="a-input" value={lengte} onChange={(e) => setLengte(Number(e.target.value))} disabled={bezig}>
              {TEKSTVIDEO_LENGTES.map((l) => (
                <option key={l} value={l}>ongeveer {l} seconden</option>
              ))}
            </select>
          </label>
          <label className="a-label">
            Muziek
            <select className="a-input" value={muziek} onChange={(e) => setMuziek(e.target.value as Stemming | "geen")} disabled={bezig}>
              <option value="geen">Geen muziek</option>
              {STEMMINGEN.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>

        {fout && <p role="alert" className="text-[0.8125rem]" style={{ color: "var(--a-crit)" }}>{fout}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="a-button" onClick={onSluit} disabled={bezig}>Annuleren</button>
          <button type="button" className="a-button a-button-primary" onClick={() => void maak()} disabled={bezig || regels.length === 0}>
            {bezig ? "Tekstvideo maken…" : "Maak tekstvideo"}
          </button>
        </div>
        <p className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>
          Je krijgt een gewoon project op de tijdlijn: elke tekst, kleur, stijl en tijd blijft daarna aan te passen. De muziek componeert ZekerFlex zelf, zonder rechten van anderen.
        </p>
      </div>
    </Venster>
  );
}
