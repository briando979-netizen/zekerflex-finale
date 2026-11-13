// ---------------------------------------------------------------------------
// Eigenaar-taak (14 nov 2026): bonnetjesmail (lib/boekhouding/bonnen/mail-taak.ts). De vlag "boekhouding-bonnen-mail" staat
// aan, maar de taak kan niets doen zolang er geen mailbox of geen echte administratie is. Dat is een inrichtingsfout, geen
// storing: de taak meldt het hooguit één keer per dag en deze taak laat het de eigenaar zien. Hij vinkt zichzelf af zodra
// beide er zijn. Staat de vlag uit, dan is er niets aan de hand en komt er geen taak. Puur: alleen de stand.
// ---------------------------------------------------------------------------

import type { OwnerTodo } from "@/lib/admin/owner-todos";

export interface BonnenMailStand {
  vlagAan: boolean;
  /** is de mailbox voor bonnetjes ingericht (imapConfig)? */
  mailbox: boolean;
  /** bestaat er een echte, actieve administratie? */
  administratie: boolean;
}

/** De taak bij de stand; `undefined` = niet kunnen lezen (dan geen taak, om niets vals te tonen). */
export function bonnenMailTodo(stand: BonnenMailStand | undefined): OwnerTodo | null {
  if (!stand || !stand.vlagAan) return null;
  const klaar = stand.mailbox && stand.administratie;
  const ontbreekt = [!stand.mailbox ? "de mailbox voor bonnetjes" : null, !stand.administratie ? "een echte administratie" : null].filter(Boolean).join(" en ");
  return {
    id: "bonnen-mail",
    group: "Beheer & veiligheid",
    title: "Bonnetjesmail: inrichten of de vlag uitzetten",
    why: "De vlag boekhouding-bonnen-mail staat aan, zodat bonnetjes die je mailt vanzelf in de boekhouding komen. Zolang er geen mailbox en geen echte administratie is, kan dat niet werken en blijft de taak stil. Richt het in, of zet de vlag uit.",
    how: [
      "Wil je bonnetjes per mail verwerken? Maak in Beheer → Boekhouding de echte administratie aan en laat de mailbox voor bonnetjes (bonnetjes@) instellen op de server.",
      "Wil je dat nu nog niet? Zet de vlag boekhouding-bonnen-mail uit in Beheer → Systeem → tab Functies aan en uit.",
      "Deze taak vinkt zichzelf af zodra de mailbox en de administratie er zijn.",
    ],
    auto: true,
    done: klaar,
    doneNote: klaar ? "mailbox en administratie zijn er" : `nog niet: er ontbreekt ${ontbreekt}`,
  };
}
