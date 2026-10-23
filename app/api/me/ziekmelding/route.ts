import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePrincipal, requireRole } from "@/lib/auth";
import { toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { myZiekmeldingen, reportBetter, reportSick } from "@/lib/uitzend/ziekmelding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/ziekmelding — eigen ziekmeldingen.
export async function GET(): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    return NextResponse.json({ ziekmeldingen: await myZiekmeldingen(p.userId) });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const schema = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z.string().max(500).optional() });

// POST /api/me/ziekmelding — ziek melden; zoekt automatisch vervanging.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    await enforceRateLimit({ name: "ziekmelding", identifier: p.userId, limit: 10, windowSeconds: 3600 });
    const input = schema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await reportSick({ userId: p.userId, from: input.from, to: input.to ?? null, note: input.note }));
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

// PATCH /api/me/ziekmelding — beter melden.
export async function PATCH(request: Request): Promise<NextResponse> {
  try {
    const p = await requirePrincipal();
    requireRole(p, "FREELANCER");
    const { id } = z.object({ id: z.string().min(1) }).parse(await request.json().catch(() => ({})));
    const rec = await reportBetter(id);
    if (!rec || rec.userId !== p.userId) return NextResponse.json({ error: { code: "NOT_FOUND", message: "Niet gevonden" } }, { status: 404 });
    return NextResponse.json(rec);
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
