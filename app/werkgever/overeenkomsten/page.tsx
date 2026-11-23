import { requirePrincipal } from "@/lib/auth";
import { Panel } from "@/components/app/ui";
import { PaginaKop } from "@/components/werkgever/PaginaKop";
import { AgreementsList } from "@/components/app/AgreementsList";
import { getDict } from "@/lib/i18n/server";
import { SamenTabs } from "@/components/werkgever/SamenTabs";

export const dynamic = "force-dynamic";

export default async function WerkgeverOvereenkomstenPage() {
  await requirePrincipal();
  const a = (await getDict()).agreements;
  return (
    <>
      <SamenTabs groep="regels" actief="overeenkomsten" />
      <PaginaKop title={a.title} eyebrow={a.eyebrow} subtitle={a.subtitle} />
      <Panel title={a.allPanel}>
        <div className="p-5">
          <AgreementsList side="client" />
        </div>
      </Panel>
    </>
  );
}
