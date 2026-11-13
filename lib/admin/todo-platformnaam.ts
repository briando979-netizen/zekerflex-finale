// ---------------------------------------------------------------------------
// Eigenaar-taak (13 nov): de platformorganisatie (org_platform) heet in de database nog "ZekerFlex B.V.", terwijl de
// rechtspersoon Zekerflex, Inc. is (lib/platform/bedrijf.ts). Facturen van het platform tonen als afzender de naam van
// die organisatie (lib/pdf/documents.ts, lib/efactuur/factuur.ts), en wel bij elke opvraag opnieuw: een hernoeming zou de
// "Van" op al uitgegeven facturen achteraf veranderen. Daarom eerst met de accountant afstemmen (creditnota en
// herstelfactuur, of een toelichting), daarna de naam bijwerken. Puur: alleen de telling, nooit namen van ontvangers.
// ---------------------------------------------------------------------------

import type { OwnerTodo } from "@/lib/admin/owner-todos";
import { PLATFORM_NAAM } from "@/lib/platform/bedrijf";

export interface PlatformnaamStand {
  /** de naam van de platformorganisatie zoals hij nu in de database staat */
  naam: string;
  /** uitgegeven (of betaalde) facturen met de platformorganisatie als afzender */
  aantal: number;
  totaalCents: number;
}

const euro = (cents: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(cents / 100);

/**
 * De taak, of null als er niets te doen is (geen telling, of nog geen facturen: dan kan de naam zonder meer worden
 * bijgewerkt). Afgevinkt zodra de naam gelijk is aan de rechtspersoon.
 */
export function platformnaamTodo(stand: PlatformnaamStand | null): OwnerTodo | null {
  if (!stand) return null;
  const klopt = stand.naam.trim() === PLATFORM_NAAM;
  if (!klopt && stand.aantal === 0) return null;
  // afgevinkt: de naam klopt (13 nov 2026 hernoemd, de facturen aan de eigen testbedrijven geannuleerd); dan een gewone titel
  return {
    id: "platformnaam-facturen",
    group: "Juridisch",
    title: klopt ? `De platformorganisatie heet "${PLATFORM_NAAM}", zoals de rechtspersoon` : `Facturen met afzender "${stand.naam}" (${stand.aantal}, ${euro(stand.totaalCents)}): met de accountant afstemmen`,
    why: `De platformorganisatie heet in ZekerFlex nog "${stand.naam}", maar de rechtspersoon is ${PLATFORM_NAAM}. Die naam staat als afzender ("Van") op de facturen van het platform, ook in de e-factuur. Een factuur wordt bij elke opvraag opnieuw opgebouwd: verander je de naam, dan verandert de afzender ook op de facturen die al zijn uitgegeven. Daarom eerst met de accountant beslissen hoe.`,
    how: [
      `Bespreek met de accountant de ${stand.aantal} uitgegeven facturen (samen ${euro(stand.totaalCents)}): een creditnota met een herstelfactuur op naam van ${PLATFORM_NAAM}, of een toelichting aan de klant.`,
      `Daarna de naam van de platformorganisatie bijwerken naar "${PLATFORM_NAAM}" (Claude doet dat na een droge proef).`,
      "Deze taak vinkt zichzelf af zodra de naam klopt.",
    ],
    auto: true,
    done: klopt,
  };
}
