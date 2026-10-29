import { getPrincipal, hasRole } from "@/lib/auth";
import { HostingBoard } from "@/components/admin/HostingBoard";

export const dynamic = "force-dynamic";

export default async function HostingPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return (
      <main className="p-8">
        <h1 className="text-lg font-semibold">Geen toegang</h1>
        <p className="text-slate-600">Hosting &amp; domein is alleen beschikbaar voor platformbeheerders.</p>
      </main>
    );
  }
  return (
    <div className="mx-auto max-w-4xl">
      <HostingBoard />
    </div>
  );
}
