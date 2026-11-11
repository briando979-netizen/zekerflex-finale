import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { kvFindDue, kvSet } from "@/lib/storage/kv";
import { bewaarGrens, heeftPersoon, zonderPersoon, type Afspraak } from "@/lib/afspraken/model";
import { wisAfsprakenVanOrganisatie, wisToegang } from "@/lib/afspraken/store";

// ---------------------------------------------------------------------------
// Bewaartermijn van klantgegevens in afspraken (AVG art. 5(1)(e)): twee jaar na de afspraak gaan naam, telefoon, e-mail
// en opmerking weg; de afspraak blijft als lege regel (dienst, tijd, status) staan, zodat de agenda en de cijfers van het
// bedrijf kloppen: dezelfde vorm als verwijderKlant. Draait elke nacht via de cron (/api/internal/afspraken/bewaartermijn).
// Idempotent: een al gewiste regel wordt niet opnieuw geschreven.
// ---------------------------------------------------------------------------

const PAGINA = 500;
/** Een bovengrens op één ronde (1 miljoen rijen): een volgende nacht gaat gewoon verder, want gewiste rijen zijn snel overgeslagen. */
const MAX_PAGINAS = 2_000;

export interface BewaarUitslag {
  /** afspraken waarvan de persoonsgegevens gewist zijn (bij dryRun: gewist zouden worden) */
  gewist: number;
  /** de ronde stopte bij de bovengrens; de volgende nacht gaat verder */
  afgekapt: boolean;
}

export async function wisVerlopenAfspraken(opts: { now?: Date; dryRun?: boolean } = {}): Promise<BewaarUitslag> {
  const now = opts.now ?? new Date();
  const grens = bewaarGrens(now).toISOString();
  let gewist = 0;
  let na = "";
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const rijen = await kvFindDue<Afspraak>("afspraken:item:", "start", grens, na, PAGINA);
    for (const r of rijen) {
      if (!heeftPersoon(r.value)) continue;
      if (!opts.dryRun) {
        await kvSet(r.key, zonderPersoon(r.value));
        // de annuleerlinks horen bij de klantgegevens: ook die zijn dan weg ("afspraken:item:<organisatie>:<dag>~<id>")
        const tenantId = r.key.slice("afspraken:item:".length).split(":")[0] ?? "";
        if (tenantId) await wisToegang(tenantId, r.value);
      }
      gewist += 1;
    }
    const laatste = rijen[rijen.length - 1];
    if (rijen.length < PAGINA || !laatste) return { gewist, afgekapt: false };
    na = laatste.key;
  }
  return { gewist, afgekapt: true };
}

/**
 * Hoort bij het wissen van een account (anonymizeUser): was dit de laatste actieve beheerder van een organisatie, dan
 * bestaat die organisatie niet meer voor iemand en worden haar afspraken, klantnotities en boekpagina gewist. Een
 * organisatie met nog een andere actieve beheerder (of ander actief lid) blijft staan. Geeft de gewiste organisaties terug.
 */
export async function wisVerlatenOrganisaties(userId: string): Promise<string[]> {
  const eigen = await prisma.membership.findMany({ where: { userId, role: "HQ_ADMIN" }, select: { tenantId: true } });
  const gewist: string[] = [];
  for (const { tenantId } of eigen) {
    const anderen = await prisma.membership.count({ where: { tenantId, userId: { not: userId }, user: { disabledAt: null } } });
    if (anderen > 0) continue;
    await wisAfsprakenVanOrganisatie(tenantId);
    gewist.push(tenantId);
  }
  if (gewist.length > 0) logger.info("afspraken van verlaten organisaties gewist", { organisaties: gewist.length });
  return gewist;
}
