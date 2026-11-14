import { Prisma } from "@prisma/client";
import { CHAT_PAD_PATROON, CHATRIJ_INITIALEN_PATROON, CODE_PATROON, JIJ_PATROON, KLOKTIJD_PATROON } from "@/lib/analytics/label-privacy";

// ---------------------------------------------------------------------------
// De eenmalige opschoning van kliklabels met namen of berichttekst (14 nov 2026), als SQL-voorwaarden voor de beheeractie
// clear_chat_click_labels (lib/admin-console/mutations.ts). Dezelfde definitie als bewaarLabel (lib/analytics/label-privacy.ts):
// op een pad met /berichten of /chat blijft alleen een label in codevorm; de patronen komen daar als tekst vandaan, zodat
// JavaScript en Postgres (POSIX-regex, operator ~) precies dezelfde regel toepassen. Puur: alleen Prisma.sql, geen client.
// ---------------------------------------------------------------------------

/** Een label op een berichten- of chatscherm dat niet in codevorm is: dat had bewaarLabel sinds 14 nov nooit bewaard. */
export function chatLabelVoorwaarde(): Prisma.Sql {
  return Prisma.sql`split_part(path, '?', 1) ~ ${CHAT_PAD_PATROON}::text AND btrim(label) !~ ${CODE_PATROON}::text`;
}

/** Een oude gespreksrij buiten die schermen: initialen vast aan een naam met een kloktijd, of een eigen berichtvoorbeeld ("Jij: …"). */
export function oudeChatrijVoorwaarde(): Prisma.Sql {
  return Prisma.sql`split_part(path, '?', 1) !~ ${CHAT_PAD_PATROON}::text AND (label ~ ${JIJ_PATROON}::text OR (label ~ ${CHATRIJ_INITIALEN_PATROON}::text AND label ~ ${KLOKTIJD_PATROON}::text))`;
}

/** De WHERE-voorwaarde (zonder het woord WHERE) voor tellen, voorbeeld én wissen: altijd één bron. */
export function teWissenWhere(ookOudeChatrijen: boolean): Prisma.Sql {
  const chat = chatLabelVoorwaarde();
  return ookOudeChatrijen
    ? Prisma.sql`label IS NOT NULL AND ((${chat}) OR (${oudeChatrijVoorwaarde()}))`
    : Prisma.sql`label IS NOT NULL AND ${chat}`;
}
