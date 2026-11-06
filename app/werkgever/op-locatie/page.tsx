import { getPrincipal } from "@/lib/auth";
import { featureEnabled } from "@/lib/flags";
import { PageHeader } from "@/components/app/ui";
import { bordData } from "@/lib/locatie/bord";
import { locatieScope } from "@/lib/locatie/store";
import { isTab } from "@/lib/locatie/tabs";
import { OpLocatie, type OpLocatieData } from "@/components/locatie/OpLocatie";

export const dynamic = "force-dynamic";

// Werkgever → Op locatie: portofoon, toegang op kenteken, sleutelkluis en
// badges printen (lib/locatie). Toegang tot /werkgever is al afgedwongen in
// app/werkgever/layout.tsx; dit scherm vraagt alleen om een bedrijf.
export default async function OpLocatiePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const principal = await getPrincipal();
  if (!principal) return null;
  if (!(await featureEnabled("locatie-modules", { userId: principal.userId }))) {
    return (
      <div className="surface p-6 text-sm text-neutralx-600" role="status">
        Dit onderdeel staat op dit moment uit.
      </div>
    );
  }
  let data: OpLocatieData;
  try {
    data = (await bordData(await locatieScope(principal))) as OpLocatieData;
  } catch {
    return (
      <div className="surface p-6 text-sm text-neutralx-600" role="status">
        Maak eerst je bedrijfsprofiel af; daarna kun je hier de portofoon, toegang op kenteken, de sleutelkluis en badges printen inrichten.
      </div>
    );
  }
  const { tab } = await searchParams;
  return (
    <>
      <PageHeader
        title="Op locatie"
        subtitle="Vier modules voor de werkvloer, op onze eigen server en zonder licentiekosten bij een ander: portofoon in de app, toegang op kenteken, de sleutelkluis en badges printen. Zet aan wat je nodig hebt."
      />
      <OpLocatie init={data} startTab={isTab(tab) ? tab : "overzicht"} ik={{ userId: principal.userId, naam: principal.fullName }} />
    </>
  );
}
