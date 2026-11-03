import { getPrincipal, hasRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { PageHead } from "@/components/admin/kit";
import { WebsiteProposalsAdmin } from "@/components/admin/WebsiteProposalsAdmin";

export const dynamic = "force-dynamic";

export default async function WebsitevoorstellenPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Websitevoorstellen zijn alleen beschikbaar voor platformbeheerders." />;
  }
  return <WebsiteProposalsAdmin origin={new URL(env.APP_BASE_URL).origin} me={principal.fullName || principal.email} />;
}
