import { requirePrincipal } from "@/lib/auth";
import { getFiscal, fiscaalVoorKlant } from "@/lib/fiscal/store";
import { prisma } from "@/lib/prisma";
import { schoonKvk } from "@/lib/fiscal/formulier";
import { PageHeader } from "@/components/app/ui";
import { FiscalForm } from "@/components/app/FiscalForm";
import { BackLink } from "@/components/app/BackLink";
import { getFreelancerDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function FiscaalPage() {
  const principal = await requirePrincipal();
  const fiscal = await getFiscal(principal.userId);
  const f = (await getFreelancerDict()).fiscaalForm;
  // wat de aanmelding al bij het profiel bewaarde (KVK en btw): Fiscaal toont het als "al ingevuld", niet als tweede invoer
  const profiel = await prisma.freelancerProfile.findUnique({ where: { userId: principal.userId }, select: { kvkNumber: true, vatNumber: true } }).catch(() => null);

  return (
    <div className="mx-auto max-w-2xl">
      <BackLink fallbackHref="/dashboard/account" label={f.terug} />
      <PageHeader
        title={f.titel}
        subtitle={f.subtitel}
      />
      <FiscalForm
        initial={fiscaalVoorKlant(fiscal)}
        defaultKind={fiscal.workerKind}
        profiel={{ kvkNumber: schoonKvk(profiel?.kvkNumber), vatNumber: profiel?.vatNumber ?? "" }}
      />
    </div>
  );
}
