import { getPrincipal, hasRole } from "@/lib/auth";
import { Beller } from "@/components/admin/Beller";

export const dynamic = "force-dynamic";

export default async function BellerPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Geen toegang</h1>
        <p className="text-slate-600">De AI-beller is alleen beschikbaar voor platformbeheerders.</p>
      </main>
    );
  }
  return <Beller />;
}
