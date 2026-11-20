import { requirePrincipal } from "@/lib/auth";
import { getFreelancerDict } from "@/lib/i18n/server";
import { CertificatesManager } from "@/components/app/CertificatesManager";
import { BackLink } from "@/components/app/BackLink";
import { PageHeader } from "@/components/app/ui";

export const dynamic = "force-dynamic";

export default async function CertificatenPage() {
  await requirePrincipal();
  const t = (await getFreelancerDict()).cert;

  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label={t.back} />
      <PageHeader title={t.title} subtitle={t.intro} />
      <CertificatesManager />
    </>
  );
}
