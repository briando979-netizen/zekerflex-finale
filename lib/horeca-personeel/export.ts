import { berichtenVan, dmKanaal, KANAAL_TEAM } from "@/lib/horeca-personeel/chat";
import { documentenVan } from "@/lib/horeca-personeel/documenten";
import { loonstrokenVan } from "@/lib/horeca-personeel/loonstroken";
import { leesPlanningVan } from "@/lib/horeca-personeel/planning-store";
import { leesPersoneelVan } from "@/lib/horeca-personeel/store";

// De eigen gegevens van één medewerker voor inzage of overdracht (AVG art. 15 en 20): wat het bedrijf over hem bewaart in de
// personeelsomgeving. Alleen zijn eigen regels: nooit die van een collega, en van de chat alleen zijn eigen berichten. De
// bestanden (loonstroken, documenten) staan als lijst met namen; het bestand haalt hij zelf op via zijn dashboard.

export async function exportVoorMedewerker(tenantId: string, medewerkerId: string): Promise<Record<string, unknown>> {
  const [d, p, strook, docs, team, dm] = await Promise.all([
    leesPersoneelVan(tenantId),
    leesPlanningVan(tenantId),
    loonstrokenVan(tenantId, medewerkerId),
    documentenVan(tenantId, medewerkerId),
    berichtenVan(tenantId, KANAAL_TEAM),
    berichtenVan(tenantId, dmKanaal(medewerkerId)),
  ]);
  const ik = d.medewerkers.find((m) => m.id === medewerkerId);
  return {
    gemaakt: new Date().toISOString(),
    medewerker: ik ? { naam: ik.naam, email: ik.email, functie: ik.functie, status: ik.status, uitgenodigd: ik.uitgenodigd } : null,
    diensten: p.diensten.filter((x) => x.medewerkerId === medewerkerId),
    nietBeschikbaar: p.nietBeschikbaar.filter((x) => x.medewerkerId === medewerkerId),
    verlof: p.verlof.filter((x) => x.medewerkerId === medewerkerId),
    uren: p.uren.filter((x) => x.medewerkerId === medewerkerId),
    ruilen: p.ruilen.filter((x) => x.van === medewerkerId || x.naar === medewerkerId),
    fooi: p.fooien.map((f) => ({ van: f.van, tot: f.tot, totaalCent: f.totaalCent, jouwDeelCent: f.verdeling.find((x) => x.medewerkerId === medewerkerId)?.cent ?? 0 })).filter((f) => f.jouwDeelCent > 0),
    loonstroken: strook.map((l) => ({ periode: l.periode, bestand: l.bestand, grootte: l.grootte, op: l.op })),
    documenten: docs.map((x) => ({ titel: x.titel, soort: x.soort, bestand: x.bestand, op: x.op, voorIedereen: x.medewerkerId === null })),
    berichten: { team: team.filter((b) => b.van === medewerkerId), gesprekMetBeheer: dm },
    gelezenMededelingen: d.mededelingen.filter((m) => m.gelezen.includes(medewerkerId)).map((m) => ({ tekst: m.tekst, datum: m.datum })),
  };
}
