"use client";

import { useEffect, useRef, useState } from "react";

// Een video die vanzelf begint zodra hij in beeld komt (18 nov 2026, eigenaar: "zorg dat het filmpje nu auto wordt afgespeeld en
// niet op een play knopje of iets te drukken hoeft"). Een browser laat een video alleen vanzelf starten zónder geluid: hij begint
// dus stil, met een knop "Geluid aan" erop (die begint opnieuw, met de stem). Hij laadt pas als hij in beeld komt, pauzeert buiten
// beeld en begint niet opnieuw als de bezoeker hem zelf heeft stilgezet. Bij "minder beweging" start hij niet vanzelf.
export function ZelfSpelendeVideo({ src, poster, className }: { src: string; poster: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [stil, setStil] = useState(true);
  const [loopt, setLoopt] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let inBeeld = false;
    let zelfGestopt = false; // de bezoeker zette hem stil, of hij is afgelopen
    let wijPauzeren = false;
    const bijPauze = () => {
      if (wijPauzeren) wijPauzeren = false;
      else if (inBeeld) zelfGestopt = true;
    };
    const kijker = new IntersectionObserver(
      (items) => {
        inBeeld = (items[0]?.intersectionRatio ?? 0) >= 0.5;
        if (inBeeld && v.paused && !zelfGestopt) {
          v.muted = true;
          void v.play().catch(() => undefined); // mag niet van de browser: dan blijft de gewone afspeelknop
        } else if (!inBeeld && !v.paused) {
          wijPauzeren = true;
          v.pause();
        }
      },
      { threshold: [0, 0.5] },
    );
    kijker.observe(v);
    v.addEventListener("pause", bijPauze);
    return () => {
      kijker.disconnect();
      v.removeEventListener("pause", bijPauze);
    };
  }, []);

  const geluidAan = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = false;
    v.currentTime = 0;
    void v.play().catch(() => undefined);
  };

  return (
    <div className="relative">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={ref}
        controls
        muted
        playsInline
        preload="none"
        poster={poster}
        src={src}
        className={className}
        onPlay={() => setLoopt(true)}
        onEnded={() => setLoopt(false)}
        onVolumeChange={(e) => setStil(e.currentTarget.muted)}
      />
      {loopt && stil ? (
        <button
          type="button"
          onClick={geluidAan}
          className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/70 px-3.5 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-black/85"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 5 6 9H3v6h3l5 4V5z" />
            <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
          </svg>
          Geluid aan
        </button>
      ) : null}
    </div>
  );
}
