import { requirePrincipal, hasRole } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { BranchesBoard } from "@/components/app/BranchesBoard";
import { getDict } from "@/lib/i18n/server";
import { werkInBelgieAan } from "@/lib/geo/vestiging-belgie";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LocatiesPage() {
  const l = (await getDict()).locaties;
  const principal = await requirePrincipal();
  await resolveEmployerScope(principal);
  const canManage = hasRole(principal, "HQ_ADMIN", "PLATFORM_ADMIN");
  // de vlag `werk-in-belgie` (standaard uit): bij een nieuwe locatie ook België kunnen kiezen
  const metBelgie = canManage && (await werkInBelgieAan(principal));
  const belgie = metBelgie ? (await getDict()).belgie : null;

  return (
    <>
      {/* de kop staat in het scherm zelf: de knop "Nieuwe locatie" rechtsboven opent daar de dialoog (components/app/BranchesBoard.tsx) */}
      <BranchesBoard canManage={canManage} metBelgie={metBelgie} />

      <p className="mt-6 text-xs leading-relaxed text-neutralx-500">{l.oneOff}</p>
      {/* werk in België (lib/belgie/klus-kern.ts): de bemiddelingsvoorwaarden voor België */}
      {belgie && (
        <p className="mt-2 text-xs">
          <Link href="/belgie/voorwaarden" className="inline-flex min-h-[44px] items-center font-semibold text-brand-600 hover:underline sm:min-h-0">
            {belgie.locatiesLink}
          </Link>
        </p>
      )}
    </>
  );
}
