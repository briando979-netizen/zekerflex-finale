import { NextResponse } from "next/server";
import { requirePrincipal } from "@/lib/auth";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/audit";
import { landUit } from "@/lib/werkrecht/landen";
import { landWeg, verklaar, werkrechtOverzicht } from "@/lib/werkrecht/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/werkrecht: mijn landen met verklaring en bewijs (Nederland altijd erbij).
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    return NextResponse.json({ landen: await werkrechtOverzicht(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// POST /api/me/werkrecht { land, verklaring: true }: de verklaring aanvinken voor een land.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    await enforceRateLimit({ name: "me-werkrecht", identifier: p.userId, limit: 30, windowSeconds: 600, message: "Even te vaak. Probeer het over een paar minuten opnieuw." });
    const body = (await request.json().catch(() => ({}))) as { land?: unknown; verklaring?: unknown };
    const land = landUit(body.land);
    if (!land) throw AppError.validation("Kies een land uit de lijst.");
    if (body.verklaring !== true) throw AppError.validation("Vink de verklaring aan.");
    await verklaar(p.userId, land);
    await recordAudit({
      category: "KYC",
      action: "werkrecht.verklaard",
      severity: "info",
      actorUserId: p.userId,
      actorLabel: "user",
      summary: `Verklaring recht om te werken (${land}) aangevinkt`,
      targetType: "user",
      targetId: p.userId,
    });
    return NextResponse.json({ landen: await werkrechtOverzicht(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// DELETE /api/me/werkrecht?land=XX: een land (niet Nederland) weghalen.
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    const land = landUit(new URL(request.url).searchParams.get("land"));
    if (!land) throw AppError.validation("Kies een land uit de lijst.");
    await landWeg(p.userId, land);
    return NextResponse.json({ landen: await werkrechtOverzicht(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
