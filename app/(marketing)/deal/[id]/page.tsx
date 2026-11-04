import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Section } from "@/components/marketing/primitives";
import { DealOpMaat } from "@/components/scans/DealOpMaat";
import { dealVerlopen, getDeal } from "@/lib/scans/deal";
import { getScanLog } from "@/lib/scans/store";
import type { DealWeergave } from "@/lib/scans/model";

// Het voorstel op maat na een gratis scan (lib/scans/deal.ts). Niet vindbaar: de link is persoonlijk.
export const metadata: Metadata = { title: "Je voorstel op maat", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getDeal(id);
  if (!d) notFound();
  // een nieuwe website wordt vaak pas ná de scan gemaakt: die staat in het logboek
  const log = await getScanLog(d.scan.soort, d.scan.scanId);
  const weergave: DealWeergave = {
    id: d.id,
    soort: d.scan.soort,
    geldigTot: d.geldigTot,
    bedrijf: d.bedrijf,
    score: d.score,
    samenvatting: d.samenvatting,
    rapport: d.rapport,
    siteSlug: log?.siteSlug ?? d.siteSlug,
    opties: d.opties,
    status: d.status,
    keuze: d.keuze,
    akkoordAt: d.akkoord?.at ?? null,
    terugbellenAt: d.terugbellen?.at ?? null,
    verlopen: dealVerlopen(d),
  };
  return (
    <Section>
      <DealOpMaat deal={weergave} />
    </Section>
  );
}
