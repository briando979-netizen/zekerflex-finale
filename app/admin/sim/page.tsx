import { getPrincipal, hasRole } from "@/lib/auth";
import { SimFloor } from "@/components/admin/SimFloor";

export const dynamic = "force-dynamic";

export default async function SimPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Geen toegang</h1>
        <p className="text-slate-600">De Sim is alleen beschikbaar voor platformbeheerders.</p>
      </main>
    );
  }
  return <SimFloor />;
}
