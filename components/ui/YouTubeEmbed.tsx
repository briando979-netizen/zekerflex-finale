"use client";

import { useState } from "react";

const ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * A YouTube video that plays in the page, privacy friendly: first our own copy
 * of the thumbnail (/api/media/youtube/<id>), and only after a click the
 * youtube-nocookie.com player — so a visitor's browser talks to Google only
 * once they choose to watch. The CSP allows frames from youtube-nocookie.com
 * for exactly this (lib/security/csp.ts).
 */
export function YouTubeEmbed({ id, title, className = "" }: { id: string; title: string; className?: string }) {
  const [play, setPlay] = useState(false);
  if (!ID.test(id)) return null;
  return (
    <figure className={className}>
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        {play ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <button type="button" onClick={() => setPlay(true)} className="group absolute inset-0 h-full w-full text-left" aria-label={`Video afspelen: ${title}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- our own copy of the thumbnail; next/image adds nothing here */}
            <img src={`/api/media/youtube/${id}`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
            <span aria-hidden="true" className="absolute left-1/2 top-1/2 grid h-16 w-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 pl-1 text-2xl text-black shadow-lg transition-transform group-hover:scale-110">
              ▶
            </span>
            <span className="absolute bottom-3 left-4 right-4 text-sm font-semibold text-white drop-shadow">{title}</span>
          </button>
        )}
      </div>
      {!play && <figcaption className="mt-1.5 text-xs opacity-70">Afspelen laadt de video van YouTube.</figcaption>}
    </figure>
  );
}
