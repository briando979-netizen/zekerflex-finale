import { PageHeader } from "@/components/app/ui";
import { HulpPaginaInhoud } from "@/components/app/HulpPaginaInhoud";
import { hulpTeksten } from "@/lib/hulp/teksten";
import { getLocale } from "@/lib/i18n/server";
import { kennisbankIngesteld } from "@/lib/kennisbank/outline";
import { outlinePubliekeUrl } from "@/lib/oidc/aanbieder";

export const dynamic = "force-dynamic";

// Het hulpcentrum voor werkers op een eigen pagina (naast het vraagteken in de kopbalk): dezelfde teksten, in de taal van de werker
// (lib/hulp/teksten.ts, vijf talen). Staat onder Account → Hulpcentrum. Het gedeelte voor bedrijven staat op /werkgever/hulp.
export default async function WerkerHulpPage() {
  const t = hulpTeksten(await getLocale());
  return (
    <>
      <PageHeader title={t.titel} subtitle={t.onder} />
      <HulpPaginaInhoud t={t} soort="werker" handleidingen={kennisbankIngesteld() ? `${outlinePubliekeUrl()}/` : null} />
    </>
  );
}
