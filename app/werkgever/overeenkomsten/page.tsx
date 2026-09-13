import { requirePrincipal } from "@/lib/auth";
import { PageHeader, Panel } from "@/components/app/ui";
import { AgreementsList } from "@/components/app/AgreementsList";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function WerkgeverOvereenkomstenPage() {
  await requirePrincipal();
  const a = (await getDict()).agreements;
  return (
    <>
      <PageHeader title={a.title} eyebrow={a.eyebrow} subtitle={a.subtitle} />
      <Panel title={a.allPanel}>
        <div className="p-5">
          <AgreementsList side="client" />
        </div>
      </Panel>
    </>
  );
}
