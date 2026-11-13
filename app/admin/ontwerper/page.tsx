import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { Ontwerper } from "@/components/admin/ontwerper/Ontwerper";
import { getOntwerpStaat } from "@/lib/ontwerp/store";
import { isOntwerperTab } from "@/lib/ontwerp/tabs";

export const dynamic = "force-dynamic";

export default async function AdminOntwerperPage(props: { searchParams: Promise<{ tab?: string | string[] }> }) {
  // een link uit Beheer → Instellingen ("Zelf inrichten") opent meteen het goede tabblad
  const { tab } = await props.searchParams;
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De Site-ontwerper is alleen voor platformbeheer." />;
  }
  const staat = await getOntwerpStaat();
  return (
    <div className="space-y-4">
      <PageHead
        title="Site-ontwerper"
        subtitle="De stijl en teksten van de eigen ZekerFlex-site, zonder code. Je ziet alles meteen in het voorbeeld; bezoekers pas als je publiceert."
        actions={
          <span className="flex gap-2">
            <Link href="/admin/studio" className="a-button text-xs">
              Foto&apos;s (Studio)
            </Link>
            <Link href="/admin/huisstijl" className="a-button text-xs">
              Feestdagen &amp; meer
            </Link>
          </span>
        }
      />
      <Ontwerper start={staat} beginTab={isOntwerperTab(tab) ? tab : undefined} />
    </div>
  );
}
