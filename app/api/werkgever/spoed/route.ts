import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveEmployerScope } from "@/lib/dashboard/employer";
import { KANALEN, STRALEN_KM } from "@/lib/spoed/regels";
import { spoedOverzicht, startSpoedoproep, stopSpoedoproep } from "@/lib/spoed/oproep";

// Spoedoproep van een opdrachtgever (lib/spoed): GET stand, POST versturen
// (of een extra ronde), DELETE stoppen. De dienst moet bij het bedrijf horen.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function dienstVan(request: Request, shiftId: string): Promise<{ tenantId: string; userId: string }> {
  const p = await requirePrincipal();
  const scope = await resolveEmployerScope(p);
  if (!scope.tenantIds.length) throw AppError.forbidden("Alleen voor opdrachtgevers.");
  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, branch: { tenantId: { in: scope.tenantIds }, ...(scope.branchIds ? { id: { in: scope.branchIds } } : {}) } },
    select: { branch: { select: { tenantId: true } } },
  });
  if (!shift) throw AppError.notFound("Deze dienst bestaat niet.");
  void request;
  return { tenantId: shift.branch.tenantId, userId: p.userId };
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const shiftId = new URL(request.url).searchParams.get("shiftId") ?? "";
    if (!shiftId) throw AppError.validation("shiftId ontbreekt");
    await dienstVan(request, shiftId);
    return NextResponse.json(await spoedOverzicht(shiftId));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const startSchema = z.object({
  shiftId: z.string().min(1),
  radiusKm: z.number().refine((n): n is (typeof STRALEN_KM)[number] => (STRALEN_KM as readonly number[]).includes(n), "Kies 10, 25 of 50 km"),
  kanalen: z.array(z.enum(KANALEN as [string, ...string[]])).min(1),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const parsed = startSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(parsed.error.issues[0]?.message ?? "Controleer de gegevens");
    const { tenantId, userId } = await dienstVan(request, parsed.data.shiftId);
    await enforceRateLimit({
      name: "spoedoproep",
      identifier: tenantId,
      limit: 12,
      windowSeconds: 3600,
      message: "Te veel spoedoproepen in een uur. Probeer het straks opnieuw.",
    });
    const uit = await startSpoedoproep({
      shiftId: parsed.data.shiftId,
      tenantId,
      userId,
      radiusKm: parsed.data.radiusKm,
      kanalen: parsed.data.kanalen as ("push" | "sms" | "whatsapp")[],
    });
    return NextResponse.json({ nieuw: uit.nieuw, mislukt: uit.mislukt, ...(await spoedOverzicht(parsed.data.shiftId)) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const shiftId = new URL(request.url).searchParams.get("shiftId") ?? "";
    if (!shiftId) throw AppError.validation("shiftId ontbreekt");
    await dienstVan(request, shiftId);
    await stopSpoedoproep(shiftId);
    return NextResponse.json(await spoedOverzicht(shiftId));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
