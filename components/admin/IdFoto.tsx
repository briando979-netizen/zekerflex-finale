"use client";

import { useState } from "react";

// Foto's van een ID-controle in Admin → Gebruikers. Lukt een foto niet (opgeruimd, of Stripe geeft
// hem niet vrij), dan staat er een nette melding in plaats van een kapot plaatje.

/** Eén tegel (voorkant, achterkant of selfie), klikbaar naar ware grootte. */
export function IdFoto({ src, label }: { src: string; label: string }) {
  const [mislukt, setMislukt] = useState(false);
  if (mislukt) {
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg" style={{ border: "1px dashed var(--a-border)" }} title="Open om te zien waarom">
        <span className="grid aspect-[4/3] w-full place-items-center px-2 text-center text-[11px]" style={{ background: "var(--a-elev)", color: "var(--a-mute)" }}>
          Niet op te halen
        </span>
        <span className="block px-2 py-1 text-[11px] font-medium" style={{ color: "var(--a-dim)" }}>{label}</span>
      </a>
    );
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg" style={{ border: "1px solid var(--a-border)" }} title={`${label} op ware grootte`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label} loading="lazy" onError={() => setMislukt(true)} className="aspect-[4/3] w-full object-cover" style={{ background: "var(--a-elev)" }} />
      <span className="block px-2 py-1 text-[11px] font-medium" style={{ color: "var(--a-dim)" }}>{label}</span>
    </a>
  );
}

/** Het rondje bovenaan de gebruikerspagina: de foto, of de initialen als die niet laadt. */
export function KopFoto({ src, naam, titel, size = 72 }: { src: string; naam: string; titel: string; size?: number }) {
  const [mislukt, setMislukt] = useState(false);
  const initialen = naam.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
  if (mislukt) {
    return (
      <span className="grid flex-shrink-0 place-items-center rounded-full font-semibold" style={{ width: size, height: size, fontSize: size * 0.34, background: "var(--a-elev)", color: "var(--a-dim)" }} aria-hidden>
        {initialen}
      </span>
    );
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" title={titel} className="flex-shrink-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={titel} onError={() => setMislukt(true)} className="rounded-full object-cover" style={{ width: size, height: size, background: "var(--a-elev)", boxShadow: "0 0 0 3px var(--a-page), 0 0 0 4px var(--a-border-strong)" }} />
    </a>
  );
}
