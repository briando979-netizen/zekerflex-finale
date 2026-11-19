"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TAAL_EIGEN, TAAL_WOORD, taalLinks, taalVanPad } from "@/lib/voorstel/smileyapp-taal";

// De taalkiezer van het SmileyApp-voorstel: NL · EN · DE. Hij staat in de band
// boven de kop (vanaf lg; in de kop zelf is op 1024 en 1280 px geen ruimte
// naast het menu en de knoppen), in het uitklapmenu op de telefoon en in de
// footer. Op een pagina die in alle talen bestaat (sinds deel 6b alles behalve
// de blog) blijf je op dezelfde pagina; op de blog leiden EN en DE naar de
// voorpagina in die taal (lib/voorstel/smileyapp-taal.ts, taalLinks).

const STIJL = {
  band: { lijst: "gap-0.5 text-xs", maat: "px-2 py-1", gewoon: "text-smiley-ink hover:bg-white/50", actief: "bg-smiley-ink text-white" },
  menu: { lijst: "gap-2 text-sm", maat: "px-4 py-2.5", gewoon: "text-smiley-ink ring-1 ring-smiley-ink/20", actief: "bg-smiley-ink text-white ring-1 ring-smiley-ink" },
  footer: { lijst: "gap-1 text-xs", maat: "px-2.5 py-1.5", gewoon: "text-white/80 ring-1 ring-white/20 hover:text-white", actief: "bg-white text-smiley-ink ring-1 ring-white" },
} as const;

export function TaalKiezer({ variant }: { variant: keyof typeof STIJL }) {
  const pad = usePathname();
  const stijl = STIJL[variant];
  return (
    <nav aria-label={TAAL_WOORD[taalVanPad(pad)]}>
      <ul className={`flex items-center font-bold ${stijl.lijst}`}>
        {taalLinks(pad).map((l) => (
          <li key={l.taal}>
            {/* relative: de verborgen naam van de taal (sr-only) blijft binnen de link */}
            <Link href={l.href} hrefLang={l.taal} lang={l.taal} aria-current={l.actief ? "true" : undefined} className={`relative block rounded-full ${stijl.maat} ${l.actief ? stijl.actief : stijl.gewoon}`}>
              {l.taal.toUpperCase()}
              <span className="sr-only"> {TAAL_EIGEN[l.taal]}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
