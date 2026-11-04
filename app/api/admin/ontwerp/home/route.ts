import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { standaardHomeIndeling } from "@/lib/ontwerp/home";
import { bewaarHomeConcept, getConceptHomeIndeling, getLiveHomeIndeling, publiceerHome, resetHome } from "@/lib/ontwerp/home-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET: de indeling die live staat, het concept en de standaard.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => {
  const [live, concept] = await Promise.all([getLiveHomeIndeling(), getConceptHomeIndeling()]);
  return NextResponse.json({ live: live ?? standaardHomeIndeling(), eigen: Boolean(live), concept: concept ?? standaardHomeIndeling() });
});

const schema = z.object({ actie: z.enum(["concept", "publiceer"]), indeling: z.record(z.unknown()) });

// PUT: concept bewaren (alleen in het voorbeeld) of live zetten.
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw AppError.validation("Deze indeling kon niet worden gelezen.");
  if (parsed.data.actie === "concept") {
    const concept = await bewaarHomeConcept(parsed.data.indeling);
    return NextResponse.json({ concept });
  }
  const live = await publiceerHome(parsed.data.indeling);
  await recordAudit({ category: "ADMIN", action: "ontwerp.home", actorUserId: principal.userId, actorLabel: "user", summary: live ? "Indeling van de homepage live gezet" : "Homepage-indeling gelijk aan de standaard" });
  return NextResponse.json({ live: live ?? standaardHomeIndeling(), eigen: Boolean(live), concept: live ?? standaardHomeIndeling() });
});

// DELETE: terug naar de standaardindeling (live en concept).
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (_request: Request, { principal }) => {
  await resetHome();
  await recordAudit({ category: "ADMIN", action: "ontwerp.home", actorUserId: principal.userId, actorLabel: "user", summary: "Homepage terug naar de standaardindeling" });
  return NextResponse.json({ live: standaardHomeIndeling(), eigen: false, concept: standaardHomeIndeling() });
});
