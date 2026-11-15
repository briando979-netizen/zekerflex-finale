import Link from "next/link";
import { getPrincipal, hasRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { PageHead } from "@/components/admin/kit";
import { SiteBuilder } from "@/components/app/SiteBuilder";
import { getWebsiteProposal, isProposalId } from "@/lib/sales/website-proposal";

export const dynamic = "force-dynamic";

// Admin → Websitevoorstellen → Aanpassen: the proposal's site in the same
// builder companies use, before it is sent. The proposal banner stays on.
export default async function ProposalBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Websitevoorstellen aanpassen is alleen voor platformbeheerders." />;
  }
  const { id } = await params;
  // Alleen een echt voorstel heeft een bouwer. Een woord als "voorbeeld" (uit een uitleg of een oude link) of een id dat niet bestaat
  // gaf een kale 404; nu staat er wat er mis is en waar het voorstel te vinden is.
  if (!isProposalId(id) || !(await getWebsiteProposal(id))) {
    return (
      <div className="space-y-4">
        <PageHead
          title="Dit voorstel bestaat niet"
          subtitle="De bouwer van een websitevoorstel opent met het nummer van een echt voorstel. Kies het voorstel in de lijst en druk op Aanpassen in de bouwer."
        />
        <Link href="/admin/websitevoorstellen" className="text-sm font-medium underline">
          Naar Websitevoorstellen
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <Link href="/admin/websitevoorstellen" className="text-sm font-medium underline">
        Terug naar Websitevoorstellen
      </Link>
      <SiteBuilder origin={new URL(env.APP_BASE_URL).origin} apiBase={`/api/admin/websitevoorstellen/${id}/site`} proposal />
    </div>
  );
}
