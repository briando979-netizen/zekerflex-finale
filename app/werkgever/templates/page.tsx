import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { env } from "@/lib/env";
import { PageHeader, Panel } from "@/components/app/ui";
import { TemplatesBoard } from "@/components/app/TemplatesBoard";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const principal = await requirePrincipal();
  await resolveEmployerScope(principal);

  return (
    <>
      <PageHeader
        title="Klus-templates"
        subtitle="Sla veelgebruikte dienst-instellingen op zodat jij en je collega's sneller een nieuwe klus kunnen plaatsen."
      />

      <Panel title="Jouw templates">
        <div className="p-5">
          <TemplatesBoard minRateCents={env.MIN_SHIFT_RATE_CENTS} />
        </div>
      </Panel>
    </>
  );
}
