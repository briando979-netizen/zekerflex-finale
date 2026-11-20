import { requirePrincipal } from "@/lib/auth";
import { getFreelancerDict } from "@/lib/i18n/server";
import { BackLink } from "@/components/app/BackLink";
import { PageHeader } from "@/components/app/ui";
import { WifiLogin } from "@/components/app/WifiLogin";
import { wifiVandaagVoor, wifiWachtwoord } from "@/lib/netwerk/store";

export const dynamic = "force-dynamic";

// Account → Wifi op het werk: de eigen wifi-login van de flexwerker voor
// bedrijven met ZekerFlex-wifi (lib/netwerk), en de netwerknaam bij de klus
// van vandaag. Vijftalig via lib/i18n/freelancer.ts (sectie wifi).
export default async function WifiPage() {
  const principal = await requirePrincipal();
  const t = (await getFreelancerDict()).wifi;
  const [wachtwoord, vandaag] = await Promise.all([wifiWachtwoord(principal.userId), wifiVandaagVoor(principal.userId).catch(() => [])]);

  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label={t.back} />
      <PageHeader title={t.title} subtitle={t.intro} />
      <WifiLogin gebruiker={principal.email} wachtwoord={wachtwoord} vandaag={vandaag} t={t} />
    </>
  );
}
