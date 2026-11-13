"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  einde,
  magneet,
  magneetPunten,
  projectDuur,
  rond,
  snijBegin,
  snijEinde,
  vervangClip,
  vrijePlek,
  type AudioClip,
  type BeeldClip,
  type Clip,
  type Project,
  type Spoor,
  type SpoorSoort,
} from "@/lib/video/model";
import { tijdTekst } from "@/components/admin/video/api";
import { PIEKEN_PER_SECONDE, golfPad, kiesMiniaturen, miniatuurMomenten } from "@/lib/video/golf";
import { slagenOpLijn } from "@/lib/video/maat";
import { useGolf, useMiniaturen } from "@/components/admin/video/tijdlijn-media";

export const SLEEP_TYPE = "application/x-zf-video";

/** Wat er vanuit de bibliotheek op de tijdlijn gesleept kan worden. */
export interface SleepData {
  soort: "foto" | "video" | "audio" | "tekst" | "kleur";
  bron?: string;
  naam?: string;
  duur?: number;
  preset?: string;
  rol?: "muziek" | "stem" | "effect";
  /** Vaste plek op de tijdlijn (bv. muziek vanaf 0); anders de afspeelkop. */
  start?: number;
}

export const spoorVoor = (soort: SleepData["soort"] | Clip["soort"]): SpoorSoort => (soort === "tekst" ? "tekst" : soort === "audio" ? "audio" : "beeld");

interface Sleep {
  id: string;
  modus: "verplaats" | "begin" | "einde";
  x0: number;
  orig: Clip;
  nu: Clip;
  bewogen: boolean;
}

interface Props {
  project: Project;
  tijd: number;
  speelt: boolean;
  zoom: number;
  selectie: string | null;
  magneetAan: boolean;
  onSelecteer: (id: string | null) => void;
  onZoek: (t: number) => void;
  onWijzig: (fn: (p: Project) => Project) => void;
  onNeerzetten: (data: SleepData, spoor: string, t: number) => void;
  onSpoor: (id: string, wijziging: Partial<Spoor>) => void;
  onSpoorErbij: (soort: SpoorSoort) => void;
}

const KOP = 128;
const RIJ: Record<SpoorSoort, number> = { beeld: 54, tekst: 34, audio: 40 };
const LINIAAL = 26;

function clipStijl(c: Clip): CSSProperties {
  if (c.soort === "foto") {
    return { backgroundImage: `linear-gradient(rgba(0,0,0,.15),rgba(0,0,0,.45)), url("${c.bron}")`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x", backgroundColor: "#173b33" };
  }
  if (c.soort === "video") return { background: "repeating-linear-gradient(90deg,#1d4d6b 0 18px,#174260 18px 20px)" };
  if (c.soort === "kleur") return { background: c.kleur2 ? `linear-gradient(90deg, ${c.kleur}, ${c.kleur2})` : c.kleur };
  if (c.soort === "tekst") return { background: "#463f86" };
  return {
    background: c.soort === "audio" && c.rol === "stem" ? "#1d5a49" : "#5a4a1d",
    backgroundImage: "repeating-linear-gradient(90deg, rgba(255,255,255,.28) 0 2px, transparent 2px 5px)",
    backgroundSize: "100% 46%",
    backgroundPosition: "0 50%",
    backgroundRepeat: "repeat-x",
  };
}

function clipLabel(c: Clip): string {
  if (c.soort === "tekst") return c.tekst || "Tekst";
  if (c.soort === "kleur") return c.naam || "Kleurvlak";
  return c.naam || (c.soort === "audio" ? "Audio" : "Clip");
}

function OogIcoon({ uit }: { uit: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {uit && <path d="M3 3l18 18" />}
    </svg>
  );
}

function GeluidIcoon({ uit }: { uit: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      {uit ? <path d="M23 9l-6 6M17 9l6 6" /> : <path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14" />}
    </svg>
  );
}

/** Kleine beelden uit de video en de golfvorm van zijn geluid, voor het stuk bron dat de clip laat zien. */
function VideoStrook({ clip, zoom, hoogte }: { clip: BeeldClip; zoom: number; hoogte: number }) {
  const lijst = useMiniaturen(clip.bron, clip.bronDuur);
  const golf = useGolf(clip.bron, clip.bronDuur, false);
  const breedte = Math.max(6, clip.duur * zoom);
  const van = clip.inpunt;
  const tot = clip.inpunt + clip.duur * clip.snelheid;
  const vak = Math.max(24, Math.round((hoogte * 16) / 9));
  const golfHoogte = Math.round(hoogte * 0.42);
  const keuze = useMemo(
    () => (lijst && clip.bronDuur ? kiesMiniaturen(miniatuurMomenten(clip.bronDuur), van, tot, Math.min(80, Math.ceil(breedte / vak))) : []),
    [lijst, clip.bronDuur, van, tot, breedte, vak],
  );
  const pad = useMemo(() => (golf ? golfPad(golf, PIEKEN_PER_SECONDE, van, tot, breedte, golfHoogte) : ""), [golf, van, tot, breedte, golfHoogte]);
  return (
    <>
      {keuze.map((i, n) => {
        const beeld = lijst?.[i];
        return beeld ? (
          <span
            key={n}
            aria-hidden="true"
            className="pointer-events-none absolute top-0 h-full"
            style={{ left: n * vak, width: vak, backgroundImage: `url("${beeld}")`, backgroundSize: "cover", backgroundPosition: "center", opacity: 0.8 }}
          />
        ) : null;
      })}
      {pad && (
        <svg aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0" width={breedte} height={golfHoogte} style={{ background: "linear-gradient(transparent, rgba(0,0,0,.45))" }}>
          <path d={pad} stroke="rgba(255,255,255,.75)" strokeWidth={1.2} fill="none" />
        </svg>
      )}
    </>
  );
}

/** De golfvorm van een geluidsclip: waar het hard en zacht is. */
function GeluidGolf({ clip, zoom, hoogte }: { clip: AudioClip; zoom: number; hoogte: number }) {
  const golf = useGolf(clip.bron, clip.bronDuur, true);
  const breedte = Math.max(6, clip.duur * zoom);
  const van = clip.inpunt;
  const tot = clip.inpunt + clip.duur * clip.snelheid;
  const pad = useMemo(() => (golf ? golfPad(golf, PIEKEN_PER_SECONDE, van, tot, breedte, hoogte) : ""), [golf, van, tot, breedte, hoogte]);
  if (!pad) return null;
  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={breedte} height={hoogte} style={{ background: clip.rol === "stem" ? "#1d5a49" : "#5a4a1d" }}>
      <path d={pad} stroke="rgba(255,255,255,.55)" strokeWidth={1.2} fill="none" />
    </svg>
  );
}

/** De maatslagen van een muziekclip (Op de maat) als streepjes bovenin. */
function Slagen({ clip, zoom }: { clip: AudioClip; zoom: number }) {
  const lijn = useMemo(() => slagenOpLijn(clip).slice(0, 600), [clip]);
  return (
    <>
      {lijn.map((t, i) => (
        <span key={i} aria-hidden="true" className="pointer-events-none absolute top-0" style={{ left: (t - clip.start) * zoom, width: 1, height: 7, background: "rgba(255,255,255,.9)" }} />
      ))}
    </>
  );
}

export function Tijdlijn({ project, tijd, speelt, zoom, selectie, magneetAan, onSelecteer, onZoek, onWijzig, onNeerzetten, onSpoor, onSpoorErbij }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sleep, setSleep] = useState<Sleep | null>(null);
  // Laatste sleepstand voor het loslaten (een state-updater mag geen ouder bijwerken).
  const sleepRef = useRef<Sleep | null>(null);
  useEffect(() => {
    sleepRef.current = sleep;
  }, [sleep]);
  const [kopSleep, setKopSleep] = useState(false);
  const duur = projectDuur(project);
  const breedte = Math.max((duur + 12) * zoom, 600);
  const stap = zoom >= 90 ? 1 : zoom >= 45 ? 2 : zoom >= 20 ? 5 : zoom >= 8 ? 10 : 30;

  const tikken = useMemo(() => {
    const uit: number[] = [];
    for (let s = 0; s * zoom < breedte; s += stap) uit.push(s);
    return uit;
  }, [zoom, breedte, stap]);

  // Afspeelkop in beeld houden tijdens het afspelen.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !speelt) return;
    const x = tijd * zoom;
    if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - KOP - 40) el.scrollLeft = Math.max(0, x - 80);
  }, [tijd, zoom, speelt]);

  // Slepen van clips: verplaatsen, of een rand bijsnijden.
  useEffect(() => {
    if (!sleep) return;
    const verplaats = (e: PointerEvent) => {
      setSleep((s) => {
        if (!s) return s;
        const dt = (e.clientX - s.x0) / zoom;
        const bewogen = s.bewogen || Math.abs(e.clientX - s.x0) > 3;
        const drempel = magneetAan ? 8 / zoom : 0;
        const punten = magneetAan ? magneetPunten(project, s.id, tijd) : [];
        let nu: Clip;
        if (s.modus === "verplaats") {
          let start = Math.max(0, s.orig.start + dt);
          const gesnapt = magneet(start, punten, drempel);
          if (gesnapt !== start) start = gesnapt;
          else {
            const eind = magneet(start + s.orig.duur, punten, drempel);
            start = Math.max(0, eind - s.orig.duur);
          }
          // Naar een ander spoor van dezelfde soort?
          let spoor = s.nu.spoor;
          const onder = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-spoor]");
          const doel = onder?.dataset.spoor;
          const doelSpoor = project.sporen.find((x) => x.id === doel);
          if (doelSpoor && !doelSpoor.slot && doelSpoor.soort === spoorVoor(s.orig.soort)) spoor = doelSpoor.id;
          nu = { ...s.orig, start: rond(start), spoor } as Clip;
        } else if (s.modus === "begin") {
          nu = snijBegin(s.orig, magneet(s.orig.start + dt, punten, drempel));
        } else {
          nu = snijEinde(s.orig, magneet(einde(s.orig) + dt, punten, drempel));
        }
        return { ...s, nu, bewogen };
      });
    };
    const los = () => {
      const s = sleepRef.current;
      if (s?.bewogen) {
        const klaar = s.nu;
        onWijzig((p) => {
          const start = s.modus === "verplaats" ? vrijePlek(p, klaar.spoor, klaar.duur, klaar.start, klaar.id) : klaar.start;
          return vervangClip(p, { ...klaar, start } as Clip);
        });
      }
      setSleep(null);
    };
    window.addEventListener("pointermove", verplaats);
    window.addEventListener("pointerup", los);
    window.addEventListener("pointercancel", los);
    return () => {
      window.removeEventListener("pointermove", verplaats);
      window.removeEventListener("pointerup", los);
      window.removeEventListener("pointercancel", los);
    };
    // Alleen opnieuw koppelen als het slepen begint of eindigt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleep?.id, sleep?.modus]);

  const tijdBij = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left - KOP + el.scrollLeft) / zoom);
  };

  // Afspeelkop slepen via de liniaal.
  useEffect(() => {
    if (!kopSleep) return;
    const verplaats = (e: PointerEvent) => onZoek(tijdBij(e.clientX));
    const los = () => setKopSleep(false);
    window.addEventListener("pointermove", verplaats);
    window.addEventListener("pointerup", los);
    return () => {
      window.removeEventListener("pointermove", verplaats);
      window.removeEventListener("pointerup", los);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kopSleep, zoom]);

  const beginSleep = (e: ReactPointerEvent, c: Clip, modus: Sleep["modus"]) => {
    if (e.button !== 0) return;
    const spoor = project.sporen.find((s) => s.id === c.spoor);
    e.stopPropagation();
    onSelecteer(c.id);
    if (spoor?.slot) return;
    setSleep({ id: c.id, modus, x0: e.clientX, orig: c, nu: c, bewogen: false });
  };

  const neerzetten = (e: DragEvent<HTMLDivElement>, spoor: Spoor) => {
    e.preventDefault();
    const ruw = e.dataTransfer.getData(SLEEP_TYPE);
    if (!ruw) return;
    try {
      const data = JSON.parse(ruw) as SleepData;
      const r = e.currentTarget.getBoundingClientRect();
      const t = Math.max(0, (e.clientX - r.left) / zoom);
      const doel = spoorVoor(data.soort) === spoor.soort ? spoor.id : (project.sporen.find((s) => s.soort === spoorVoor(data.soort))?.id ?? spoor.id);
      onNeerzetten(data, doel, rond(t, 100));
    } catch {
      /* geen geldige sleepdata */
    }
  };

  return (
    <div className="select-none overflow-hidden rounded-lg" style={{ border: "1px solid var(--a-border)", background: "var(--a-panel)" }}>
      <div ref={scrollRef} className="relative overflow-x-auto overflow-y-hidden" style={{ maxWidth: "100%" }}>
        <div style={{ width: breedte + KOP, position: "relative" }}>
          {/* Liniaal */}
          <div className="sticky top-0 z-20 flex" style={{ height: LINIAAL, background: "var(--a-elev)", borderBottom: "1px solid var(--a-border)" }}>
            <div className="sticky left-0 z-30 flex items-center px-2 text-[0.6875rem] font-mono" style={{ width: KOP, minWidth: KOP, background: "var(--a-elev)", color: "var(--a-mute)", borderRight: "1px solid var(--a-border)" }}>
              {tijdTekst(tijd, true)} / {tijdTekst(duur)}
            </div>
            <div
              className="relative flex-1 cursor-pointer"
              onPointerDown={(e) => {
                onZoek(tijdBij(e.clientX));
                setKopSleep(true);
              }}
              role="slider"
              aria-label="Afspeelpositie"
              aria-valuemin={0}
              aria-valuemax={Math.round(duur)}
              aria-valuenow={Math.round(tijd)}
              tabIndex={-1}
            >
              {tikken.map((s) => (
                <div key={s} className="absolute top-0 h-full" style={{ left: s * zoom }}>
                  <div style={{ width: 1, height: 8, background: "var(--a-border)" }} />
                  <span className="absolute left-1 top-2 font-mono text-[0.625rem]" style={{ color: "var(--a-mute)" }}>
                    {tijdTekst(s)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Sporen */}
          {project.sporen.map((spoor) => {
            const hoogte = RIJ[spoor.soort];
            const clips = project.clips.filter((c) => c.spoor === spoor.id);
            const zwevend = sleep && sleep.bewogen && sleep.nu.spoor === spoor.id && sleep.orig.spoor !== spoor.id ? sleep.nu : null;
            return (
              <div key={spoor.id} className="flex" style={{ height: hoogte + 8, borderBottom: "1px solid var(--a-border)" }}>
                <div className="sticky left-0 z-10 flex items-center gap-1 px-2" style={{ width: KOP, minWidth: KOP, background: "var(--a-panel)", borderRight: "1px solid var(--a-border)" }}>
                  <span className="min-w-0 flex-1 truncate text-[0.75rem] font-medium" style={{ color: spoor.verborgen || spoor.stil ? "var(--a-mute)" : "var(--a-text)" }} title={spoor.naam}>
                    {spoor.naam}
                  </span>
                  {spoor.soort !== "audio" && (
                    <button type="button" className="rounded p-1" style={{ color: "var(--a-mute)" }} onClick={() => onSpoor(spoor.id, { verborgen: !spoor.verborgen })} aria-label={spoor.verborgen ? `${spoor.naam} tonen` : `${spoor.naam} verbergen`} aria-pressed={Boolean(spoor.verborgen)}>
                      <OogIcoon uit={Boolean(spoor.verborgen)} />
                    </button>
                  )}
                  {spoor.soort !== "tekst" && (
                    <button type="button" className="rounded p-1" style={{ color: "var(--a-mute)" }} onClick={() => onSpoor(spoor.id, { stil: !spoor.stil })} aria-label={spoor.stil ? `${spoor.naam} geluid aan` : `${spoor.naam} dempen`} aria-pressed={Boolean(spoor.stil)}>
                      <GeluidIcoon uit={Boolean(spoor.stil)} />
                    </button>
                  )}
                </div>
                <div
                  data-spoor={spoor.id}
                  className="relative flex-1"
                  style={{ background: spoor.verborgen ? "repeating-linear-gradient(45deg, transparent 0 6px, var(--a-elev) 6px 12px)" : undefined }}
                  onPointerDown={(e) => {
                    if (e.target === e.currentTarget) {
                      onSelecteer(null);
                      onZoek(tijdBij(e.clientX));
                    }
                  }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes(SLEEP_TYPE)) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "copy";
                    }
                  }}
                  onDrop={(e) => neerzetten(e, spoor)}
                >
                  {[...clips, ...(zwevend ? [zwevend] : [])].map((c) => {
                    const toon = sleep && sleep.id === c.id ? sleep.nu : c;
                    if (toon.spoor !== spoor.id) return null;
                    const gekozen = selectie === c.id;
                    return (
                      <div
                        key={c.id}
                        className="absolute top-1 overflow-hidden rounded-md text-[0.6875rem] font-medium text-white"
                        style={{
                          ...clipStijl(toon),
                          left: toon.start * zoom,
                          width: Math.max(6, toon.duur * zoom),
                          height: hoogte,
                          outline: gekozen ? "2px solid #4FE0A0" : "1px solid rgba(0,0,0,.35)",
                          outlineOffset: gekozen ? 0 : -1,
                          cursor: spoor.slot ? "default" : "grab",
                          opacity: sleep && sleep.id === c.id && sleep.bewogen ? 0.85 : 1,
                          zIndex: gekozen ? 2 : 1,
                        }}
                        onPointerDown={(e) => beginSleep(e, c, "verplaats")}
                        title={`${clipLabel(toon)} (${toon.duur.toFixed(1)} s)`}
                      >
                        {toon.soort === "video" && <VideoStrook clip={toon} zoom={zoom} hoogte={hoogte} />}
                        {toon.soort === "audio" && <GeluidGolf clip={toon} zoom={zoom} hoogte={hoogte} />}
                        {toon.soort === "audio" && toon.slagen && <Slagen clip={toon} zoom={zoom} />}
                        {/* sleutelbeelden als ruitjes onderin (lib/video/model.ts standOp) */}
                        {(toon.soort === "foto" || toon.soort === "video" || toon.soort === "kleur") &&
                          toon.sleutelbeelden
                            ?.filter((k) => k.t >= 0 && k.t <= toon.duur)
                            .map((k, i) => (
                              <span
                                key={`k${i}`}
                                aria-hidden="true"
                                className="pointer-events-none absolute bottom-1 h-2 w-2 rotate-45"
                                style={{ left: k.t * zoom - 4, background: "#ffffff", border: "1px solid rgba(0,0,0,.55)" }}
                              />
                            ))}
                        <span className="pointer-events-none absolute inset-x-2 top-1 truncate" style={{ textShadow: "0 1px 2px rgba(0,0,0,.8)" }}>
                          {clipLabel(toon)}
                        </span>
                        {(toon.soort === "foto" || toon.soort === "video" || toon.soort === "kleur") && toon.overgang !== "geen" && (
                          <span className="pointer-events-none absolute left-0 top-0 h-full" style={{ width: Math.min(toon.overgangDuur * zoom, toon.duur * zoom), background: "linear-gradient(90deg, rgba(79,224,160,.55), transparent)" }} />
                        )}
                        {!spoor.slot && (
                          <>
                            <span className="absolute left-0 top-0 h-full w-2 cursor-ew-resize" style={{ background: gekozen ? "rgba(79,224,160,.9)" : "transparent" }} onPointerDown={(e) => beginSleep(e, c, "begin")} aria-hidden="true" />
                            <span className="absolute right-0 top-0 h-full w-2 cursor-ew-resize" style={{ background: gekozen ? "rgba(79,224,160,.9)" : "transparent" }} onPointerDown={(e) => beginSleep(e, c, "einde")} aria-hidden="true" />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Afspeelkop */}
          <div className="pointer-events-none absolute top-0 z-30" style={{ left: KOP + tijd * zoom - 1, height: "100%", width: 2, background: "#ff4d4f" }}>
            <div className="absolute -left-[5px] top-0 h-3 w-3 rotate-45" style={{ background: "#ff4d4f" }} />
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5" style={{ borderTop: "1px solid var(--a-border)", background: "var(--a-elev)" }}>
        <span className="text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>Spoor erbij:</span>
        <button type="button" className="a-button text-xs" onClick={() => onSpoorErbij("beeld")}>+ Beeld</button>
        <button type="button" className="a-button text-xs" onClick={() => onSpoorErbij("tekst")}>+ Tekst</button>
        <button type="button" className="a-button text-xs" onClick={() => onSpoorErbij("audio")}>+ Geluid</button>
        <span className="ml-auto text-[0.6875rem]" style={{ color: "var(--a-mute)" }}>Sleep clips om te verplaatsen, sleep een rand om bij te snijden.</span>
      </div>
    </div>
  );
}
