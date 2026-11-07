import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { synchroniseerAgentCatalogus } from "@/lib/shop/agent-handel-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/verkoop-via-ai — de productlijst nu (opnieuw) naar Stripe sturen,
// ook als er niets veranderde en ook na een fout (lib/shop/agent-handel-server.ts).
export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (_request, { principal }) => {
  const { uitslag, stand } = await synchroniseerAgentCatalogus({ forceer: true });
  await recordAudit({
    category: "ADMIN",
    action: "shop.agent.catalogus",
    actorUserId: principal.userId,
    actorLabel: "user",
    summary: `Productlijst voor AI-assistenten met de hand naar Stripe gestuurd (${uitslag})`,
    targetType: "shop",
    targetId: "agent-catalogus",
    metadata: { uitslag, regels: stand.regels ?? 0 },
  }).catch(() => undefined);
  return NextResponse.json({ uitslag, stand });
});
