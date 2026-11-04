import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { getBalk, zetBalk } from "@/lib/ontwerp/balk-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: de aankondigingsbalk zoals hij is ingesteld.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json({ balk: await getBalk() }));

const schema = z.object({ balk: z.record(z.unknown()) });

// PUT: de balk bewaren (meteen live als hij aan staat en binnen zijn datums valt).
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Deze balk kon niet worden gelezen.");
  const balk = await zetBalk(parsed.data.balk);
  await recordAudit({ category: "ADMIN", action: "ontwerp.balk", actorUserId: principal.userId, actorLabel: "user", summary: balk.aan ? `Aankondigingsbalk aan: ${balk.tekst.slice(0, 80)}` : "Aankondigingsbalk uit" });
  return NextResponse.json({ balk });
});
