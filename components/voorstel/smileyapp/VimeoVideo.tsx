"use client";

import { useState } from "react";
import Image from "next/image";

// Hun animatiefilmpje van Vimeo, privacyvriendelijk zoals YouTubeEmbed: eerst
// alleen ons eigen stilstaande beeld (public/voorstel/smileyapp), en pas na een
// klik de speler van Vimeo met dnt=1 (geen volgcookies). De CSP staat
// player.vimeo.com alleen in de omgeving van dit voorstel toe (lib/security/csp.ts).

const ID = /^\d{6,12}$/;

export function VimeoVideo({ id, titel, poster, duur, pagina }: { id: string; titel: string; poster: string; duur: string; pagina: string }) {
  const [speel, setSpeel] = useState(false);
  if (!ID.test(id)) return null;
  return (
    <figure>
      <div className="relative aspect-video w-full overflow-hidden rounded-[1.75rem] bg-[#06150F] shadow-[0_40px_90px_-30px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
        {speel ? (
          <iframe
            src={`https://player.vimeo.com/video/${id}?dnt=1&autoplay=1&title=0&byline=0&portrait=0`}
            title={titel}
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <button type="button" onClick={() => setSpeel(true)} aria-label={`Video afspelen: ${titel} (${duur})`} className="group absolute inset-0 h-full w-full text-left">
            <Image src={poster} alt="" fill sizes="(min-width: 1024px) 620px, 100vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
            <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[#06150F]/80 via-transparent to-transparent" />
            <span aria-hidden="true" className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-smiley-sun text-smiley-ink shadow-[0_0_0_10px_rgba(253,209,26,0.25)] transition-transform group-hover:scale-110">
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
              </svg>
            </span>
            <span aria-hidden="true" className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3 text-sm font-bold text-white">
              <span className="truncate">{titel}</span>
              <span className="shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-xs backdrop-blur">{duur}</span>
            </span>
          </button>
        )}
      </div>
      <figcaption className="mt-3 text-xs text-white/70">
        Afspelen laadt de video van Vimeo, zonder volgcookies.{" "}
        <a href={pagina} target="_blank" rel="noopener noreferrer" className="font-semibold text-white underline underline-offset-2">
          Bekijk op Vimeo
        </a>
      </figcaption>
    </figure>
  );
}
