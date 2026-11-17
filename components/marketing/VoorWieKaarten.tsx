"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Reveal } from "./Reveal";
import type { WerkGroep } from "@/lib/marketing/werk-home";

/**
 * De "Voor wie"-kaarten. De persoon komt een stukje uit het kaartje: met de muis
 * zodra je eroverheen gaat (CSS :hover), op de telefoon na een tik (dan blijft het
 * effect ~1,8 s staan). De uitgeknipte persoon ligt precies op de foto, dus in rust
 * zie je er niets van. Beweging staat uit bij "minder beweging" (globals.css).
 */
export function VoorWieKaarten({ items }: { items: WerkGroep[] }) {
  const [actief, setActief] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function tik(i: number) {
    setActief(i);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setActief(null), 1800);
  }

  return (
    <ul className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {items.map((g, i) => (
        <Reveal
          key={g.titel}
          as="li"
          delay={i * 80}
          className={`popkaart overflow-visible rounded-2xl border border-hair bg-white${actief === i ? " is-pop" : ""}`}
        >
          <div className="popkaart-beeld" onPointerDown={() => tik(i)}>
            <div className="popkaart-achter">
              <Image src={g.foto} alt={g.alt} fill sizes="(max-width: 1024px) 50vw, 25vw" className="object-cover" />
            </div>
            {g.uit ? (
              <Image
                src={g.uit}
                alt=""
                aria-hidden
                fill
                sizes="(max-width: 1024px) 50vw, 25vw"
                className="popkaart-pop object-cover"
              />
            ) : null}
          </div>
          <div className="p-3 md:p-4">
            <h3 className="font-display text-base font-semibold md:text-lg">{g.titel}</h3>
            <p className="mt-1 text-sm leading-relaxed text-neutralx-600">{g.tekst}</p>
          </div>
        </Reveal>
      ))}
    </ul>
  );
}
