"use client";

import { useEffect, useRef, useState } from "react";

// Achtergrondvideo zonder geluid (hun eigen sfeervideo), met een pauzeknop.
// Wie "minder beweging" heeft ingesteld, ziet eerst het stilstaande beeld.

export function HeroVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [speelt, setSpeelt] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true; // nodig voor automatisch afspelen
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    v.play().catch(() => setSpeelt(false));
  }, []);

  return (
    <>
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={label}
        onPlay={() => setSpeelt(true)}
        onPause={() => setSpeelt(false)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <button
        type="button"
        onClick={() => {
          const v = ref.current;
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
