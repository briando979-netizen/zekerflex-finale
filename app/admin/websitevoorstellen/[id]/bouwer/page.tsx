import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrincipal, hasRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { PageHead } from "@/components/admin/kit";
import { SiteBuilder } from "@/components/app/SiteBuilder";
import { isProposalId } from "@/lib/sales/website-proposal";

export const dynamic = "force-dynamic";

// Admin → Websitevoorstellen → Aanpassen: the proposal's site in the same
// builder companies use, before it is sent. The proposal banner stays on.
export default async function ProposalBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Websitevoorstellen aanpassen is alleen voor platformbeheerders." />;
  }
  const { id } = await params;
  if (!isProposalId(id)) notFound();
  return (
    <div className="space-y-4">
      <Link href="/admin/websitevoorstellen" className="text-sm font-medium underline">
        Terug naar Websitevoorstellen
      </Link>
      <SiteBuilder origin={new URL(env.APP_BASE_URL).origin} apiBase={`/api/admin/websitevoorstellen/${id}/site`} proposal />
    </div>
  );
}
