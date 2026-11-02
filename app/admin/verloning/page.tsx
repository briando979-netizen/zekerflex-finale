import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { PayrollBoard } from "@/components/admin/PayrollBoard";

export const dynamic = "force-dynamic";

export default async function AdminVerloningPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="Verloning is voor platformbeheerders." />;
  }
  return <PayrollBoard />;
}
