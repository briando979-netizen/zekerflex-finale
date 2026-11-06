// De winkel-agent (draait dagelijks via cron, of op knop in Admin → Winkel-AI):
//  1. Inkoop: zet de inkoopvoorstellen uit voorraad en verkoop klaar als voorstel in
//     de betaalmotor (PENDING; er wordt niets besteld of betaald zonder akkoord).
//  2. Nieuwe producten: maakt wekelijks hoogstens twee conceptproducten uit de
//     trends (altijd UIT, voorraad 0, zonder betaalde foto).
//  3. Publiceren: alleen met de vlag "winkel-ai-autopubliceren" gaat een door de
//     agent gemaakt product zelf aan, en pas als er echte voorraad en een echte
//     foto zijn. Zonder die vlag blijft publiceren aan de eigenaar.
// Het rapport van de laatste ronde staat in KV (shop:agent:laatste).

import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { featureEnabled } from "@/lib/flags";
import { listIntents, saveIntent } from "@/lib/agent-pay/store";
import { proposeIntent } from "@/lib/agent-pay/intents";
import { restockUnitCents } from "@/lib/agent-pay/propose-ai";
import { bewaarConcept, maakConcept, maakInkoopAdvies, zoekTrends } from "@/lib/shop/winkel-ai";

const K_LAATSTE = "shop:agent:laatste";
const K_CONCEPTEN = "shop:agent:concepten";
const WEKEN_TUSSEN_CONCEPTEN = 7 * 86_400_000;
const MAX_INKOOPVOORSTELLEN = 5;

export type AgentRapport = { op: string; inkoop: string[]; concepten: string[]; gepubliceerd: string[]; opmerkingen: string[] };
type Bewaard = { ids: string[]; laatsteRonde: string | null };

export const leesAgentRapport = async (): Promise<AgentRapport | null> => (await kvGet<AgentRapport>(K_LAATSTE).catch(() => null)) ?? null;

const euro = (c: number) => `€ ${(c / 100).toFixed(2).replace(".", ",")}`;

export async function draaiWinkelAgent(): Promise<AgentRapport> {
  const rapport: AgentRapport = { op: new Date().toISOString(), inkoop: [], concepten: [], gepubliceerd: [], opmerkingen: [] };
  const bewaard = (await kvGet<Bewaard>(K_CONCEPTEN).catch(() => null)) ?? { ids: [], laatsteRonde: null };

  // 1. inkoopvoorstellen, per product gebundeld, zonder dubbele openstaande voorstellen
  try {
    const { regels } = await maakInkoopAdvies();
    const bestaand = await listIntents().catch(() => []);
    const open = new Set(bestaand.filter((i) => i.proposedBy === "ai-winkel" && i.status === "PENDING").map((i) => i.recipient));
    const perProduct = new Map<string, { stuks: number; kosten: number }>();
    for (const r of regels) {
      const m = perProduct.get(r.productNaam) ?? { stuks: 0, kosten: 0 };
      m.stuks += r.bestel;
      m.kosten += r.kostenCents ?? restockUnitCents(null, 2000) * r.bestel;
      perProduct.set(r.productNaam, m);
    }
    for (const [naam, m] of [...perProduct].sort((a, b) => b[1].kosten - a[1].kosten).slice(0, MAX_INKOOPVOORSTELLEN)) {
      const ontvanger = `Leverancier — ${naam}`;
      if (open.has(ontvanger) || m.kosten <= 0) continue;
      const i = proposeIntent({ amountCents: m.kosten, recipient: ontvanger, external: true, reason: `Inkoop "${naam}": ${m.stuks} stuks (${euro(m.kosten)}) om de voorraad op peil te houden, uit voorraad en verkoop van de laatste 30 dagen.`, proposedBy: "ai-winkel" });
      await saveIntent(i);
      rapport.inkoop.push(`${naam}: ${m.stuks} stuks, ${euro(m.kosten)}`);
    }
  } catch (e) {
    rapport.opmerkingen.push(`Inkoop mislukt: ${(e as Error).message.slice(0, 120)}`);
  }

  // 2. conceptproducten uit de trends, hoogstens twee per week
  const laatste = bewaard.laatsteRonde ? Date.parse(bewaard.laatsteRonde) : 0;
  if (Date.now() - laatste >= WEKEN_TUSSEN_CONCEPTEN) {
    try {
      const admin = await prisma.user.findFirst({ where: { memberships: { some: { role: "PLATFORM_ADMIN" } } }, select: { id: true }, orderBy: { createdAt: "asc" } });
      if (!admin) {
        rapport.opmerkingen.push("Geen beheerder gevonden voor de conceptproducten.");
      } else {
        const { trends } = await zoekTrends();
        for (const t of trends.slice(0, 2)) {
          const u = await maakConcept({ idee: t.naam, doelgroep: t.doelgroep });
          if (!u.prijs) {
            rapport.opmerkingen.push(`Geen prijs voor "${t.naam}": overgeslagen (geen inkoopprijs bekend).`);
            continue;
          }
          const c = u.concept;
          const b = await bewaarConcept(
            { concept: { name: c.name, category: c.category as never, gender: (c.gender ?? null) as never, collection: c.collection ?? null, badge: c.badge ?? null, description: c.description, sizes: c.sizes as string[], colors: c.colors as string[], soort: c.soort ?? null }, inkoopCents: null, prijsCents: u.prijs.prijsCents, metFoto: false },
            admin.id,
          );
          bewaard.ids.push(b.id);
          rapport.concepten.push(c.name);
        }
        bewaard.laatsteRonde = rapport.op;
      }
    } catch (e) {
      rapport.opmerkingen.push(`Conceptproducten mislukt: ${(e as Error).message.slice(0, 120)}`);
    }
  }

  // 3. publiceren: alleen met de vlag, echte voorraad en een echte foto
  if (bewaard.ids.length && (await featureEnabled("winkel-ai-autopubliceren"))) {
    const kandidaten = await prisma.shopProduct.findMany({
      where: { id: { in: bewaard.ids }, active: false },
      select: { id: true, name: true, imageUrl: true, imageUploadId: true, modelPhotoUrl: true, variants: { select: { stock: true } } },
    });
    for (const p of kandidaten) {
      const heeftFoto = !!(p.imageUrl || p.imageUploadId || p.modelPhotoUrl);
      const heeftVoorraad = p.variants.some((v) => v.stock > 0);
      if (heeftFoto && heeftVoorraad) {
        await prisma.shopProduct.update({ where: { id: p.id }, data: { active: true } });
        rapport.gepubliceerd.push(p.name);
      }
    }
  }

  await kvSet(K_CONCEPTEN, { ids: bewaard.ids.slice(-200), laatsteRonde: bewaard.laatsteRonde });
  await kvSet(K_LAATSTE, rapport).catch((e) => logger.warn("winkel-agent: rapport niet bewaard", { error: (e as Error).message }));
  return rapport;
}
