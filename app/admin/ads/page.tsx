import { getPrincipal, hasRole } from "@/lib/auth";
import { AdsStudio } from "@/components/admin/AdsStudio";

export const dynamic = "force-dynamic";

export default async function AdsPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Geen toegang</h1>
        <p className="text-slate-600">De advertentiegenerator is alleen beschikbaar voor platformbeheerders.</p>
      </main>
    );
  }
  return <AdsStudio />;
}
