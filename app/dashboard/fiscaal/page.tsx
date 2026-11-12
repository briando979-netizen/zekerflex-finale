import { requirePrincipal } from "@/lib/auth";
import { getFiscal } from "@/lib/fiscal/store";
import { PageHeader } from "@/components/app/ui";
import { FiscalForm } from "@/components/app/FiscalForm";
import { BackLink } from "@/components/app/BackLink";
import { getFreelancerDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function FiscaalPage() {
  const principal = await requirePrincipal();
  const fiscal = await getFiscal(principal.userId);
  const f = (await getFreelancerDict()).fiscaalForm;

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink fallbackHref="/dashboard/account" label={f.terug} />
      <PageHeader
        title={f.titel}
        subtitle={f.subtitel}
      />
      <FiscalForm initial={fiscal} defaultKind={fiscal.workerKind} />
    </div>
  );
}
