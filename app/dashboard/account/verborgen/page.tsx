import { requirePrincipal } from "@/lib/auth";
import { HiddenEmployersList } from "@/components/app/HiddenEmployersList";
import { BackLink } from "@/components/app/BackLink";
import { PageHeader } from "@/components/app/ui";
import { getFreelancerDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function VerborgenOpdrachtgeversPage() {
  await requirePrincipal();
  const ft = await getFreelancerDict();

  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label={ft.nav.account} />

      <PageHeader title={ft.acct.hidden} subtitle={ft.restTaal.verborgenSub} />

      <HiddenEmployersList />
    </>
  );
}
