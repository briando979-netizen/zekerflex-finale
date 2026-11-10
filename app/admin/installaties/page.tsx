import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { lijstAfspraken } from "@/lib/installatie/store";
import { afspraakVoorAdmin } from "@/lib/installatie/admin";
import { KpiStrip, Notice, PageHead, Panel } from "@/components/admin/kit";
import { InstallatieAdmin } from "@/components/admin/InstallatieAdmin";

export const dynamic = "force-dynamic";

// Admin → Sales & groei → Installaties: een afspraak maken voor de monteur en de links delen. De klant ziet
// op zijn link wanneer de monteur komt en waar zijn ZekerFlex-bus rijdt; de monteur drukt op zijn link
// op "ik ga onderweg" en zijn telefoon deelt dan zijn positie, tot hij er is.
export default async function InstallatiesPagina() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De installatieafspraken zijn alleen voor platformbeheerders." />;
  }
  const afspraken = (await lijstAfspraken()).map(afspraakVoorAdmin);
  const open = afspraken.filter((a) => ["gepland", "onderweg", "aangekomen", "bezig"].includes(a.status)).length;
  const onderweg = afspraken.filter((a) => a.status === "onderweg").length;

  return (
    <div className="space-y-4">
      <PageHead
        title="Installaties"
        subtitle="Plan een installatie bij een klant en laat hem de monteur live volgen op onze eigen kaart."
        actions={<Link href="/admin/hardware" className="a-button text-xs">Hardware en pakketten</Link>}
      />
      <KpiStrip
        items={[
          { label: "Open afspraken", value: String(open), hint: "gepland of bezig", tone: "plan" },
          { label: "Nu onderweg", value: String(onderweg), hint: "de klant ziet de bus rijden", tone: onderweg > 0 ? "warn" : "ok" },
          { label: "Alle afspraken", value: String(afspraken.length), hint: "de laatste 60" },
        ]}
      />
      <Notice tone="plan">
        Zo werkt het: maak een afspraak, stuur de klantlink naar de klant en de monteurlink naar de monteur. De monteur opent zijn link op zijn telefoon en drukt
        op &ldquo;Ik ga onderweg&rdquo;: de klant ziet dan de ZekerFlex-bus rijden en hoe laat hij er ongeveer is (een schatting van onze eigen kaart, geen routeplanner).
        Zijn positie verdwijnt zodra hij er is. Wie een link heeft, ziet alleen die ene afspraak.
      </Notice>
      <Panel title="Nieuwe afspraak en overzicht">
        <InstallatieAdmin afspraken={afspraken} />
      </Panel>
    </div>
  );
}
