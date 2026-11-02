import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { AgentPayConsole } from "@/components/admin/AgentPayConsole";

export const dynamic = "force-dynamic";

export default async function AdminBetalingenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="AI-betalingen zijn alleen voor platformbeheerders." />;
  }
  return (
    <div className="space-y-4">
      <PageHead
        title="AI-betalingen"
        subtitle="De AI stelt betalingen en aankopen voor, ook buiten ZekerFlex. Jij keurt ze goed of af, met harde limieten en een noodknop. Pas als je bewust een betaalrail aansluit, gaat een goedgekeurde betaling echt door."
      />
      <AgentPayConsole />
    </div>
  );
}
