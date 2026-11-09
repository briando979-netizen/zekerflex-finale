import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { maskeerEmail, openOverdracht } from "@/lib/kyc/overdracht";

// POST /api/id-overdracht/open — de telefoon opent /id-scan#<code>: de laptop ziet
// "verbonden". Openbaar (de telefoon is niet ingelogd): de eenmalige code van
// 20 minuten in de body is het bewijs, IP-begrensd. Het eerste toestel krijgt een
// eigen toesteltoken (daarmee kan alleen dát toestel verder, ook na herladen).
// Terug gaan alleen de voornaam en een gemaskeerd e-mailadres ("b•••@gmail.com"),
// zodat de telefoon kan vragen of het echt het eigen account is (review H1).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "id-overdracht-open", identifier: clientIp(request), limit: 30, windowSeconds: 600 });
    const body = (await request.json().catch(() => ({}))) as { code?: unknown; toestel?: unknown };
    const o = await openOverdracht(typeof body.code === "string" ? body.code : "", typeof body.toestel === "string" ? body.toestel : null);
    if (!o) throw AppError.notFound("Deze link is niet (meer) geldig. Maak op je laptop een nieuwe QR-code.");
    if ("anderToestel" in o) {
      return NextResponse.json(
        { error: { code: "ANDER_TOESTEL", message: "Deze link is al op een ander toestel geopend. Maak op je laptop een nieuwe QR-code." } },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }
    const user = await prisma.user.findUnique({ where: { id: o.userId }, select: { fullName: true, email: true } }).catch(() => null);
    const voornaam = user?.fullName.trim().split(/\s+/)[0] ?? "";
    return NextResponse.json(
      { voornaam, email: user ? maskeerEmail(user.email) : "", toestel: o.toestel },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
