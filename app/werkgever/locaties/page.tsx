import { requirePrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { BranchesBoard } from "@/components/app/BranchesBoard";
import { getDict, getLocale } from "@/lib/i18n/server";
import { werklocatieKeuzes } from "@/lib/geo/vestiging-buitenland";

export const dynamic = "force-dynamic";

export default async function LocatiesPage() {
  const l = (await getDict()).locaties;
  const principal = await requirePrincipal();
  await resolveEmployerScope(principal);
  const canManage = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
  // de vlaggen `werk-in-belgie` en `werk-in-buitenland` (standaard uit): bij een nieuwe locatie ook een ander land kunnen kiezen
  const landen = canManage ? await werklocatieKeuzes(principal, await getLocale()) : null;

  return (
    <>
      {/* de kop staat in het scherm zelf: de knop "Nieuwe locatie" rechtsboven opent daar de dialoog (components/app/BranchesBoard.tsx) */}
      <BranchesBoard canManage={canManage} landen={landen} />

      <p className="mt-6 text-xs leading-relaxed text-neutralx-500">{l.oneOff}</p>
    </>
  );
}
