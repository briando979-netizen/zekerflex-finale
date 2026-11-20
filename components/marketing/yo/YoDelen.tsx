import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Reveal } from "@/components/marketing/Reveal";
import type { YoKaart } from "@/lib/marketing/yo-home";

// ---------------------------------------------------------------------------
// De bouwstenen van de openbare site in de opzet van YoungOnes (20 nov 2026): nachtblauw, turquoise, koppen in
// kapitalen, een rode krabbel, lichtlila vlakken. Servercomponenten zonder staat; de tabbladen staan apart in
// YoTabs.tsx (client). Teksten komen uit lib/marketing/yo-home.ts en werk-home.ts; foto's zijn onze eigen campagnefoto's.
// ---------------------------------------------------------------------------

/** de knoppen: turquoise met nachtblauwe tekst, of omlijnd */
export const YO_KNOP = "inline-flex min-h-[48px] items-center justify-center rounded-lg bg-yo-teal px-5 text-base font-bold text-yo-night transition hover:brightness-105";
export const YO_KNOP_OMLIJND = "inline-flex min-h-[48px] items-center justify-center rounded-lg border-2 border-yo-teal px-5 text-base font-bold text-yo-tealInk transition hover:bg-yo-teal/10";
export const YO_KNOP_OMLIJND_WIT = "inline-flex min-h-[48px] items-center justify-center rounded-lg border-2 border-white/70 px-5 text-base font-bold text-white transition hover:bg-white/10";
/** de grote koppen: kapitalen, extra vet, strak op elkaar */
export const YO_KOP = "font-display font-extrabold uppercase leading-[0.95] tracking-tight";

/** Een vinkje in een rondje, turquoise (de drie punten onder de kop). */
export function YoVink() {
  return (
    <span aria-hidden className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border-2 border-yo-teal text-yo-tealInk">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
        <path d="M5 12l5 5L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function YoPunten({ punten, licht = false }: { punten: readonly string[]; licht?: boolean }) {
  return (
    <ul className={`mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium ${licht ? "text-white/85" : "text-yo-navy"}`}>
      {punten.map((p) => (
        <li key={p} className="flex items-center gap-2">
          <YoVink />
          {p}
        </li>
      ))}
    </ul>
  );
}

/** De rode handgeschreven krabbel over een foto ("Maak er werk van", "Ga ervoor"). Decoratie: niet voor schermlezers. */
export function YoKrabbel({ tekst, className = "" }: { tekst: string; className?: string }) {
  return (
    <span aria-hidden className={`pointer-events-none select-none ${YO_KOP} -rotate-6 text-yo-red italic drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)] ${className}`}>
      {tekst}
      <svg viewBox="0 0 200 18" className="mt-1 block h-3 w-full" preserveAspectRatio="none">
        <path d="M3 12 C 40 2, 80 16, 120 7 S 175 3, 197 11" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** De lichtlila schuine vlakken achter de witte kop (de "slashes" van YoungOnes). */
export function YoVlakken() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-24 top-0 h-full w-[46%] -skew-x-[18deg] bg-yo-grey" />
      <div className="absolute right-[-10%] top-0 h-full w-[32%] -skew-x-[18deg] bg-yo-grey" />
    </div>
  );
}

/**
 * Foto links, nachtblauw tekstvlak rechts ("Wij maken werk anders", "Werk kan beter"). `omgekeerd` zet de foto rechts.
 */
export function YoSplit({
  foto,
  alt,
  kop,
  intro,
  tekst,
  slot,
  knoppen,
  omgekeerd = false,
  licht = false,
}: {
  foto: string;
  alt: string;
  kop: string;
  intro?: string;
  tekst: string;
  slot?: string;
  knoppen: ReactNode;
  omgekeerd?: boolean;
  /** wit vlak met nachtblauwe tekst in plaats van nachtblauw met wit */
  licht?: boolean;
}) {
  return (
    <section className={`grid overflow-hidden md:grid-cols-2 ${licht ? "bg-white text-yo-navy" : "bg-yo-navy text-white"}`}>
      <div className={`relative aspect-[4/3] md:aspect-auto md:min-h-[32rem] ${omgekeerd ? "md:order-2" : ""}`}>
        <Image src={foto} alt={alt} fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
      </div>
      <Reveal className="flex flex-col justify-center px-6 py-10 md:px-12 lg:px-16 lg:py-16">
        <h2 className={`${YO_KOP} text-3xl md:text-4xl lg:text-5xl`}>{kop}</h2>
        {intro && <p className="mt-5 text-lg">{intro}</p>}
        <p className={`mt-4 max-w-xl text-base leading-relaxed ${licht ? "text-yo-navy/80" : "text-white/85"}`}>{tekst}</p>
        {slot && <p className="mt-4 font-display text-base font-bold italic">{slot}</p>}
        <div className="mt-7 flex flex-wrap gap-3">{knoppen}</div>
      </Reveal>
    </section>
  );
}

/** Nachtblauw blok met een genummerde lijst (rode cijfers in een cirkel): "Werk, op jouw manier". */
export function YoGenummerd({ kop, items }: { kop: string; items: readonly { titel: string; tekst: string }[] }) {
  return (
    <section className="bg-yo-navy text-white">
      <div className="shell-4k py-12 md:py-16">
        <Reveal>
          <h2 className={`${YO_KOP} text-3xl md:text-4xl lg:text-5xl`}>{kop}</h2>
        </Reveal>
        <ol className="mt-10 grid gap-8 md:grid-cols-2 md:gap-x-12">
          {items.map((it, i) => (
            <Reveal key={it.titel} as="li" delay={i * 80} className="flex gap-5">
              <span aria-hidden className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-full border-[3px] border-yo-red font-display text-2xl font-extrabold italic text-yo-red">
                {i + 1}
              </span>
              <div>
                <h3 className={`${YO_KOP} text-xl`}>{it.titel}</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-white/80">{it.tekst}</p>
              </div>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** "Ontmoet de werkers": lichtlila vlak, tekst links, een rij staande fotokaarten rechts met een kop in kapitalen. */
export function YoCommunity({ kop, tekst, knoppen, kaarten }: { kop: string; tekst: string; knoppen: ReactNode; kaarten: readonly YoKaart[] }) {
  return (
    <section className="bg-yo-grey text-yo-navy">
      <div className="shell-4k grid gap-8 py-12 md:grid-cols-[1fr_2fr] md:py-16">
        <Reveal>
          <h2 className={`${YO_KOP} text-3xl md:text-4xl`}>{kop}</h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-yo-navy/80">{tekst}</p>
          <div className="mt-6 flex flex-wrap gap-3">{knoppen}</div>
        </Reveal>
        {/* een vegende rij op de telefoon, vier naast elkaar op een groot scherm */}
        <ul className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
          {kaarten.map((k, i) => (
            <Reveal key={k.kop} as="li" delay={i * 80} className="relative w-[70%] flex-shrink-0 snap-start md:w-auto">
              <div className="relative aspect-[4/5] overflow-hidden rounded-lg">
                <Image src={k.foto} alt={k.alt} fill sizes="(min-width: 768px) 20vw, 70vw" className="object-cover" />
              </div>
              <h3 className={`${YO_KOP} mt-3 text-lg`}>{k.kop}</h3>
              <p className="mt-1 text-sm text-yo-navy/75">{k.tekst}</p>
            </Reveal>
          ))}
        </ul>
        <div aria-hidden className="h-1 w-24 rounded-full bg-yo-red md:col-start-2" />
      </div>
    </section>
  );
}

/** De fotostrook met de rode krabbel eroverheen ("Ga ervoor"). */
export function YoStrook({ fotos, krabbel }: { fotos: readonly { foto: string; alt: string }[]; krabbel: string }) {
  return (
    <section className="relative grid grid-cols-3 bg-yo-navy">
      {fotos.map((f) => (
        <div key={f.foto} className="relative aspect-square md:aspect-[4/3]">
          <Image src={f.foto} alt={f.alt} fill sizes="33vw" className="object-cover" />
        </div>
      ))}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <YoKrabbel tekst={krabbel} className="text-4xl md:text-6xl lg:text-7xl" />
      </div>
    </section>
  );
}

/** Drie korte kolommen onder de kop van de bedrijvenpagina ("Geen gedoe. Geen verrassingen. Geen losse eindjes."). */
export function YoDrie({ items }: { items: readonly { kop: string; tekst: string }[] }) {
  return (
    <section className="bg-white text-yo-navy">
      <div className="shell-4k grid gap-8 py-12 md:grid-cols-3 md:py-16">
        {items.map((it, i) => (
          <Reveal key={it.kop} delay={i * 80}>
            <h2 className={`${YO_KOP} text-2xl`}>{it.kop}</h2>
            <p className="mt-3 text-base leading-relaxed text-yo-navy/80">{it.tekst}</p>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function YoLink({ href, children, omlijnd = false, wit = false }: { href: string; children: ReactNode; omlijnd?: boolean; wit?: boolean }) {
  return (
    <Link href={href} className={omlijnd ? (wit ? YO_KNOP_OMLIJND_WIT : YO_KNOP_OMLIJND) : YO_KNOP}>
      {children}
    </Link>
  );
}
