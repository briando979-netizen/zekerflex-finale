import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead, Panel } from "@/components/admin/kit";
import { ContentEditor } from "@/components/admin/ContentEditor";
import { SeasonalThemesEditor } from "@/components/admin/SeasonalThemesEditor";

export const dynamic = "force-dynamic";

export default async function AdminHuisstijlPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Huisstijl is alleen voor platformbeheer." />;
  }
  return (
    <div className="space-y-4">
      <PageHead title="Huisstijl" subtitle="Pas de merkkleuren, teksten en het beeld van ZekerFlex aan, zonder code." />
      <Panel
        title="Kleuren, lettertypes en vormen"
        subtitle="Die stel je in bij de Site-ontwerper: met een live voorbeeld op computer, tablet en telefoon, concept en publiceren, geschiedenis en AI-hulp."
      >
        <Link href="/admin/ontwerper" className="a-button a-button-primary">Naar de Site-ontwerper →</Link>
      </Panel>
      <SeasonalThemesEditor />
      <ContentEditor />
      <Panel
        title="Foto's & beeld"
        subtitle="De foto's op de site (hero, categorieën, marketing) beheer je in de Studio: maken of uploaden en publiceren naar de juiste plek. Het logo en de app-iconen staan in /public/icons."
      >
        <Link href="/admin/studio" className="a-button a-button-primary">Naar de Studio →</Link>
      </Panel>
    </div>
  );
}
