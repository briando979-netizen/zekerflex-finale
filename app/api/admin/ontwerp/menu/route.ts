import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { STANDAARD_VOETTEKST } from "@/lib/ontwerp/menu";
import { getVoettekst, resetVoettekst, setVoettekst } from "@/lib/ontwerp/menu-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: de voettekst zoals hij live staat, plus de standaard.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  return NextResponse.json({ ...(await getVoettekst()), standaard: STANDAARD_VOETTEKST });
});

const schema = z.object({ voettekst: z.record(z.unknown()) });

// PUT: een eigen voettekst live zetten.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Deze voettekst kon niet worden gelezen.");
  const voettekst = await setVoettekst(parsed.data.voettekst);
  await recordAudit({ category: "ADMIN", action: "ontwerp.footer", actorUserId: principal.userId, actorLabel: "user", summary: "Voettekst van de site bijgewerkt" });
  return NextResponse.json({ voettekst, eigen: true, standaard: STANDAARD_VOETTEKST });
});

// DELETE: terug naar de standaard.
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (_request: Request, { principal }) => {
  await resetVoettekst();
  await recordAudit({ category: "ADMIN", action: "ontwerp.footer", actorUserId: principal.userId, actorLabel: "user", summary: "Voettekst van de site terug naar de standaard" });
  return NextResponse.json({ voettekst: STANDAARD_VOETTEKST, eigen: false, standaard: STANDAARD_VOETTEKST });
});
