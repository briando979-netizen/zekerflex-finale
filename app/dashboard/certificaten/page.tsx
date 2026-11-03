import { requirePrincipal } from "@/lib/auth";
import { getFreelancerDict } from "@/lib/i18n/server";
import { CertificatesManager } from "@/components/app/CertificatesManager";
import { BackLink } from "@/components/app/BackLink";

export const dynamic = "force-dynamic";

export default async function CertificatenPage() {
  await requirePrincipal();
  const t = (await getFreelancerDict()).cert;

  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label={t.back} />
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold uppercase leading-tight tracking-tight text-ink">{t.title}</h1>
        <span className="mt-1 block h-1 w-20 rounded-full bg-gradient-to-r from-crit to-crit/40" />
        <p className="mt-2 max-w-2xl text-sm text-neutralx-500">{t.intro}</p>
      </div>
      <CertificatesManager />
    </>
  );
}
