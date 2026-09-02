import { requirePrincipal } from "@/lib/auth";
import { getFiscal } from "@/lib/fiscal/store";
import { PageHeader } from "@/components/app/ui";
import { FiscalForm } from "@/components/app/FiscalForm";

export const dynamic = "force-dynamic";

export default async function FiscaalPage() {
  const principal = await requirePrincipal();
  const fiscal = await getFiscal(principal.userId);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Werkvorm & fiscale gegevens"
        subtitle="Kies je werkvorm en vul je btw- of loongegevens in. Zo verzorgt ZekerFlex je facturatie of verloning correct."
      />
      <FiscalForm initial={fiscal} defaultKind={fiscal.workerKind} />
    </div>
  );
}
