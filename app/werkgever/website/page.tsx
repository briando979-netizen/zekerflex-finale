import { getPrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { adminFullAccess } from "@/lib/auth/admin-access";
import { getManagedWebsite, isUnlocked, WEBSITE_PLANS } from "@/lib/website/manage";
import { WebsiteManage } from "@/components/app/WebsiteManage";

export const dynamic = "force-dynamic";

export default async function WebsiteBeheerPage() {
  // Toegang is al afgedwongen in app/werkgever/layout.tsx.
  const principal = await getPrincipal();
  const admin = adminFullAccess(principal);
  const scope = principal ? await resolveEmployerScope(principal) : { tenantIds: [] as string[], branchIds: null };
  const tenantId = scope.tenantIds[0];
  const record = tenantId ? await getManagedWebsite(tenantId) : null;

  return (
    <WebsiteManage
      initial={{
        status: record?.status ?? null,
        unlocked: isUnlocked(record) || admin,
        plan: record?.plan ?? null,
        domain: record?.domain ?? null,
        provider: record?.provider ?? null,
        notes: record?.notes ?? null,
        hasSecrets: Boolean(record?.secretsSealed),
      }}
      plans={WEBSITE_PLANS}
      adminOverride={admin}
    />
  );
}
