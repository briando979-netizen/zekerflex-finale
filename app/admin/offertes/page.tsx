import { getPrincipal, hasRole } from "@/lib/auth";
import { Offertes } from "@/components/admin/Offertes";

export const dynamic = "force-dynamic";

export default async function OffertesPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN", "HQ_ADMIN")) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Geen toegang</h1>
        <p className="text-slate-600">De offerte-AI is alleen beschikbaar voor beheerders.</p>
      </main>
    );
  }
  return <Offertes />;
}
