import { requirePrincipal } from "@/lib/auth";
import { ErasureScopeInfo } from "@/components/privacy/ErasureScopeInfo";
import { DeleteOwnAccountForm } from "@/components/app/DeleteOwnAccountForm";
import { BackLink } from "@/components/app/BackLink";
import { PageHeader } from "@/components/app/ui";
import { getFreelancerDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function VerwijderAccountPage() {
  await requirePrincipal();
  const ft = await getFreelancerDict();

  return (
    <>
      <BackLink fallbackHref="/dashboard/account" label={ft.nav.account} />

      <PageHeader title={ft.acct.delete} subtitle={ft.restTaal.verwijderenSub} />

      <div className="space-y-6 rounded-2xl border border-hair bg-white p-5 shadow-card">
        <ErasureScopeInfo texts={ft.restTaal} />
        <DeleteOwnAccountForm />
      </div>
    </>
  );
}
