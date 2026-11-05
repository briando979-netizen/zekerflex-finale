import { NextResponse } from "next/server";
import { z } from "zod";
import { withAdminAccess } from "@/lib/auth/handlers";
import { AppError } from "@/lib/errors";
import { controleVan, lijstControles, startControle } from "@/lib/bouwer/controles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin → ZekerFlex AI → Live zetten → Controles (lib/bouwer/controles.ts).
// GET = de lopende controle en de laatste uitslagen; GET ?sha=<40 tekens> = één
// uitslag met de uitvoer van tsc/eslint/tests. POST { sha?, opnieuw? } = een
// controle starten op de nieuwste main (of een vastlegging) op de achtergrond.

export const GET = withAdminAccess(["PLATFORM_ADMIN"], async (request) => {
  const sha = new URL(request.url).searchParams.get("sha");
  if (sha) return NextResponse.json(await controleVan(sha));
  return NextResponse.json(await lijstControles());
});

const schema = z.object({
  sha: z.string().regex(/^(main|[0-9a-f]{7,40})$/).default("main"),
  opnieuw: z.boolean().default(false),
});

export const POST = withAdminAccess(["PLATFORM_ADMIN"], async (request, { principal }) => {
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw AppError.validation("Onbekende vastlegging");
  return NextResponse.json(await startControle(parsed.data.sha, principal.email, parsed.data.opnieuw), { status: 202 });
});
