import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { HostingBoard } from "@/components/admin/HostingBoard";

export const dynamic = "force-dynamic";

export default async function HostingPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Hosting & domein is alleen beschikbaar voor platformbeheerders." />;
  }
  return <HostingBoard />;
}
