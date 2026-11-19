import type { ReactNode } from "react";
import Link from "next/link";
import { BASE, looptijdTekst, prijsTekst, type Pakket } from "@/lib/voorstel/smileyapp";

// Bouwstenen van het SmileyApp-voorstel (server): een sectiekop, een vinkje
// en de prijskaart. De prijzen komen altijd uit lib/voorstel/smileyapp.ts.

export function Kopje({ boven, kop, licht = false, id, children }: { boven?: string; kop: string; licht?: boolean; id?: string; children?: ReactNode }) {
  return (
    <div className="sm-onthul max-w-3xl">
      {boven && <p className={`text-xs font-bold uppercase tracking-[0.2em] ${licht ? "text-smiley-sun" : "text-smiley-leaf"}`}>{boven}</p>}
      <h2 id={id} className={`mt-3 font-display text-[clamp(2rem,5vw,3.4rem)] font-bold leading-[1.02] tracking-[-0.02em] [hyphens:auto] md:[hyphens:manual] ${licht ? "text-white" : "text-smiley-ink"}`}>
        {kop}
      </h2>
      {children}
    </div>
  );
}

export function Vinkje({ licht = false }: { licht?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill={licht ? "#FDD11A" : "#5ABA8E"} />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#0E2A20" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PakketKaart({ p }: { p: Pakket }) {
  const donker = p.uitgelicht;
  const looptijd = looptijdTekst(p);
  return (
    <article
      aria-labelledby={`pakket-${p.id}`}
      className={`sm-til relative flex h-full flex-col rounded-[2rem] p-7 pt-9 ${
        donker ? "bg-smiley-ink text-white shadow-[0_40px_80px_-30px_rgba(14,42,32,0.7)] xl:-my-5 xl:py-12" : "bg-white text-smiley-ink ring-1 ring-smiley-ink/10"
      }`}
    >
      <p className={`absolute -top-3.5 left-7 rounded-full px-3.5 py-1 text-xs font-bold uppercase tracking-wider ${donker ? "bg-smiley-sun text-smiley-ink" : "bg-smiley-green text-smiley-ink"}`}>
        {p.label}
      </p>
      <h3 id={`pakket-${p.id}`} className="font-display text-2xl font-bold">
        {p.naam}
      </h3>
      <p className="mt-5">
        <span className={`block font-display text-[2rem] font-bold leading-none tracking-tight ${donker ? "text-smiley-sun" : "text-smiley-ink"}`}>{prijsTekst(p)}</span>
        {p.prijs !== null && <span className={`mt-1.5 block text-sm font-semibold ${donker ? "text-white/75" : "text-smiley-mute"}`}>maandelijks</span>}
      </p>
      {looptijd && (
        <p className={`mt-3 inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${donker ? "bg-white/10 text-white" : "bg-smiley-mint text-smiley-leaf"}`}>{looptijd}</p>
      )}
      {p.onderdelen.length > 0 && (
        <ul className="mt-6 space-y-3 text-sm">
          {p.onderdelen.map((o) => (
            <li key={o} className="flex gap-2.5">
              <Vinkje licht={donker} />
              <span>{o}</span>
            </li>
          ))}
        </ul>
      )}
      {p.uitleg && (
        <div className={`mt-5 space-y-3 text-sm leading-relaxed ${donker ? "text-white/80" : "text-smiley-mute"}`}>
          {p.uitleg.map((u) => (
            <p key={u}>{u}</p>
          ))}
        </div>
      )}
      <div className="mt-auto pt-8">
        <Link
          href={`${BASE}/contact?pakket=${p.id}`}
          className={`block rounded-full px-6 py-3.5 text-center font-bold transition-transform hover:-translate-y-0.5 ${donker ? "bg-smiley-sun text-smiley-ink" : "bg-smiley-ink text-white"}`}
        >
          Contact opnemen<span className="sr-only"> over het {p.naam}</span>
        </Link>
        <Link
          href={`${BASE}/demo?pakket=${p.id}`}
          className={`mt-3 block rounded-full px-6 py-3 text-center text-sm font-bold underline-offset-4 hover:underline ${donker ? "text-smiley-sun" : "text-smiley-leaf"}`}
        >
          Demo van dit pakket<span className="sr-only"> ({p.naam})</span>
        </Link>
      </div>
    </article>
  );
}
