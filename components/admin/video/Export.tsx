"use client";

import { useEffect, useRef, useState } from "react";
import { FORMATEN, type Project } from "@/lib/video/model";
import { kiesOpnameFormaat, type Speler } from "@/lib/video/speler";
import { Venster } from "@/components/admin/video/Venster";
import { tijdTekst, uploadBestand } from "@/components/admin/video/api";

interface Props {
  project: Project;
  speler: Speler | null;
  duur: number;
  onSluit: () => void;
  onMelding: (tekst: string, soort?: "ok" | "fout") => void;
  onBewaard: () => Promise<void>;
}

export function Export({ project, speler, duur, onSluit, onMelding, onBewaard }: Props) {
  const [kwaliteit, setKwaliteit] = useState<"1080" | "720">("1080");
  const [voortgang, setVoortgang] = useState<number | null>(null);
  const [resultaat, setResultaat] = useState<{ blob: Blob; url: string; ext: string } | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [bewaar, setBewaar] = useState<"bestanden" | "site" | null>(null);
  const stop = useRef<AbortController | null>(null);
  const formaat = kiesOpnameFormaat();
  const maat = FORMATEN[project.formaat];
  const schaal = kwaliteit === "1080" ? 1 : 2 / 3;

  useEffect(
    () => () => {
      if (resultaat) URL.revokeObjectURL(resultaat.url);
    },
    [resultaat],
  );

  async function start() {
    if (!speler || !formaat) return;
    setFout(null);
    setResultaat(null);
    setVoortgang(0);
    stop.current = new AbortController();
    try {
      const blob = await speler.exporteer({ schaal, formaat, onVoortgang: setVoortgang, signaal: stop.current.signal });
      setResultaat({ blob, url: URL.createObjectURL(blob), ext: formaat.ext });
    } catch (err) {
      if ((err as DOMException).name !== "AbortError") setFout((err as Error).message || "Exporteren mislukt.");
    } finally {
      setVoortgang(null);
      stop.current = null;
    }
  }

  const bestandsnaam = `${project.naam.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "video"}.${resultaat?.ext ?? "mp4"}`;

  async function naarBestanden() {
    if (!resultaat) return;
    setBewaar("bestanden");
    try {
      await uploadBestand(resultaat.blob, project.naam, "export", duur);
      await onBewaard();
      onMelding("De video staat bij Media (links in de editor).");
    } catch (err) {
      onMelding((err as Error).message, "fout");
    } finally {
      setBewaar(null);
    }
  }

  async function naarSite() {
    if (!resultaat) return;
    setBewaar("site");
    try {
      const fd = new FormData();
      fd.append("bestand", new File([resultaat.blob], bestandsnaam, { type: resultaat.blob.type }));
      const res = await fetch("/api/admin/ontwerp/media", { method: "POST", body: fd });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) throw new Error(data?.error?.message ?? "Plaatsen mislukt.");
      onMelding("De video staat in de mediabibliotheek van de Site-ontwerper; zet hem daar op een pagina.");
    } catch (err) {
      onMelding((err as Error).message, "fout");
    } finally {
      setBewaar(null);
    }
  }

  return (
    <Venster titel="Video exporteren" onSluit={voortgang !== null ? () => stop.current?.abort() : onSluit}>
      <div className="space-y-4">
        {!formaat && <p role="alert" className="text-[0.8125rem]" style={{ color: "var(--a-crit)" }}>Deze browser kan geen video opnemen. Gebruik Chrome, Edge of Safari.</p>}
        {!resultaat && (
          <>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Kwaliteit">
              {(["1080", "720"] as const).map((k) => {
                const s = k === "1080" ? 1 : 2 / 3;
                return (
                  <button key={k} type="button" onClick={() => setKwaliteit(k)} aria-pressed={kwaliteit === k} disabled={voortgang !== null} className={`a-button flex-col items-start text-left ${kwaliteit === k ? "a-button-primary" : ""}`}>
                    <span className="font-semibold">{k === "1080" ? "Full HD (hoogste)" : "HD (kleiner bestand)"}</span>
                    <span className="text-[0.6875rem] opacity-80">
                      {Math.round((maat.w * s) / 2) * 2} × {Math.round((maat.h * s) / 2) * 2}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[0.75rem]" style={{ color: "var(--a-dim)" }}>
              De video wordt in echte tijd opgenomen ({tijdTekst(duur)}) als {formaat?.ext === "mp4" ? "MP4" : "WebM"}. Houd dit tabblad open en zichtbaar tot het klaar is.
            </p>
            {voortgang !== null ? (
              <div className="space-y-2" aria-live="polite">
                <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--a-elev)" }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.round(voortgang * 100)}%`, background: "var(--a-accent)", transition: "width .2s" }} />
                </div>
                <p className="text-[0.75rem]" style={{ color: "var(--a-mute)" }}>Bezig: {Math.round(voortgang * 100)}%</p>
                <button type="button" className="a-button text-xs" onClick={() => stop.current?.abort()}>Stoppen</button>
              </div>
            ) : (
              <button type="button" className="a-button a-button-primary w-full" disabled={!formaat || !speler} onClick={() => void start()}>
                Exporteren starten
              </button>
            )}
          </>
        )}
        {resultaat && (
          <div className="space-y-3">
            <video src={resultaat.url} controls playsInline className="max-h-[50vh] w-full rounded-lg bg-black" />
            <p className="text-[0.75rem]" style={{ color: "var(--a-mute)" }}>
              {(resultaat.blob.size / 1_000_000).toFixed(1).replace(".", ",")} MB, {resultaat.ext.toUpperCase()}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <a href={resultaat.url} download={bestandsnaam} className="a-button a-button-primary justify-center text-xs">Downloaden</a>
              <button type="button" className="a-button text-xs" disabled={bewaar !== null} onClick={() => void naarBestanden()}>
                {bewaar === "bestanden" ? "Bewaren…" : "Bewaar bij Media"}
              </button>
              <button type="button" className="a-button text-xs" disabled={bewaar !== null || resultaat.blob.size > 80_000_000} onClick={() => void naarSite()} title={resultaat.blob.size > 80_000_000 ? "Groter dan 80 MB: te groot voor de site" : undefined}>
                {bewaar === "site" ? "Plaatsen…" : "Zet op de website"}
              </button>
            </div>
            <button type="button" className="a-button text-xs" onClick={() => setResultaat(null)}>Opnieuw exporteren</button>
          </div>
        )}
        {fout && <p role="alert" className="text-[0.8125rem]" style={{ color: "var(--a-crit)" }}>{fout}</p>}
      </div>
    </Venster>
  );
}
