import { getPrincipal, hasRole } from "@/lib/auth";
import { ControlCenter } from "@/components/admin/ControlCenter";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN")) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Geen toegang</h1>
        <p className="text-slate-600">Het controlecentrum is voor beheerders.</p>
      </main>
    );
  }
  return <ControlCenter />;
}
