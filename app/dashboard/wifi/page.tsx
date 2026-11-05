import { requirePrincipal } from "@/lib/auth";
import { getFreelancerDict } from "@/lib/i18n/server";
import { BackLink } from "@/components/app/BackLink";
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
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">{t.title}</h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-brand-500 to-brand-500/40" />
        <p className="mt-2 max-w-2xl text-sm text-neutralx-500">{t.intro}</p>
      </div>
      <WifiLogin gebruiker={principal.email} wachtwoord={wachtwoord} vandaag={vandaag} t={t} />
    </>
  );
}
