import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { withAdminAccess } from "@/lib/auth/handlers";
import { recordAudit } from "@/lib/audit";
import { SEO_PADEN, SEO_STANDAARD, isSeoPad } from "@/lib/ontwerp/seo";
import { getSeoEigen, zetSeoEigen } from "@/lib/ontwerp/seo-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function overzicht() {
  const eigen = await getSeoEigen();
  return { paginas: SEO_PADEN.map((pad) => ({ pad, standaard: SEO_STANDAARD[pad], eigen: eigen[pad] ?? null })) };
}

// GET: de vaste pagina's met hun standaard en eigen titel/omschrijving.
export const GET = withAdminAccess(["PLATFORM_ADMIN"], async () => NextResponse.json(await overzicht()));

const schema = z.object({ pad: z.string(), titel: z.string().max(400), omschrijving: z.string().max(1000) });

// PUT: een eigen titel/omschrijving live zetten (beide leeg = terug naar de standaard).
export const PUT = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isSeoPad(parsed.data.pad)) throw AppError.validation("Deze pagina kon niet worden gelezen.");
  await zetSeoEigen(parsed.data.pad, { titel: parsed.data.titel, omschrijving: parsed.data.omschrijving });
  await recordAudit({ category: "ADMIN", action: "ontwerp.seo", actorUserId: principal.userId, actorLabel: "user", summary: `Titel/omschrijving voor Google bijgewerkt: ${parsed.data.pad}` });
  return NextResponse.json(await overzicht());
});

// DELETE ?pad=…: terug naar de standaard.
export const DELETE = withAdminAccess(["PLATFORM_ADMIN"], async (request: Request, { principal }) => {
  const pad = new URL(request.url).searchParams.get("pad");
  if (!isSeoPad(pad)) throw AppError.validation("Deze pagina bestaat niet.");
  await zetSeoEigen(pad, null);
  await recordAudit({ category: "ADMIN", action: "ontwerp.seo", actorUserId: principal.userId, actorLabel: "user", summary: `Titel/omschrijving voor Google terug naar de standaard: ${pad}` });
  return NextResponse.json(await overzicht());
});
