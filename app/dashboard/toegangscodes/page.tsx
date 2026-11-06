import { requirePrincipal } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { locatieTeksten } from "@/lib/locatie/teksten";
import { WerkerKluis } from "@/components/locatie/WerkerKluis";

export const dynamic = "force-dynamic";

// Werker → Toegangscodes: wat de werkgever in de sleutelkluis klaarzette voor
// je dienst (lib/locatie/kluis.ts, /api/me/kluis). Vijf talen via lib/locatie/teksten.ts.
export default async function ToegangscodesPage() {
  await requirePrincipal();
  const t = locatieTeksten(await getLocale());
  return <WerkerKluis t={t} terugHref="/dashboard/account" />;
}
