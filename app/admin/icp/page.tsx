import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHead } from "@/components/admin/kit";
import { IcpBoard } from "@/components/admin/IcpBoard";

export const dynamic = "force-dynamic";

export default async function IcpPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <PageHead title="Geen toegang" subtitle="De ICP-opgave is alleen voor platformbeheerders." />;
  }
  return (
    <div className="space-y-4">
      <PageHead title="ICP-opgave" subtitle="Intracommunautaire prestaties (btw-verlegd) per kwartaal, uit de facturen, voor de Belastingdienst." />
      <IcpBoard />
    </div>
  );
}
