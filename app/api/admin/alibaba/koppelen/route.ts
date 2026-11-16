import { NextResponse } from "next/server";
import { withAdminAccess } from "@/lib/auth/handlers";
import { env } from "@/lib/env";
import { autorisatieAdres } from "@/lib/integrations/alibaba-openapi";
import { alibabaInstellingen, alibabaTerugAdres, nieuweState, ontkoppel } from "@/lib/integrations/alibaba-openapi-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/alibaba/koppelen — de beheerder geeft ZekerFlex toestemming bij Alibaba (lib/integrations/
// alibaba-openapi.ts): door naar de autorisatiepagina met een eenmalige state; Alibaba stuurt terug naar
// /api/admin/alibaba/terug. POST = ontkoppelen (het bewaarde token weg). Alleen PLATFORM_ADMIN.

const naarWebshop = (stand: string) => NextResponse.redirect(new URL(`/admin/webshop?alibaba=${stand}`, env.APP_BASE_URL), 303);

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const inst = alibabaInstellingen();
  if (!inst) return naarWebshop("niet-ingesteld");
  return NextResponse.redirect(autorisatieAdres(inst.auth, inst.appKey, alibabaTerugAdres(), await nieuweState()), 303);
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  await ontkoppel();
  return naarWebshop("ontkoppeld");
});
