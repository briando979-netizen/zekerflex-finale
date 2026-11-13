"use client";

import { useEffect, useState } from "react";
import { miniatuurMomenten, piekenUit } from "@/lib/video/golf";

// ---------------------------------------------------------------------------
// De golfvorm en de kleine beelden van een bestand voor de tijdlijn (13 nov 2026), in de browser zelf: geluid
// ontleden (Web Audio) en beelden uit een verborgen video halen. Eén bestand tegelijk, per bestand onthouden (een
// bestand verandert nooit: een nieuw bestand krijgt een nieuw id). Te lang: niets, de tijdlijn blijft gewoon werken.
// ---------------------------------------------------------------------------

/** Een geluidsbestand hoogstens zo lang (s); langer kost te veel geheugen om te ontleden. */
const MAX_GELUID_SEC = 900;
/** Een video hoogstens zo lang (s): voor de golfvorm moet het hele bestand binnenkomen. */
const MAX_VIDEO_SEC = 300;

/** Een bestand hoogstens zo groot voor een golfvorm: het komt helemaal in het geheugen van de browser (een 4K-video van een telefoon is snel 200 MB). */
const MAX_GOLF_BYTES = 80_000_000;

const golven = new Map<string, Promise<Float32Array | null>>();
const beelden = new Map<string, Promise<string[] | null>>();
let rij: Promise<unknown> = Promise.resolve();

/** Na elkaar, nooit twee tegelijk: decoderen en zoeken in een video kost geheugen en netwerk. */
function naElkaar<T>(taak: () => Promise<T>): Promise<T> {
  const volgende = rij.then(taak, taak);
  rij = volgende.catch(() => undefined);
  return volgende;
}

async function maakGolf(bron: string): Promise<Float32Array | null> {
  try {
    const res = await fetch(bron);
    if (!res.ok) return null;
    // te groot: niet ophalen (de tijdlijn werkt gewoon zonder golfvorm)
    const grootte = Number(res.headers.get("content-length") ?? 0);
    if (grootte > MAX_GOLF_BYTES) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const audio = await new OfflineAudioContext(1, 1, 44_100).decodeAudioData(await res.arrayBuffer());
    const kanalen = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
    return piekenUit(kanalen, audio.sampleRate);
  } catch {
    // geen geluid in het bestand, of een vorm die de browser niet kent: geen golfvorm
    return null;
  }
}

/** Wacht op een gebeurtenis van een video, met een grens; een fout of de grens: afgewezen. */
function wachtOp(el: HTMLMediaElement, soort: string, ms: number): Promise<void> {
  return new Promise((klaar, fout) => {
    let wacht = 0;
    const ok = () => {
      window.clearTimeout(wacht);
      el.removeEventListener(soort, ok);
      el.removeEventListener("error", mis);
      klaar();
    };
    const mis = () => {
      window.clearTimeout(wacht);
      el.removeEventListener(soort, ok);
      el.removeEventListener("error", mis);
      fout(new Error("video laden mislukt"));
    };
    wacht = window.setTimeout(mis, ms);
    el.addEventListener(soort, ok);
    el.addEventListener("error", mis);
  });
}

async function maakBeelden(bron: string, bronDuur: number): Promise<string[] | null> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    const geladen = wachtOp(video, "loadeddata", 15_000);
    video.src = bron;
    await geladen;
    const hoogte = 54;
    const breedte = Math.max(24, Math.round((hoogte * video.videoWidth) / Math.max(1, video.videoHeight)) || 96);
    const canvas = document.createElement("canvas");
    canvas.width = breedte;
    canvas.height = hoogte;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const uit: string[] = [];
    for (const t of miniatuurMomenten(bronDuur)) {
      const gezocht = wachtOp(video, "seeked", 8_000);
      video.currentTime = Math.min(t, Math.max(0, bronDuur - 0.05));
      await gezocht;
      ctx.drawImage(video, 0, 0, breedte, hoogte);
      uit.push(canvas.toDataURL("image/jpeg", 0.6));
    }
    return uit;
  } catch {
    return null;
  } finally {
    video.removeAttribute("src");
    video.load();
  }
}

/** De golfvorm van een bestand: één keer ontleed, daarna uit het geheugen (ook voor Op de maat). Null = kan niet. */
export function golfVan(bron: string): Promise<Float32Array | null> {
  let bezig = golven.get(bron);
  if (!bezig) {
    bezig = naElkaar(() => maakGolf(bron));
    golven.set(bron, bezig);
  }
  return bezig;
}

/** De golfvorm (pieken, 0..1 per 1/60 s bron) van een bestand, of null zolang hij er niet is of niet kan. */
export function useGolf(bron: string, bronDuur: number | null, geluid: boolean): Float32Array | null {
  const [golf, setGolf] = useState<Float32Array | null>(null);
  useEffect(() => {
    const mag = Boolean(bron) && (geluid ? bronDuur === null || bronDuur <= MAX_GELUID_SEC : bronDuur !== null && bronDuur <= MAX_VIDEO_SEC);
    if (!mag) return;
    let weg = false;
    void golfVan(bron).then((g) => {
      if (!weg) setGolf(g);
    });
    return () => {
      weg = true;
    };
  }, [bron, bronDuur, geluid]);
  return golf;
}

/** Kleine beelden (data-adressen) uit een video op de momenten van miniatuurMomenten, of null. */
export function useMiniaturen(bron: string, bronDuur: number | null): string[] | null {
  const [lijst, setLijst] = useState<string[] | null>(null);
  useEffect(() => {
    if (!bron || bronDuur === null || !(bronDuur > 0) || bronDuur > 36_000) return;
    let weg = false;
    let bezig = beelden.get(bron);
    if (!bezig) {
      bezig = naElkaar(() => maakBeelden(bron, bronDuur));
      beelden.set(bron, bezig);
    }
    void bezig.then((b) => {
      if (!weg) setLijst(b);
    });
    return () => {
      weg = true;
    };
  }, [bron, bronDuur]);
  return lijst;
}
