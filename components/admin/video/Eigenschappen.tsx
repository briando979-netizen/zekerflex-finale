"use client";

import { useId, useState, type ReactNode } from "react";
import {
  FILTER_PRESETS,
  FORMATEN,
  LETTERTYPES,
  STIJL_VLAK,
  maxDuur,
  zetSnelheid,
  type AudioClip,
  type BeeldClip,
  type Clip,
  type Formaat,
  type Project,
  type TekstClip,
} from "@/lib/video/model";
import { AUDIO_TALEN } from "@/lib/asr/bestand";

interface Props {
  project: Project;
  clip: Clip | null;
  /** Clip bijwerken; `sleutel` voegt snelle opeenvolgende wijzigingen (schuifjes) samen in de geschiedenis. */
  onClip: (clip: Clip, sleutel?: string) => void;
  onProject: (p: Partial<Pick<Project, "naam" | "formaat" | "achtergrond">>, sleutel?: string) => void;
  onAiBewerk: (clip: BeeldClip, instructie: string) => Promise<void>;
  /** Foto laten bewegen met de gratis video-AI (LTX-2.3). */
  onAiBeweeg: (clip: BeeldClip, omschrijving: string) => Promise<void>;
  /** Ondertitels uit de spraak van een video- of geluidsclip (eigen Whisper). */
  onOndertitels: (clip: BeeldClip | AudioClip, taal: string) => Promise<void>;
  /** Stiltes langer dan `minStilte` seconden uit een video- of geluidsclip halen (op de woordtijden van de spraak). */
  onStiltes: (clip: BeeldClip | AudioClip, taal: string, minStilte: number) => Promise<void>;
  aiBeeld: boolean;
}

function Veld({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="a-label block text-[0.75rem]">
      {label}
      {children}
    </label>
  );
}

function Schuif({ label, waarde, min, max, stap = 1, eenheid = "", onChange }: { label: string; waarde: number; min: number; max: number; stap?: number; eenheid?: string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div>
      <div className="flex items-center justify-between text-[0.75rem]" style={{ color: "var(--a-dim)" }}>
        <label htmlFor={id}>{label}</label>
        <span className="font-mono text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>
          {Number.isInteger(stap) ? Math.round(waarde) : waarde.toFixed(2)}
          {eenheid}
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={stap} value={waarde} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: "var(--a-accent)" }} />
    </div>
  );
}

function Knoppen<T extends string>({ label, waarde, opties, onChange }: { label: string; waarde: T; opties: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="mb-1 text-[0.75rem]" style={{ color: "var(--a-dim)" }}>{label}</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={label}>
        {opties.map((o) => (
          <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={waarde === o.id} className={`a-button text-[0.6875rem] ${waarde === o.id ? "a-button-primary" : ""}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Kop({ children }: { children: ReactNode }) {
  return <p className="pt-2 text-[0.6875rem] font-semibold uppercase tracking-wide" style={{ color: "var(--a-mute)" }}>{children}</p>;
}

function TijdVelden({ clip, onClip }: { clip: Clip; onClip: Props["onClip"] }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <Veld label="Begin (s)">
        <input type="number" className="a-input" min={0} step={0.1} value={clip.start} onChange={(e) => onClip({ ...clip, start: Math.max(0, Number(e.target.value) || 0) }, "start")} />
      </Veld>
      <Veld label="Duur (s)">
        <input type="number" className="a-input" min={0.1} step={0.1} value={clip.duur} onChange={(e) => onClip({ ...clip, duur: Math.min(maxDuur(clip), Math.max(0.1, Number(e.target.value) || 0.1)) }, "duur")} />
      </Veld>
    </div>
  );
}

/** Wat de spraak in een video of geluid kan doen: ondertitels maken en stiltes weghalen (eigen spraakherkenning, gratis). */
function SpraakKnoppen({ clip, onOndertitels, onStiltes }: { clip: BeeldClip | AudioClip; onOndertitels: Props["onOndertitels"]; onStiltes: Props["onStiltes"] }) {
  const [taal, setTaal] = useState("nl");
  const [stilte, setStilte] = useState("0.6");
  const [bezig, setBezig] = useState<"ondertitels" | "stiltes" | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const doe = async (soort: "ondertitels" | "stiltes") => {
    setBezig(soort);
    setFout(null);
    try {
      if (soort === "ondertitels") await onOndertitels(clip, taal);
      else await onStiltes(clip, taal, Number(stilte));
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setBezig(null);
    }
  };
  return (
    <>
      <Kop>Spraak</Kop>
      <p className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>
        Onze eigen spraakherkenning luistert één keer mee, gratis en op onze eigen server. Daarna maak je ondertitels waarin elk woord oplicht als het klinkt, of haal je de stiltes eruit.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Veld label="Taal van de spraak">
          <select className="a-input text-xs" value={taal} onChange={(e) => setTaal(e.target.value)} disabled={bezig !== null}>
            {AUDIO_TALEN.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
        </Veld>
        <Veld label="Stiltes langer dan">
          <select className="a-input text-xs" value={stilte} onChange={(e) => setStilte(e.target.value)} disabled={bezig !== null}>
            {["0.4", "0.6", "1"].map((s) => (
              <option key={s} value={s}>
                {s.replace(".", ",")} s
              </option>
            ))}
          </select>
        </Veld>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="a-button a-button-primary text-xs" disabled={bezig !== null} data-track="video-ondertitels" onClick={() => void doe("ondertitels")}>
          {bezig === "ondertitels" ? "Aan het luisteren…" : "Ondertitels maken"}
        </button>
        <button type="button" className="a-button text-xs" disabled={bezig !== null} data-track="video-stiltes" onClick={() => void doe("stiltes")}>
          {bezig === "stiltes" ? "Aan het luisteren…" : "Stiltes weghalen"}
        </button>
      </div>
      {bezig && (
        <p role="status" className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>
          De eerste keer duurt dit ongeveer de helft van de lengte van de clip; daarna gaat het meteen. Je kunt intussen gewoon verder werken.
        </p>
      )}
      {fout && (
        <p role="alert" className="text-xs" style={{ color: "var(--a-crit)" }}>
          {fout}
        </p>
      )}
    </>
  );
}

function BeeldPaneel({ clip, onClip, onAiBewerk, onAiBeweeg, onOndertitels, onStiltes, aiBeeld }: { clip: BeeldClip; onClip: Props["onClip"]; onAiBewerk: Props["onAiBewerk"]; onAiBeweeg: Props["onAiBeweeg"]; onOndertitels: Props["onOndertitels"]; onStiltes: Props["onStiltes"]; aiBeeld: boolean }) {
  const [instructie, setInstructie] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [beweging, setBeweging] = useState("");
  const [beweegt, setBeweegt] = useState(false);
  const [beweegFout, setBeweegFout] = useState<string | null>(null);
  const zet = (deel: Partial<BeeldClip>, sleutel?: string) => onClip({ ...clip, ...deel }, sleutel);
  return (
    <div className="space-y-3">
      <TijdVelden clip={clip} onClip={onClip} />
      {clip.soort === "kleur" && (
        <div className="grid grid-cols-2 gap-2">
          <Veld label="Kleur">
            <input type="color" className="a-input h-9 p-1" value={clip.kleur} onChange={(e) => zet({ kleur: e.target.value }, "kleur")} />
          </Veld>
          <Veld label="Verloop naar">
            <div className="flex gap-1">
              <input type="color" className="a-input h-9 flex-1 p-1" value={clip.kleur2 || clip.kleur} onChange={(e) => zet({ kleur2: e.target.value }, "kleur2")} />
              {clip.kleur2 && <button type="button" className="a-button text-xs" onClick={() => zet({ kleur2: "" })}>Effen</button>}
            </div>
          </Veld>
        </div>
      )}

      <Kop>Beeld</Kop>
      {clip.soort !== "kleur" && (
        <Knoppen label="Passen" waarde={clip.passen} opties={[{ id: "vullen", label: "Vullend" }, { id: "passend", label: "Hele beeld" }]} onChange={(v) => zet({ passen: v })} />
      )}
      <Schuif label="Grootte" waarde={Math.round(clip.plaatsing.schaal * 100)} min={10} max={300} eenheid="%" onChange={(v) => zet({ plaatsing: { ...clip.plaatsing, schaal: v / 100 } }, "schaal")} />
      <div className="grid grid-cols-2 gap-2">
        <Schuif label="Links / rechts" waarde={Math.round(clip.plaatsing.x * 100)} min={-100} max={100} onChange={(v) => zet({ plaatsing: { ...clip.plaatsing, x: v / 100 } }, "x")} />
        <Schuif label="Omhoog / omlaag" waarde={Math.round(clip.plaatsing.y * 100)} min={-100} max={100} onChange={(v) => zet({ plaatsing: { ...clip.plaatsing, y: v / 100 } }, "y")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Schuif label="Draaien" waarde={clip.plaatsing.draai} min={-180} max={180} eenheid="°" onChange={(v) => zet({ plaatsing: { ...clip.plaatsing, draai: v } }, "draai")} />
        <Schuif label="Zichtbaar" waarde={Math.round(clip.dekking * 100)} min={0} max={100} eenheid="%" onChange={(v) => zet({ dekking: v / 100 }, "dekking")} />
      </div>
      <Knoppen
        label="Beweging (Ken Burns)"
        waarde={clip.beweging}
        opties={[
          { id: "geen", label: "Stil" },
          { id: "inzoomen", label: "Inzoomen" },
          { id: "uitzoomen", label: "Uitzoomen" },
          { id: "links", label: "Naar links" },
          { id: "rechts", label: "Naar rechts" },
          { id: "omhoog", label: "Omhoog" },
        ]}
        onChange={(v) => zet({ beweging: v })}
      />

      <Kop>Overgang vanaf vorige clip</Kop>
      <Knoppen
        label="Soort"
        waarde={clip.overgang}
        opties={[
          { id: "geen", label: "Harde knip" },
          { id: "vervagen", label: "Vervagen" },
          { id: "schuiven", label: "Schuiven" },
          { id: "zoom", label: "Zoom" },
          { id: "wissen", label: "Wissen" },
          { id: "draaien", label: "Draaien" },
          { id: "glitch", label: "Glitch" },
        ]}
        onChange={(v) => zet({ overgang: v })}
      />
      {clip.overgang !== "geen" && <Schuif label="Duur overgang" waarde={clip.overgangDuur} min={0.1} max={2} stap={0.1} eenheid=" s" onChange={(v) => zet({ overgangDuur: v }, "overgangDuur")} />}
      <div className="grid grid-cols-2 gap-2">
        <Schuif label="Invagen" waarde={clip.vervagenIn} min={0} max={3} stap={0.1} eenheid=" s" onChange={(v) => zet({ vervagenIn: v }, "vin")} />
        <Schuif label="Uitvagen" waarde={clip.vervagenUit} min={0} max={3} stap={0.1} eenheid=" s" onChange={(v) => zet({ vervagenUit: v }, "vuit")} />
      </div>

      {clip.soort !== "kleur" && (
        <>
          <Kop>Filters</Kop>
          <div className="grid grid-cols-4 gap-1">
            {FILTER_PRESETS.map((f) => (
              <button key={f.id} type="button" className="a-button px-1 text-[0.6875rem]" onClick={() => zet({ filters: { ...f.filters } })}>
                {f.label}
              </button>
            ))}
          </div>
          <Schuif label="Helderheid" waarde={clip.filters.helderheid} min={30} max={180} eenheid="%" onChange={(v) => zet({ filters: { ...clip.filters, helderheid: v } }, "f-h")} />
          <Schuif label="Contrast" waarde={clip.filters.contrast} min={30} max={200} eenheid="%" onChange={(v) => zet({ filters: { ...clip.filters, contrast: v } }, "f-c")} />
          <Schuif label="Verzadiging" waarde={clip.filters.verzadiging} min={0} max={250} eenheid="%" onChange={(v) => zet({ filters: { ...clip.filters, verzadiging: v } }, "f-v")} />
          <div className="grid grid-cols-2 gap-2">
            <Schuif label="Warmte" waarde={clip.filters.sepia} min={0} max={100} eenheid="%" onChange={(v) => zet({ filters: { ...clip.filters, sepia: v } }, "f-s")} />
            <Schuif label="Kleurtint" waarde={clip.filters.tint} min={-180} max={180} eenheid="°" onChange={(v) => zet({ filters: { ...clip.filters, tint: v } }, "f-t")} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Schuif label="Zwart-wit" waarde={clip.filters.zwartwit} min={0} max={100} eenheid="%" onChange={(v) => zet({ filters: { ...clip.filters, zwartwit: v } }, "f-z")} />
            <Schuif label="Vervaging" waarde={clip.filters.vervaging} min={0} max={20} eenheid=" px" onChange={(v) => zet({ filters: { ...clip.filters, vervaging: v } }, "f-b")} />
          </div>
        </>
      )}

      {clip.soort === "video" && (
        <>
          <Kop>Snelheid en geluid</Kop>
          <Knoppen
            label="Snelheid"
            waarde={String(clip.snelheid)}
            opties={["0.25", "0.5", "1", "1.5", "2", "3"].map((s) => ({ id: s, label: `${s.replace(".", ",")}×` }))}
            onChange={(v) => onClip(zetSnelheid(clip, Number(v)) as BeeldClip)}
          />
          <Schuif label="Volume" waarde={Math.round(clip.volume * 100)} min={0} max={200} eenheid="%" onChange={(v) => zet({ volume: v / 100 }, "volume")} />
          <SpraakKnoppen clip={clip} onOndertitels={onOndertitels} onStiltes={onStiltes} />
        </>
      )}

      {clip.soort === "foto" && (
        <>
          <Kop>Laat bewegen (gratis AI-video)</Kop>
          <textarea className="a-input text-[0.8125rem]" rows={2} value={beweging} onChange={(e) => setBeweging(e.target.value)} placeholder="Wat moet er bewegen? Bijvoorbeeld: de kok draait zich om en lacht, stoom uit de pan, camera schuift langzaam naar voren" />
          <button
            type="button"
            className="a-button a-button-primary w-full text-xs"
            disabled={beweegt}
            onClick={async () => {
              setBeweegt(true);
              setBeweegFout(null);
              try {
                await onAiBeweeg(clip, beweging.trim() || "natuurlijke beweging van de mensen, rustige camerabeweging naar voren");
                setBeweging("");
              } catch (err) {
                setBeweegFout((err as Error).message);
              } finally {
                setBeweegt(false);
              }
            }}
          >
            {beweegt ? "De foto komt tot leven… (1 tot 3 minuten)" : "Laat deze foto bewegen"}
          </button>
          {beweegFout && <p role="alert" className="text-xs" style={{ color: "var(--a-crit)" }}>{beweegFout}</p>}
        </>
      )}

      {clip.soort === "foto" && aiBeeld && (
        <>
          <Kop>Bewerk met AI (Nano Banana)</Kop>
          <textarea className="a-input text-[0.8125rem]" rows={2} value={instructie} onChange={(e) => setInstructie(e.target.value)} placeholder="Bijvoorbeeld: maak het avond, voeg een bouwhelm toe, verwijder de auto" />
          <button
            type="button"
            className="a-button a-button-primary w-full text-xs"
            disabled={bezig || instructie.trim().length < 3}
            onClick={async () => {
              setBezig(true);
              setFout(null);
              try {
                await onAiBewerk(clip, instructie.trim());
                setInstructie("");
              } catch (err) {
                setFout((err as Error).message);
              } finally {
                setBezig(false);
              }
            }}
          >
            {bezig ? "AI bewerkt de foto…" : "Bewerk deze foto"}
          </button>
          {fout && <p role="alert" className="text-xs" style={{ color: "var(--a-crit)" }}>{fout}</p>}
        </>
      )}
    </div>
  );
}

function TekstPaneel({ clip, onClip }: { clip: TekstClip; onClip: Props["onClip"] }) {
  const zet = (deel: Partial<TekstClip>, sleutel?: string) => onClip({ ...clip, ...deel }, sleutel);
  // Chatbubbel en venster hebben een eigen vlak; "achtergrond" kleurt dat vlak.
  const vlak = STIJL_VLAK[clip.stijl];
  return (
    <div className="space-y-3">
      <Veld label="Tekst">
        <textarea className="a-input" rows={3} value={clip.tekst} onChange={(e) => zet({ tekst: e.target.value.slice(0, 400) }, "tekst")} />
      </Veld>
      <TijdVelden clip={clip} onClip={onClip} />
      <div className="grid grid-cols-2 gap-2">
        <Veld label="Lettertype">
          <select className="a-input" value={clip.lettertype} onChange={(e) => zet({ lettertype: e.target.value })} style={{ fontFamily: clip.lettertype }}>
            {LETTERTYPES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </Veld>
        <Veld label="Kleur">
          <input type="color" className="a-input h-9 p-1" value={clip.kleur} onChange={(e) => zet({ kleur: e.target.value }, "kleur")} />
        </Veld>
      </div>
      <Schuif label="Grootte" waarde={clip.grootte} min={15} max={220} onChange={(v) => zet({ grootte: v }, "grootte")} />
      <Knoppen
        label="Stijl"
        waarde={clip.stijl}
        opties={[
          { id: "gewoon", label: "Gewoon" },
          { id: "schaduw", label: "Schaduw" },
          { id: "omlijnd", label: "Omlijnd" },
          { id: "kader", label: "Kader" },
          { id: "neon", label: "Neon" },
          { id: "bubbel-blauw", label: "Chatbubbel blauw" },
          { id: "bubbel-groen", label: "Chatbubbel groen" },
          { id: "venster", label: "Venster" },
          { id: "3d", label: "3D-letters" },
        ]}
        onChange={(v) => zet({ stijl: v })}
      />
      {vlak && (
        <p className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>
          {clip.stijl === "venster" ? "Tip: met Binnenkomen \"Typen\" verschijnt de tekst regel voor regel, met een knipperende cursor." : "Tip: met Binnenkomen \"Woorden één voor één\" groeit de bubbel mee met de tekst."}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[0.75rem]" style={{ color: "var(--a-dim)" }}>
          <input type="checkbox" checked={clip.vet} onChange={(e) => zet({ vet: e.target.checked })} /> Vet
        </label>
        <label className="flex items-center gap-1.5 text-[0.75rem]" style={{ color: "var(--a-dim)" }}>
          <input type="checkbox" checked={clip.karaoke} onChange={(e) => zet({ karaoke: e.target.checked })} /> Woord voor woord oplichten
        </label>
        <label className="flex items-center gap-1.5 text-[0.75rem]" style={{ color: "var(--a-dim)" }}>
          <input type="checkbox" checked={Boolean(clip.achtergrond)} onChange={(e) => zet({ achtergrond: e.target.checked ? (vlak ?? "#000000") : "" })} /> {vlak ? "Andere kleur vlak" : "Vlak erachter"}
        </label>
        {clip.achtergrond && <input type="color" aria-label="Kleur van het vlak" className="a-input h-8 w-12 p-1" value={clip.achtergrond} onChange={(e) => zet({ achtergrond: e.target.value }, "achtergrond")} />}
      </div>
      <Knoppen label="Uitlijning" waarde={clip.uitlijning} opties={[{ id: "links", label: "Links" }, { id: "midden", label: "Midden" }, { id: "rechts", label: "Rechts" }]} onChange={(v) => zet({ uitlijning: v })} />
      <div className="grid grid-cols-2 gap-2">
        <Schuif label="Plek links/rechts" waarde={Math.round(clip.x * 100)} min={0} max={100} eenheid="%" onChange={(v) => zet({ x: v / 100 }, "x")} />
        <Schuif label="Plek boven/onder" waarde={Math.round(clip.y * 100)} min={0} max={100} eenheid="%" onChange={(v) => zet({ y: v / 100 }, "y")} />
      </div>
      <Schuif label="Breedte tekstvak" waarde={Math.round(clip.breedte * 100)} min={20} max={100} eenheid="%" onChange={(v) => zet({ breedte: v / 100 }, "breedte")} />
      <Kop>Animatie</Kop>
      <Knoppen
        label="Binnenkomen"
        waarde={clip.animatieIn}
        opties={[
          { id: "geen", label: "Geen" },
          { id: "vervagen", label: "Vervagen" },
          { id: "opschuiven", label: "Opschuiven" },
          { id: "pop", label: "Pop" },
          { id: "stuiteren", label: "Stuiteren" },
          { id: "typen", label: "Typen" },
          { id: "woorden", label: "Woorden één voor één" },
          { id: "glitch", label: "Glitch" },
        ]}
        onChange={(v) => zet({ animatieIn: v })}
      />
      <Knoppen
        label="Weggaan"
        waarde={clip.animatieUit}
        opties={[
          { id: "geen", label: "Geen" },
          { id: "vervagen", label: "Vervagen" },
          { id: "opschuiven", label: "Opschuiven" },
          { id: "pop", label: "Krimpen" },
          { id: "glitch", label: "Glitch" },
        ]}
        onChange={(v) => zet({ animatieUit: v })}
      />
    </div>
  );
}

function AudioPaneel({ clip, onClip, onOndertitels, onStiltes }: { clip: AudioClip; onClip: Props["onClip"]; onOndertitels: Props["onOndertitels"]; onStiltes: Props["onStiltes"] }) {
  const zet = (deel: Partial<AudioClip>, sleutel?: string) => onClip({ ...clip, ...deel }, sleutel);
  return (
    <div className="space-y-3">
      <TijdVelden clip={clip} onClip={onClip} />
      <Knoppen label="Soort geluid" waarde={clip.rol} opties={[{ id: "muziek", label: "Muziek" }, { id: "stem", label: "Stem" }, { id: "effect", label: "Effect" }]} onChange={(v) => zet({ rol: v })} />
      {clip.rol === "muziek" && <p className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>Muziek gaat vanzelf zachter zolang er een stem klinkt.</p>}
      <Schuif label="Volume" waarde={Math.round(clip.volume * 100)} min={0} max={200} eenheid="%" onChange={(v) => zet({ volume: v / 100 }, "volume")} />
      <div className="grid grid-cols-2 gap-2">
        <Schuif label="Invagen" waarde={clip.vervagenIn} min={0} max={6} stap={0.1} eenheid=" s" onChange={(v) => zet({ vervagenIn: v }, "vin")} />
        <Schuif label="Uitvagen" waarde={clip.vervagenUit} min={0} max={6} stap={0.1} eenheid=" s" onChange={(v) => zet({ vervagenUit: v }, "vuit")} />
      </div>
      <Knoppen
        label="Snelheid"
        waarde={String(clip.snelheid)}
        opties={["0.5", "0.75", "1", "1.25", "1.5", "2"].map((s) => ({ id: s, label: `${s.replace(".", ",")}×` }))}
        onChange={(v) => onClip(zetSnelheid(clip, Number(v)) as AudioClip)}
      />
      <SpraakKnoppen clip={clip} onOndertitels={onOndertitels} onStiltes={onStiltes} />
    </div>
  );
}

export function Eigenschappen({ project, clip, onClip, onProject, onAiBewerk, onAiBeweeg, onOndertitels, onStiltes, aiBeeld }: Props) {
  if (!clip) {
    return (
      <div className="space-y-3">
        <Veld label="Naam van de video">
          <input className="a-input" value={project.naam} maxLength={80} onChange={(e) => onProject({ naam: e.target.value }, "naam")} />
        </Veld>
        <div>
          <p className="mb-1 text-[0.75rem]" style={{ color: "var(--a-dim)" }}>Formaat</p>
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(FORMATEN) as Formaat[]).map((f) => (
              <button key={f} type="button" onClick={() => onProject({ formaat: f })} aria-pressed={project.formaat === f} className={`a-button flex-col items-start text-left text-[0.6875rem] ${project.formaat === f ? "a-button-primary" : ""}`}>
                <span className="font-semibold">{f}</span>
                <span className="opacity-80" title={FORMATEN[f].label}>{FORMATEN[f].kort}</span>
              </button>
            ))}
          </div>
        </div>
        <Veld label="Achtergrondkleur">
          <input type="color" className="a-input h-9 p-1" value={project.achtergrond} onChange={(e) => onProject({ achtergrond: e.target.value }, "achtergrond")} />
        </Veld>
        <div className="rounded-lg p-3 text-[0.75rem]" style={{ background: "var(--a-elev)", color: "var(--a-dim)" }}>
          <p className="mb-1 font-semibold" style={{ color: "var(--a-text)" }}>Sneltoetsen</p>
          <p>Spatie: afspelen of pauzeren</p>
          <p>S: knippen op de afspeelkop</p>
          <p>Delete: gekozen clip weg</p>
          <p>Ctrl+D: dupliceren</p>
          <p>Ctrl+Z / Ctrl+Shift+Z: ongedaan maken / opnieuw</p>
          <p>Pijltjes: één beeldje (met Shift: één seconde)</p>
        </div>
      </div>
    );
  }
  if (clip.soort === "tekst") return <TekstPaneel clip={clip} onClip={onClip} />;
  if (clip.soort === "audio") return <AudioPaneel key={clip.id} clip={clip} onClip={onClip} onOndertitels={onOndertitels} onStiltes={onStiltes} />;
  return <BeeldPaneel key={clip.id} clip={clip} onClip={onClip} onAiBewerk={onAiBewerk} onAiBeweeg={onAiBeweeg} onOndertitels={onOndertitels} onStiltes={onStiltes} aiBeeld={aiBeeld} />;
}
