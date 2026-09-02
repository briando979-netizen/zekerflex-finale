import { requirePrincipal } from "@/lib/auth";
import { PageHeader, Panel } from "@/components/app/ui";
import { AgreementsList } from "@/components/app/AgreementsList";

export const dynamic = "force-dynamic";

export default async function WerkgeverOvereenkomstenPage() {
  await requirePrincipal();
  return (
    <>
      <PageHeader
        title="Modelovereenkomsten"
        eyebrow="Wet DBA"
        subtitle="Elke samenwerking met een freelancer loopt via een door de Belastingdienst beoordeelde modelovereenkomst. Je ziet ze hier automatisch — ook voordat er getekend is — en kunt de pdf openen."
      />
      <Panel title="Alle overeenkomsten">
        <div className="p-5">
          <AgreementsList side="client" />
        </div>
      </Panel>
    </>
  );
}
