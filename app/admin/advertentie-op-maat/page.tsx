import { getPrincipal, hasRole } from "@/lib/auth";
import { KpiStrip, PageHead } from "@/components/admin/kit";
import { AdvertentieBeheer } from "@/components/admin/AdvertentieBeheer";
import { BEWAAR_DAGEN, STANDAARD_PRIJZEN } from "@/lib/advertentie/regels";
import { alleAdvertenties, leesIngesteldePrijzen, leesPrijzen } from "@/lib/advertentie/store";
import { alleLogos } from "@/lib/logo/store";

export const dynamic = "force-dynamic";

// Admin → Sales & groei → Advertenties op maat: wat bezoekers op /advertentie-op-maat en /logo-maker lieten maken, wie hem wil hebben,
// en de knop Vrijgeven (na betaling). Betalen loopt buiten de pagina om: stuur een betaalverzoek, klik daarna Vrijgeven.
export default async function AdvertentieOpMaatBeheerPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Advertenties op maat zijn alleen beschikbaar voor platformbeheerders." />;
  }
  const [advertenties, logos, prijzen, ingesteld] = await Promise.all([alleAdvertenties(), alleLogos(), leesPrijzen(), leesIngesteldePrijzen()]);
  const alles = [...advertenties, ...logos];
  const aangevraagd = alles.filter((a) => a.status === "aangevraagd").length;
  const vrijgegeven = alles.filter((a) => a.status === "vrijgegeven").length;

  return (
    <div className="space-y-5">
      <PageHead
        title="Advertenties en logo's op maat"
        subtitle={`Wat bezoekers lieten maken op /advertentie-op-maat en /logo-maker. Wil iemand hem hebben: stuur een betaalverzoek en klik na betaling op Vrijgeven. Alles vervalt ${BEWAAR_DAGEN} dagen na de laatste wijziging.`}
      />
      <KpiStrip
        items={[
          { label: "Gemaakt", value: String(alles.length), hint: `${advertenties.length} advertenties, ${logos.length} logo's` },
          { label: "Aangevraagd", value: String(aangevraagd), hint: "wacht op jou", tone: aangevraagd ? "warn" : "neutral" },
          { label: "Vrijgegeven", value: String(vrijgegeven), tone: vrijgegeven ? "ok" : "neutral" },
        ]}
      />
      <AdvertentieBeheer begin={advertenties} beginLogos={logos} beginPrijzen={prijzen} beginIngesteld={ingesteld} standaard={STANDAARD_PRIJZEN} />
    </div>
  );
}
