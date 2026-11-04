"use client";

import Link from "next/link";
import { useState } from "react";
import { BALK_COOKIE, BALK_KLEUREN, type Balk } from "@/lib/ontwerp/balk";

// De aankondigingsbalk boven de site (instellen: Site-ontwerper → Menu).
// Wegklikken onthoudt deze tekst 30 dagen in een cookie, zodat de server hem
// daarna niet meer toont (geen flits bij het laden).

const isExtern = (href: string) => /^(mailto:|tel:|https?:)/.test(href);

export function AankondigingsBalk({ balk, id }: { balk: Balk; id: string }) {
  const [dicht, setDicht] = useState(false);
  if (dicht) return null;
  const kleur = BALK_KLEUREN[balk.kleur];
  return (
    <div role="region" aria-label="Aankondiging" className={`${kleur.klasse} relative px-10 py-2 text-center text-sm font-medium`}>
      <span>{balk.tekst}</span>
      {balk.link && balk.linkTekst ? (
        <>
          {" "}
          {isExtern(balk.link) ? (
            <a href={balk.link} className={`font-semibold ${kleur.link}`}>
              {balk.linkTekst}
            </a>
          ) : (
            <Link href={balk.link} className={`font-semibold ${kleur.link}`}>
              {balk.linkTekst}
            </Link>
          )}
        </>
      ) : null}
      {balk.sluitbaar ? (
        <button
          type="button"
          onClick={() => {
            document.cookie = `${BALK_COOKIE}=${id}; Max-Age=${60 * 60 * 24 * 30}; Path=/; SameSite=Lax`;
            setDicht(true);
          }}
          aria-label="Aankondiging sluiten"
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-base leading-none opacity-80 hover:opacity-100"
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
