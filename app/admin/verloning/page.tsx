import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { PayrollBoard } from "@/components/admin/PayrollBoard";

export const dynamic = "force-dynamic";

export default async function AdminVerloningPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN", "HQ_ADMIN")) {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader title="Geen toegang" subtitle="Verloning is voor beheerders." />
      </div>
    );
  }
  return <PayrollBoard />;
}
