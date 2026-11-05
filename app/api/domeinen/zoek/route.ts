import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { extensie } from "@/lib/domeinen/extensies";
import { leesNaam, teZoeken } from "@/lib/domeinen/naam";
import { beschikbaarheid } from "@/lib/domeinen/beschikbaar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/domeinen/zoek?naam=bakkerij-jansen → is de naam vrij bij .nl, .com,
// .eu, …, met de prijs per jaar. Openbaar (lib/auth/public-routes.ts): alleen
// lezen, IP-begrensd; de server vraagt alleen de vaste registeradressen op.
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "domeinen-zoek", identifier: clientIp(request), limit: 30, windowSeconds: 600, message: "Je hebt veel gezocht. Probeer het over een paar minuten opnieuw." });
    const naam = leesNaam(new URL(request.url).searchParams.get("naam") ?? "");
    if (!naam) throw AppError.validation("Typ een naam, bijvoorbeeld bakkerijjansen of bakkerijjansen.nl.");
    const domeinen = teZoeken(naam);
    const resultaten = await Promise.all(
      domeinen.map(async (domein) => {
        const tld = domein.slice(naam.label.length + 1);
        const ext = extensie(tld);
        return { domein, tld, prijsCent: ext?.prijsCent ?? null, verlengCent: ext?.verlengCent ?? null, status: await beschikbaarheid(domein) };
      }),
    );
    return NextResponse.json({ naam: naam.label, gevraagd: naam.tld, resultaten }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
