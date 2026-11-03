"use client";

import { useEffect, useRef, useState } from "react";

// Achtergrondvideo zonder geluid (hun eigen sfeervideo), met een pauzeknop.
// Het stilstaande beeld staat er meteen; de video laadt pas als de pagina
// klaar is, zodat de rest niet op 6 MB video wacht. Wie "minder beweging" of
// databesparing heeft ingesteld, houdt het stilstaande beeld; de knop laadt
// de video dan alsnog op verzoek.

const zuinig = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

export function HeroVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [speelt, setSpeelt] = useState(false);

  // de video pas ophalen als hij echt gaat spelen
  const laad = () => {
    const v = ref.current;
    if (v && !v.getAttribute("src")) v.src = src;
    return v;
  };

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true; // nodig voor automatisch afspelen
    if (zuinig() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = () => void laad()?.play().catch(() => setSpeelt(false));
    if (document.readyState === "complete") {
      start();
      return;
    }
    window.addEventListener("load", start, { once: true });
    return () => window.removeEventListener("load", start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <>
      <video
        ref={ref}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        aria-label={label}
        onPlay={() => setSpeelt(true)}
        onPause={() => setSpeelt(false)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <button
        type="button"
        onClick={() => {
          const v = laad();
          if (!v) return;
          if (v.paused) void v.play();
          else v.pause();
        }}
        aria-label={speelt ? "Video pauzeren" : "Video afspelen"}
        // linksboven: onderin liggen de schuine fotokaartjes van de collage over het kader
        className="absolute left-3 top-3 z-10 grid h-10 w-10 place-items-center rounded-full bg-schw-night/75 text-schw-cream ring-1 ring-white/20 transition-colors hover:bg-schw-orange hover:text-schw-night"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          {speelt ? <path d="M3 2h3v10H3zM8 2h3v10H8z" fill="currentColor" /> : <path d="M3 1.5v11l9-5.5z" fill="currentColor" />}
        </svg>
      </button>
    </>
  );
}
