import { logger } from "@/lib/logger";
import { kvFindDue } from "@/lib/storage/kv";
import { HERINNERING_VOORAF_MS, herinneringDue, herinneringGewenst, type Instellingen } from "@/lib/afspraken/model";
import { stuurHerinnering } from "@/lib/afspraken/mail";
import { ruimMailTellersOp } from "@/lib/afspraken/mail-limiet";
import { VOORVOEGSEL_REM, leesAfspraak, leesInstellingen, wisHerinneringRij, zetHerinneringVlag, type HerinneringRij } from "@/lib/afspraken/store";

// ---------------------------------------------------------------------------
// Herinneringen: 24 uur voor een online afspraak gaat er een mail naar de klant (alleen met e-mailadres, alleen bevestigde
// afspraken, en alleen als het bedrijf herinneringen aan heeft). De cron draait elk uur (/api/internal/afspraken/herinneringen).
// Het werkt via een klein wachtrijtje (afspraken:rem:<organisatie>:<id>, gezet bij de bevestiging), zodat niet alle afspraken
// van alle bedrijven doorgelopen worden. Idempotent: de vlag herinneringVerstuurd wordt gezet vóór het versturen en teruggezet
// als de mail mislukt; dan probeert het volgende uur het opnieuw, tot de afspraak begint. Nooit twee herinneringen.
// ---------------------------------------------------------------------------

const PAGINA = 200;
/** Een bovengrens op één ronde; de rest komt het volgende uur. */
const MAX_PER_RONDE = 1_000;

export interface HerinneringUitslag {
  /** herinneringen verstuurd (bij dryRun: die verstuurd zouden worden) */
  verstuurd: number;
  /** de mail mislukte; het volgende uur nog een poging */
  mislukt: number;
  /** de mail mocht niet (bedrijf niet geverifieerd, of een dagplafond bereikt): geen nieuwe poging */
  overgeslagen: number;
  /** regels uit het wachtrijtje die niets meer te herinneren hadden (geannuleerd, begonnen, gewist, bedrijf zet het uit) en zijn opgeruimd */
  opgeruimd: number;
  afgekapt: boolean;
}

export async function stuurHerinneringen(opts: { now?: Date; dryRun?: boolean } = {}): Promise<HerinneringUitslag> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun === true;
  const grens = new Date(now.getTime() + HERINNERING_VOORAF_MS).toISOString();
  const instellingen = new Map<string, Instellingen | null>();
  const uit: HerinneringUitslag = { verstuurd: 0, mislukt: 0, overgeslagen: 0, opgeruimd: 0, afgekapt: false };
  let verwerkt = 0;
  let na = "";
  // de dagtellers van het mailplafond van eerdere dagen opruimen: de enige uurlijkse taak van dit onderdeel
  if (!dryRun) await ruimMailTellersOp(now);
  for (;;) {
    const rijen = await kvFindDue<HerinneringRij>(VOORVOEGSEL_REM, "start", grens, na, PAGINA);
    for (const r of rijen) {
      if (verwerkt >= MAX_PER_RONDE) {
        uit.afgekapt = true;
        return uit;
      }
      verwerkt += 1;
      const { tenantId, id } = r.value;
      let i = instellingen.get(tenantId);
      if (i === undefined) {
        i = await leesInstellingen(tenantId);
        instellingen.set(tenantId, i);
      }
      const a = i ? await leesAfspraak(tenantId, id) : null;
      if (!i || !a || a.status !== "bevestigd" || !a.klant.email || a.herinneringVerstuurd === true || !herinneringGewenst(a) || new Date(a.start).getTime() <= now.getTime()) {
        // niets (meer) te herinneren: een verstreken, geannuleerde, gewiste of al herinnerde afspraak, of een kort van tevoren
        // gemaakte (de bevestiging is dan genoeg; ook bestaande regels in het rijtje worden zo opgeruimd)
        if (!dryRun) await wisHerinneringRij(tenantId, id);
        uit.opgeruimd += 1;
        continue;
      }
      // een bedrijf dat herinneringen uitzet houdt de regel staan (aanzetten werkt dan ook voor bestaande afspraken); hij verdwijnt bij de start
      if (!herinneringDue(a, i, now)) continue;
      if (dryRun) {
        uit.verstuurd += 1;
        continue;
      }
      // eerst de vlag, dan de mail: twee rondes tegelijk sturen zo nooit allebei
      const geclaimd = await zetHerinneringVlag(tenantId, id, true);
      if (!geclaimd) continue; // een andere ronde was je voor
      const uitslag = await stuurHerinnering(tenantId, geclaimd, i, now);
      if (uitslag === "ok") {
        uit.verstuurd += 1;
        await wisHerinneringRij(tenantId, id);
      } else if (uitslag === "overgeslagen") {
        // bedrijf niet (meer) geverifieerd of een plafond bereikt: niet opnieuw proberen (ook niet de rest van de dag)
        await zetHerinneringVlag(tenantId, id, false);
        await wisHerinneringRij(tenantId, id);
        uit.overgeslagen += 1;
      } else {
        await zetHerinneringVlag(tenantId, id, false);
        uit.mislukt += 1;
        logger.warn("afspraakherinnering niet verstuurd", { tenantId });
      }
    }
    const laatste = rijen[rijen.length - 1];
    if (rijen.length < PAGINA || !laatste) return uit;
    na = laatste.key;
  }
}
