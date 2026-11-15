import { hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { InKaart } from "@/components/werkgever/InKaart";
import { leegBedrijf } from "@/lib/inkaart/model";
import { leesInKaart } from "@/lib/inkaart/store";
import { employerTenant } from "@/lib/webhooks/employer";

export const dynamic = "force-dynamic";

// Werkgever → Bedrijf in kaart (lib/inkaart): personeel, kosten, ruimtes en bezetting in een paar minuten neerzetten, en zien wat eruit volgt.
// Het bedrijf komt uit de sessie. Lezen mag elke rol van het bedrijf; bewaren een beheerder of een lokale manager (zie /api/werkgever/in-kaart).
export default async function BedrijfInKaartPage() {
  const { principal, tenantId } = await employerTenant(false);
  const bewaard = await leesInKaart(tenantId);
  const magWijzigen = hasRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "PLATFORM_ADMIN");
  return (
    <>
      <PageHeader
        title="Bedrijf in kaart"
        eyebrow="Inzicht"
        subtitle="Zet je personeel, kosten en ruimtes in een paar minuten neer. Je ziet wat je personeel kost, hoeveel ruimtes je echt nodig hebt, wanneer het druk is en wat je kunt verbeteren."
      />
      <InKaart start={bewaard ?? leegBedrijf("overig", new Date())} magWijzigen={magWijzigen} />
    </>
  );
}
