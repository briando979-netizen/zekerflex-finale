"use client";

import { useEffect, useRef, useState } from "react";

// De bewegende foto in de kop van de voorpagina: ligt over de foto en is pas zichtbaar als hij echt speelt. Zonder het attribuut
// autoplay: een iPhone in de spaarstand weigert vanzelf afspelen en zet dan een grote afspeelknop over het gezicht (18 nov 2026,
// schermafbeelding van de eigenaar). Hier starten we zelf; lukt dat niet, dan blijft de video onzichtbaar (je ziet de foto) en
// proberen we het nog één keer bij de eerste aanraking. Bij "minder beweging" laadt hij niet eens.
export function KopClip({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [speelt, setSpeelt] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    v.muted = true;
    const start = () => {
      void v.play().catch(() => undefined);
    };
    const bijAanraking = () => {
      if (v.paused) start();
    };
    start();
    document.addEventListener("touchend", bijAanraking, { once: true, passive: true });
    document.addEventListener("click", bijAanraking, { once: true });
    return () => {
      document.removeEventListener("touchend", bijAanraking);
      document.removeEventListener("click", bijAanraking);
    };
  }, []);

  return (
    <video
      ref={ref}
      aria-hidden
      tabIndex={-1}
      muted
      loop
      playsInline
      disablePictureInPicture
      preload="none"
      src={src}
      onPlaying={() => setSpeelt(true)}
      className={`kop-clip transition-opacity duration-500 ${speelt ? "opacity-100" : "opacity-0"} ${className ?? ""}`}
    />
  );
}
