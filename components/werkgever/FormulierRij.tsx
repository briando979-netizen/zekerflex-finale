import type { ReactNode } from "react";
import { BLOK_KOP, FORMULIER_RIJ } from "@/components/werkgever/bouwstenen";

// Eén blok van een formulier in twee kolommen (23 nov 2026, zoals Bedrijfsprofiel en Factuurgegevens bij YoungOnes): links de
// kop en een regel uitleg, rechts de velden. Op een telefoon staan ze onder elkaar. Meerdere blokken onder elkaar in één
// kaart krijgen vanzelf een dunne lijn ertussen. Geen hooks en geen <form>: de pagina of het veldenscherm bepaalt zelf waar
// het formulier begint en eindigt (nooit een formulier in een formulier).

export function FormulierRij({
  titel,
  uitleg,
  children,
  id,
}: {
  titel: string;
  uitleg?: string | undefined;
  children: ReactNode;
  /** een anker, zodat een link van elders hier uitkomt (bijvoorbeeld #notificaties) */
  id?: string | undefined;
}) {
  return (
    <div id={id} className={`${FORMULIER_RIJ}${id ? " scroll-mt-24" : ""}`}>
      <div className="min-w-0">
        <h2 className={BLOK_KOP}>{titel}</h2>
        {uitleg ? <p className="mt-1 text-sm leading-relaxed text-neutralx-500">{uitleg}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
