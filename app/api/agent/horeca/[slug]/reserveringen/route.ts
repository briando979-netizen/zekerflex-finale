import { after, NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { gastReserveringSchema, lees } from "@/lib/horeca/schema";
import { agentAntwoord, agentZaak, boekViaAgent } from "@/lib/horeca/agent-server";
import { leesIdemSleutel } from "@/lib/horeca/agent";
import { bevestigingGast, nieuweReserveringZaak, verstuur } from "@/lib/horeca/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voor AI-assistenten: een tafel reserveren namens een gast. Openbaar, maar
// IP-begrensd en per zaak en e-mailadres hooguit 5 per dag; de server houdt de
// reservering onder een slot tegen de capaciteit (lib/horeca/reserveringen.ts).
// Stuur een Idempotency-Key mee: nog een keer hetzelfde verzoek geeft dezelfde
// reservering terug in plaats van een tweede. De gast krijgt dezelfde
// bevestigingsmail (met annuleerlink) als bij de eigen site, de zaak een seintje.
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "agent-horeca-boek", identifier: clientIp(request), limit: 60, windowSeconds: 3600 });
    const zaak = await agentZaak((await params).slug);
    const r = lees(gastReserveringSchema, await request.json().catch(() => null));
    await enforceRateLimit({
      name: "agent-horeca-boek-gast",
      identifier: `${zaak.id}:${r.email.trim().toLowerCase()}`,
      limit: 5,
      windowSeconds: 86_400,
      message: "Met dit e-mailadres zijn vandaag al 5 reserveringen bij deze zaak gemaakt. Bel de zaak voor meer.",
    });
    const { reservering, herhaald } = await boekViaAgent(zaak, r, leesIdemSleutel(request.headers.get("idempotency-key")));
    if (!herhaald) {
      after(async () => {
        await verstuur(bevestigingGast(zaak, reservering));
        await verstuur(nieuweReserveringZaak(zaak, reservering));
      });
    }
    return NextResponse.json({ reservering: agentAntwoord(zaak, reservering), herhaald }, { status: herhaald ? 200 : 201 });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
