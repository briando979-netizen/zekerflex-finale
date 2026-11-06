import { kluisItems, kluisLog, metVervangAdvies } from "@/lib/locatie/kluis";
import { agentStatus, printAgent, printInstellingen, wachtrij } from "@/lib/locatie/printen";
import { locatieStand, vestigingenVan, type LocatieScope } from "@/lib/locatie/store";
import { kastjeStatus, registraties, toegangLog, vestigingToegang } from "@/lib/locatie/toegang";

// ---------------------------------------------------------------------------
// Alles wat het bord Werkgever → Op locatie nodig heeft, in één keer: de stand
// per module, de vestigingen met hun kastje, de kentekens, de kluis (zonder de
// geheimen) en de printwachtrij. Gebruikt door de pagina (eerste weergave) en
// door /api/werkgever/locatie (na elke handeling).
// ---------------------------------------------------------------------------

async function toegangstaat(scope: LocatieScope) {
  const [vestigingen, instel] = await Promise.all([vestigingenVan(scope.tenantId, scope.branchIds), vestigingToegang(scope.tenantId)]);
  return vestigingen.map((v) => {
    const i = instel[v.id];
    return {
      ...v,
      aan: i?.aan ?? true,
      openSeconden: i?.openSeconden ?? 3,
      meldPlanner: i?.meldPlanner ?? true,
      meldWerker: i?.meldWerker ?? true,
      heeftToken: Boolean(i?.tokenHash),
      status: kastjeStatus(i),
      laatstGezien: i?.laatstGezien ?? null,
      apparaat: i?.apparaat ?? null,
    };
  });
}

export async function bordData(scope: LocatieScope) {
  const [stand, vestigingen, toegang, regs, tLog, items, kLog, pInstel, rij, agent] = await Promise.all([
    locatieStand(scope.tenantId),
    vestigingenVan(scope.tenantId, scope.branchIds),
    toegangstaat(scope),
    registraties(scope.tenantId),
    toegangLog(scope.tenantId, 150, scope.branchIds),
    kluisItems(scope.tenantId, scope.branchIds),
    scope.magBeheren ? kluisLog(scope.tenantId, 150) : Promise.resolve([]),
    printInstellingen(scope.tenantId),
    wachtrij(scope.tenantId, 100, scope.branchIds),
    printAgent(scope.tenantId),
  ]);
  return {
    stand,
    scope: { magBeheren: scope.magBeheren, branchIds: scope.branchIds },
    vestigingen,
    toegang: { vestigingen: toegang, registraties: scope.branchIds ? regs.filter((r) => !r.branchId || scope.branchIds!.includes(r.branchId)) : regs, log: tLog },
    kluis: { items: await metVervangAdvies(scope.tenantId, items), log: kLog },
    printen: { instellingen: pInstel, wachtrij: rij, agent: agent ? { naam: agent.naam, status: agentStatus(agent), laatstGezien: agent.laatstGezien ?? null, printer: agent.printer ?? null, sinds: agent.sinds } : null },
  };
}

