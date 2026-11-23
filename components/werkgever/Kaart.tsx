import type { ReactNode } from "react";
import { BLOK_KOP, BLOK_UITLEG, KAART, KAART_VULLING, kl } from "@/components/werkgever/bouwstenen";

// Een kaart in de werkgeversapp: wit, afgeronde hoeken, dunne rand (23 nov 2026). Met een titel krijgt hij een kop (h2) met
// een optionele regel uitleg en rechts een plek voor een actie; zonder titel is het alleen het vlak. Geen hooks: ook een
// servercomponent kan hem tonen.

export function Kaart({
  titel,
  uitleg,
  actie,
  children,
  className,
  vulling = true,
  id,
}: {
  titel?: string | undefined;
  uitleg?: string | undefined;
  /** rechts naast de titel, bijvoorbeeld een schakelaar of een link */
  actie?: ReactNode;
  children?: ReactNode;
  className?: string | undefined;
  /** false = de inhoud loopt tot de rand (een lijst of tabel) */
  vulling?: boolean;
  id?: string | undefined;
}) {
  return (
    <section id={id} className={kl(KAART, className)}>
      {titel ? (
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className={BLOK_KOP}>{titel}</h2>
            {uitleg ? <p className={BLOK_UITLEG}>{uitleg}</p> : null}
          </div>
          {actie}
        </div>
      ) : null}
      {children ? <div className={vulling ? KAART_VULLING : undefined}>{children}</div> : null}
    </section>
  );
}
