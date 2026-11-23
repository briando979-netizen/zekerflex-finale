import { requirePrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { BranchesBoard } from "@/components/app/BranchesBoard";
import { getDict } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function LocatiesPage() {
  const l = (await getDict()).locaties;
  const principal = await requirePrincipal();
  await resolveEmployerScope(principal);
  const canManage = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");

  return (
    <>
      {/* de kop staat in het scherm zelf: de knop "Nieuwe locatie" rechtsboven opent daar de dialoog (components/app/BranchesBoard.tsx) */}
      <BranchesBoard canManage={canManage} />

      <p className="mt-6 text-xs leading-relaxed text-neutralx-500">{l.oneOff}</p>
    </>
  );
}
