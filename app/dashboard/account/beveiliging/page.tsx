import { requirePrincipal } from "@/lib/auth";
import { getFreelancerDict } from "@/lib/i18n/server";
import { BackLink } from "@/components/app/BackLink";
import { PageHeader } from "@/components/app/ui";
import { TwoFactorSettings } from "@/components/auth/TwoFactorSettings";

export const dynamic = "force-dynamic";

export default async function BeveiligingPage() {
  await requirePrincipal();
  // Alleen platte strings: die mogen als prop naar het client-onderdeel (dat ook werkgevers/beheer gebruiken).
  const t = (await getFreelancerDict()).twofa;
  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label={t.back} />
      <PageHeader title={t.pageTitle} subtitle={t.pageSub} />
      <div className="rounded-2xl border border-hair bg-white p-5 shadow-card">
        <TwoFactorSettings texts={t} />
      </div>
    </>
  );
}
