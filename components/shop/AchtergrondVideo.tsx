"use client";

import { useEffect, useState } from "react";
import { magVideoSpelen } from "@/lib/ontwerp/achtergrond-core";

// Achtergrondvideo: eerst alleen het kleine stilstaande beeld (dat is het
// LCP-element en kost weinig). De video start pas na het laden, niet bij
// "minder beweging" of databesparing, en op een telefoon zonder vooraf te laden.
export function AchtergrondVideo({ src, poster }: { src: string; poster: string | null }) {
  const [speel, setSpeel] = useState(false);
  const [mobiel, setMobiel] = useState(true);
  useEffect(() => {
    const minderBeweging = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const verbinding = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    setMobiel(window.matchMedia("(max-width: 767px)").matches);
    setSpeel(magVideoSpelen({ minderBeweging, dataBesparing: verbinding?.saveData === true }));
  }, []);
  return (
    <>
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      {speel ? (
        <video src={src} muted loop playsInline autoPlay preload={mobiel ? "none" : "metadata"} {...(poster ? { poster } : {})} className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
    </>
  );
}
