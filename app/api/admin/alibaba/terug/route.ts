import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { maakToken, stateGeldig } from "@/lib/integrations/alibaba-openapi-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/alibaba/terug?code=&state= — Alibaba stuurt de beheerder na de toestemming hierheen. Alleen met een
// geldige, eenmalige state (geen andere site kan een code bij ons laten omruilen) en alleen als PLATFORM_ADMIN. De code
// gaat naar /auth/token/create; het token wordt versleuteld bewaard. Geen code of token in een log of in de URL terug.

const naarWebshop = (stand: string) => NextResponse.redirect(new URL(`/admin/webshop?alibaba=${stand}`, env.APP_BASE_URL), 303);

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const q = new URL(request.url).searchParams;
  const code = q.get("code") ?? "";
  if (!(await stateGeldig(q.get("state") ?? ""))) return naarWebshop("verlopen");
  if (!code || code.length > 512) return naarWebshop("geweigerd");
  try {
    await maakToken(code);
    return naarWebshop("gekoppeld");
  } catch (err) {
    logger.warn("alibaba: koppelen mislukt", { fout: err instanceof Error ? err.message.slice(0, 160) : "onbekend" });
    return naarWebshop("mislukt");
  }
});
