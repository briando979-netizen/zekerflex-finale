import { PageHeader } from "@/components/app/ui";
import { HulpPaginaInhoud } from "@/components/app/HulpPaginaInhoud";
import { hulpTekstenWerkgever } from "@/lib/hulp/werkgever-teksten";
import { getLocale } from "@/lib/i18n/server";
import { kennisbankIngesteld } from "@/lib/kennisbank/outline";
import { outlinePubliekeUrl } from "@/lib/oidc/aanbieder";

export const dynamic = "force-dynamic";

// Het hulpcentrum voor bedrijven op een eigen pagina met een vaste plek in het menu (Hulpcentrum): dezelfde teksten als het vraagteken
// in de kopbalk (lib/hulp/werkgever-teksten.ts, Nederlands en Engels). Het gedeelte voor werkers staat op /dashboard/hulp.
export default async function WerkgeverHulpPage() {
  const t = hulpTekstenWerkgever(await getLocale());
  return (
    <>
      <PageHeader title={t.titel} subtitle={t.onder} />
      <HulpPaginaInhoud t={t} soort="bedrijf" handleidingen={kennisbankIngesteld() ? `${outlinePubliekeUrl()}/` : null} />
    </>
  );
}
