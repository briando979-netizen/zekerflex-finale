import { requirePrincipal } from "@/lib/auth";
import { getLocale } from "@/lib/i18n/server";
import { mijnVoertuig } from "@/lib/locatie/toegang";
import { locatieTeksten } from "@/lib/locatie/teksten";
import { WerkerVoertuig } from "@/components/locatie/WerkerVoertuig";

export const dynamic = "force-dynamic";

// Werker → Mijn kenteken: voor slagbomen met kentekenherkenning bij bedrijven
// waar je ingepland staat (lib/locatie/toegang.ts). Vijf talen via lib/locatie/teksten.ts.
export default async function VoertuigPage() {
  const principal = await requirePrincipal();
  const [t, voertuig] = await Promise.all([getLocale().then(locatieTeksten), mijnVoertuig(principal.userId)]);
  return <WerkerVoertuig init={voertuig} t={t} terugHref="/dashboard/account" />;
}
