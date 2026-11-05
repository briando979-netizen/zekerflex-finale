import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { NetwerkAdmin } from "@/components/admin/NetwerkAdmin";

export const dynamic = "force-dynamic";

// Admin → Sales & groei → Verbinding: wie welke netwerkpakketten heeft (wifi,
// VPN, 5G), wat dat per maand oplevert en of de servers erachter gekoppeld zijn.
export default async function NetwerkAdminPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De netwerkpakketten zijn alleen beschikbaar voor platformbeheerders." />;
  }
  return <NetwerkAdmin />;
}
