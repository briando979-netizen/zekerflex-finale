import { hasRole } from "@/lib/auth";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { InKaart } from "@/components/werkgever/InKaart";
import { getLocale } from "@/lib/i18n/server";
import { leegBedrijf } from "@/lib/inkaart/model";
import { leesInKaart } from "@/lib/inkaart/store";
import { inkaartTeksten } from "@/lib/inkaart/teksten";
import { employerTenant } from "@/lib/webhooks/employer";
import { SamenTabs } from "@/components/werkgever/SamenTabs";

export const dynamic = "force-dynamic";

// Werkgever → Bedrijf in kaart (lib/inkaart): personeel, kosten, ruimtes en bezetting in een paar minuten neerzetten, en zien wat eruit volgt.
// Het bedrijf komt uit de sessie. Lezen mag elke rol van het bedrijf; bewaren een beheerder of een lokale manager (zie /api/werkgever/in-kaart).
// De tekst komt uit lib/inkaart/teksten.ts in de taal van de werkgeversapp.
export default async function BedrijfInKaartPage() {
  const { principal, tenantId } = await employerTenant(false);
  const [bewaard, locale] = await Promise.all([leesInKaart(tenantId), getLocale()]);
  const t = inkaartTeksten(locale);
  const magWijzigen = hasRole(principal, "HQ_ADMIN", "LOCAL_MANAGER", "PLATFORM_ADMIN");
  return (
    <>
      <PaginaKop title={t.pagina.titel} eyebrow={t.pagina.eyebrow} subtitle={t.pagina.subtitel} />
      <SamenTabs groep="cijfers" actief="inkaart" />
      <InKaart start={bewaard ?? leegBedrijf("overig", new Date())} magWijzigen={magWijzigen} t={t} />
    </>
  );
}
