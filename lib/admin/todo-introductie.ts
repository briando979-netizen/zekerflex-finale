// Eigenaar-taak (17 nov 2026): het bol-tegoed voor "Introduceer een bedrijf" (lib/introducties/beloning.ts). Eén taak per
// verschuldigde beloning; ZekerFlex stuurt niets vanzelf. Het afvinken (Te doen, owner-todos:done) is tegelijk de stand
// "beloning verstuurd" die de werker of werkgever ziet. Puur: de regels komen uit verschuldigdeBeloningen().

import type { OwnerTodo } from "@/lib/admin/owner-todos";
import type { BeloningRegel } from "@/lib/introducties/beloning";
import { BELONING_EURO } from "@/lib/introducties/regels";

const datum = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", day: "numeric", month: "long", year: "numeric" });

export function introductieTodos(regels: readonly BeloningRegel[], klaar: Readonly<Record<string, { at: string; by: string }>>): OwnerTodo[] {
  return regels.map((r): OwnerTodo => {
    const af = Object.hasOwn(klaar, r.todoId) ? klaar[r.todoId] : undefined;
    return {
      id: r.todoId,
      group: "Geld & bank",
      title: `Stuur €${BELONING_EURO} bol-tegoed naar ${r.naam} (introductie ${r.bedrijf})`,
      why: `${r.bedrijf} betaalde op ${datum(r.betaaldOp)} de eerste factuur voor platformkosten (${r.factuurNummer}). ${r.naam} stelde dit bedrijf voor via "Introduceer een bedrijf"; daarvoor is € ${BELONING_EURO} bol-tegoed beloofd. ZekerFlex stuurt dat nooit vanzelf.`,
      how: [
        r.email
          ? `Koop een bol.com-cadeaukaart van € ${BELONING_EURO} en stuur de code naar ${r.email}.`
          : `Koop een bol.com-cadeaukaart van € ${BELONING_EURO}. Het account bestaat niet meer: zoek in Beheer → Sales → Introducties wie het was, of sla deze over.`,
        "Vink deze taak daarna af: de werker of werkgever ziet dan 'beloning verstuurd' bij zijn introductie.",
      ],
      auto: false,
      done: Boolean(af),
      ...(af ? { doneNote: `verstuurd: afgevinkt door ${af.by} op ${datum(af.at)}` } : {}),
    };
  });
}
