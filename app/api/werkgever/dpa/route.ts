import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { AppError } from "@/lib/errors";
import { getDpaStand, zetDpaOndertekend } from "@/lib/dpa/dpa-store";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const principal = await requirePrincipal();
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) throw AppError.precondition("Geen organisatie");
  return NextResponse.json(await getDpaStand(tenantId));
}

const postSchema = z.object({ naam: z.string().min(1).max(200) });

export async function POST(req: Request): Promise<NextResponse> {
  const principal = await requirePrincipal();
  await enforceRateLimit({ name: "dpa-ondertekenen", identifier: principal.userId, limit: 5, windowSeconds: 3600 });
  const scope = await resolveEmployerScope(principal);
  const tenantId = scope.tenantIds[0];
  if (!tenantId) throw AppError.precondition("Geen organisatie");
  const body = postSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) throw AppError.validation("Vul je naam in.");
  return NextResponse.json(await zetDpaOndertekend(tenantId, body.data.naam));
}
