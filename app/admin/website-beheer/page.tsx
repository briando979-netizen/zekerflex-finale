import { getPrincipal, hasRole } from "@/lib/auth";
import { WebsiteBeheer } from "@/components/admin/WebsiteBeheer";

export const dynamic = "force-dynamic";

export default async function WebsiteBeheerPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN", "HQ_ADMIN")) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Geen toegang</h1>
        <p className="text-slate-600">Website-beheer is alleen beschikbaar voor beheerders.</p>
      </main>
    );
  }
  return <WebsiteBeheer />;
}
