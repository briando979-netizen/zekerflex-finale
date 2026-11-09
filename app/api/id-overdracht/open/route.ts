import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { openOverdracht } from "@/lib/kyc/overdracht";

// POST /api/id-overdracht/open — de telefoon opent /id-scan#<code>: de laptop ziet
// "verbonden". Openbaar (de telefoon is niet ingelogd): de eenmalige code van
// 20 minuten in de body is het bewijs, IP-begrensd. Geeft alleen de voornaam terug,
// zodat de telefoon "Hoi Briando" kan zeggen.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "id-overdracht-open", identifier: clientIp(request), limit: 30, windowSeconds: 600 });
    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    const o = await openOverdracht(typeof body.code === "string" ? body.code : "");
    if (!o) throw AppError.notFound("Deze link is niet (meer) geldig. Maak op je laptop een nieuwe QR-code.");
    const user = await prisma.user.findUnique({ where: { id: o.userId }, select: { fullName: true } }).catch(() => null);
    const voornaam = user?.fullName.trim().split(/\s+/)[0] ?? "";
    return NextResponse.json({ voornaam }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
