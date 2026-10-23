import { getPrincipal, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/app/ui";
import { IcpBoard } from "@/components/admin/IcpBoard";

export const dynamic = "force-dynamic";

export default async function IcpPage() {
  const principal = await getPrincipal();
  if (!principal || !hasRole(principal, "PLATFORM_ADMIN")) {
    return <div className="mx-auto max-w-4xl"><PageHeader title="Geen toegang" subtitle="De ICP-opgave is alleen voor platformbeheerders." /></div>;
  }
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="ICP-opgave" subtitle="Intracommunautaire prestaties (btw-verlegd) per kwartaal, uit de facturen — voor de Belastingdienst." />
      <IcpBoard />
    </div>
  );
}
