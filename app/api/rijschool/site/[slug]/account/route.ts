import { jsonBegrensd } from "@/lib/http/body-grens";
import { NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { eisZelfdeHerkomst, inloggen, uitloggen, wachtwoordMetUitnodiging } from "@/lib/rijschool/accounts";
import { accountActieSchema, lees } from "@/lib/rijschool/schema";
import { siteRijschool } from "@/lib/rijschool/toegang";
import { nodigUit } from "@/lib/rijschool/store";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/rijschool/site/<slug>/account — inloggen, uitloggen of een wachtwoord kiezen met de uitnodigingslink.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    eisZelfdeHerkomst(request);
    const r = await siteRijschool((await params).slug);
    // vóór het lezen (12 nov): een ruime limiet per IP voor elke actie (ook uitloggen), en een begrensde body
    await enforceRateLimit({ name: "rijschool-account-ip", identifier: clientIp(request), limit: 120, windowSeconds: 600 });
    const gelezen = await jsonBegrensd(request, 16_000);
    const a = lees(accountActieSchema, gelezen.ok ? gelezen.waarde : {});
    if (a.actie === "uitloggen") {
      await uitloggen();
      return NextResponse.json({ ok: true });
    }
    await enforceRateLimit({
      name: `rijschool-${a.actie}`,
      identifier: clientIp(request),
      limit: 10,
      windowSeconds: 600,
      message: "Te veel pogingen. Probeer het over tien minuten opnieuw.",
    });
    if (a.actie === "inloggen") {
      await inloggen(r, a.soort, a.email, a.wachtwoord);
      return NextResponse.json({ ok: true, soort: a.soort });
    }
    if (a.actie === "vergeten") {
      // altijd hetzelfde antwoord: niemand leert zo welke adressen een account hebben
      const where = { rijschoolId_email: { rijschoolId: r.id, email: a.email } };
      const account =
        a.soort === "leerling"
          ? await prisma.rijschoolLeerling.findUnique({ where, select: { id: true, status: true } })
          : await prisma.rijschoolInstructeur.findUnique({ where, select: { id: true, actief: true } });
      const mag = account && ("status" in account ? account.status !== "GESTOPT" : account.actief);
      if (account && mag) await nodigUit(r, a.soort, account.id, true);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: true, soort: await wachtwoordMetUitnodiging(r, a.token, a.wachtwoord) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
