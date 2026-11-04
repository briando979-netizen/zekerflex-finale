"use client";

import { useState } from "react";
import { FORMATEN, type Formaat, type Project } from "@/lib/video/model";
import { STEMMINGEN, type Stemming } from "@/lib/video/muziek";
import { Venster } from "@/components/admin/video/Venster";
import { postJson, type AiStatus } from "@/components/admin/video/api";

export interface AiVideoKeuze {
  muziek: Stemming | null;
}

interface Props {
  ai: AiStatus | null;
  onSluit: () => void;
  onKlaar: (project: Project, keuze: AiVideoKeuze, meldingen: string[]) => Promise<void>;
}

const VOORBEELDEN = [
  "Vacature: bediening in een restaurant in Rotterdam, flexibel werken",
  "ZekerFlex voor werkgevers: snel personeel voor een drukke zaterdag",
  "Flexwerk via de app: zelf je diensten kiezen en uren schrijven",
  "Werkkleding en veiligheidsschoenen in de ZekerFlex-webshop",
  "Een nieuwe website voor je restaurant, gemaakt door ZekerFlex",
];

const STAPPEN = ["Scenario schrijven", "Beelden kiezen of maken", "Stem inspreken", "Op de tijdlijn zetten"];

export function AiVideo({ ai, onSluit, onKlaar }: Props) {
  const [onderwerp, setOnderwerp] = useState("");
  const [formaat, setFormaat] = useState<Formaat>("9:16");
  const [lengte, setLengte] = useState(30);
  const [stijl, setStijl] = useState<"zakelijk" | "vrolijk" | "stoer" | "rustig" | "luxe">("vrolijk");
  const [stem, setStem] = useState(true);
  const [stemNaam, setStemNaam] = useState("Kore");
  const [aiFotos, setAiFotos] = useState(Boolean(ai?.beeld));
  const [beeldModel, setBeeldModel] = useState<"gemini-3.1-flash-image" | "gemini-3-pro-image">("gemini-3.1-flash-image");
  const [ondertiteling, setOndertiteling] = useState(true);
  const [muziek, setMuziek] = useState<Stemming | "geen">("vrolijk");
  const [bezig, setBezig] = useState(false);
  const [stap, setStap] = useState(0);
  const [fout, setFout] = useState<string | null>(null);

  async function maak() {
    setBezig(true);
    setFout(null);
    setStap(0);
    // De server doet alles in één verzoek; de stappen lopen mee op een schatting.
    const klok = window.setInterval(() => setStap((s) => Math.min(STAPPEN.length - 1, s + 1)), aiFotos ? 14_000 : 6_000);
    try {
      const { project, meldingen } = await postJson<{ project: Project; meldingen: string[] }>(
        "/api/admin/video/auto",
        { onderwerp, formaat, lengte, stijl, stem, stemNaam, aiFotos, beeldModel, ondertiteling },
        "De AI-video kon niet gemaakt worden.",
      );
      setStap(STAPPEN.length - 1);
      await onKlaar(project, { muziek: muziek === "geen" ? null : muziek }, meldingen);
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      window.clearInterval(klok);
      setBezig(false);
    }
  }

  return (
    <Venster titel="Maak een video met AI" onSluit={bezig ? () => undefined : onSluit} breed>
      <div className="space-y-4">
        <label className="a-label">
          Waar gaat de video over?
          <textarea className="a-input" rows={3} value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} placeholder="Bijvoorbeeld: we zoeken magazijnmedewerkers in Tilburg, goede sfeer, direct beginnen" disabled={bezig} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {VOORBEELDEN.map((v) => (
            <button key={v} type="button" className="a-button text-[0.6875rem]" onClick={() => setOnderwerp(v)} disabled={bezig}>
              {v.length > 46 ? `${v.slice(0, 44)}…` : v}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="a-label">
            Formaat
            <select className="a-input" value={formaat} onChange={(e) => setFormaat(e.target.value as Formaat)} disabled={bezig}>
              {(Object.keys(FORMATEN) as Formaat[]).map((f) => (
                <option key={f} value={f}>{f}: {FORMATEN[f].label}</option>
              ))}
            </select>
          </label>
          <label className="a-label">
            Lengte
            <select className="a-input" value={lengte} onChange={(e) => setLengte(Number(e.target.value))} disabled={bezig}>
              {[15, 20, 30, 45, 60].map((l) => (
                <option key={l} value={l}>ongeveer {l} seconden</option>
              ))}
            </select>
          </label>
          <label className="a-label">
            Toon
            <select className="a-input" value={stijl} onChange={(e) => setStijl(e.target.value as typeof stijl)} disabled={bezig}>
              <option value="vrolijk">Vrolijk en energiek</option>
              <option value="zakelijk">Zakelijk en betrouwbaar</option>
              <option value="stoer">Stoer en direct</option>
              <option value="rustig">Rustig en warm</option>
              <option value="luxe">Chic en verfijnd</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
              <input type="checkbox" checked={stem} onChange={(e) => setStem(e.target.checked)} disabled={bezig} /> AI-stem leest voor
            </label>
            {stem && (
              <select className="a-input text-xs" value={stemNaam} onChange={(e) => setStemNaam(e.target.value)} aria-label="Stem" disabled={bezig}>
                <option value="Kore">Kore (vrouw, helder)</option>
                <option value="Aoede">Aoede (vrouw, warm)</option>
                <option value="Leda">Leda (vrouw, jong)</option>
                <option value="Charon">Charon (man, rustig)</option>
                <option value="Puck">Puck (man, vrolijk)</option>
                <option value="Orus">Orus (man, stevig)</option>
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
              <input type="checkbox" checked={aiFotos} onChange={(e) => setAiFotos(e.target.checked)} disabled={bezig || !ai?.beeld} /> AI maakt de foto&apos;s
            </label>
            {aiFotos && (
              <select className="a-input text-xs" value={beeldModel} onChange={(e) => setBeeldModel(e.target.value as typeof beeldModel)} aria-label="Beeldmodel" disabled={bezig}>
                <option value="gemini-3.1-flash-image">Nano Banana 2</option>
                <option value="gemini-3-pro-image">Nano Banana Pro (hoogste)</option>
              </select>
            )}
            {!ai?.beeld && <p className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>Geen beeld-AI: de video gebruikt eigen foto&apos;s.</p>}
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-[0.8125rem]" style={{ color: "var(--a-dim)" }}>
              <input type="checkbox" checked={ondertiteling} onChange={(e) => setOndertiteling(e.target.checked)} disabled={bezig} /> Ondertiteling
            </label>
            <select className="a-input text-xs" value={muziek} onChange={(e) => setMuziek(e.target.value as Stemming | "geen")} aria-label="Muziek" disabled={bezig}>
              <option value="geen">Geen muziek</option>
              {STEMMINGEN.map((s) => (
                <option key={s.id} value={s.id}>Muziek: {s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {ai?.beeldMelding && aiFotos && <p className="rounded-md px-3 py-2 text-[0.75rem]" style={{ background: "var(--a-warn-soft)", color: "var(--a-warn-ink)" }}>{ai.beeldMelding} Tot die tijd neemt de AI passende eigen foto&apos;s.</p>}

        {bezig && (
          <ol className="space-y-1 rounded-lg p-3 text-[0.8125rem]" style={{ background: "var(--a-elev)" }} aria-live="polite">
            {STAPPEN.map((s, i) => (
              <li key={s} style={{ color: i < stap ? "var(--a-ok-ink)" : i === stap ? "var(--a-text)" : "var(--a-mute)" }}>
                {i < stap ? "✓" : i === stap ? "…" : "○"} {s}
              </li>
            ))}
          </ol>
        )}
        {fout && <p role="alert" className="text-[0.8125rem]" style={{ color: "var(--a-crit)" }}>{fout}</p>}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className="a-button" onClick={onSluit} disabled={bezig}>Annuleren</button>
          <button type="button" className="a-button a-button-primary" onClick={() => void maak()} disabled={bezig || onderwerp.trim().length < 3}>
            {bezig ? "AI maakt je video…" : "✨ Maak video"}
          </button>
        </div>
        <p className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>
          Je krijgt een gewoon project op de tijdlijn: alles (tekst, foto&apos;s, stem, muziek, volgorde) blijft daarna aan te passen.
        </p>
      </div>
    </Venster>
  );
}
