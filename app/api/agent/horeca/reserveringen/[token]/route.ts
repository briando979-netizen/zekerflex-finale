import { after, NextResponse } from "next/server";
import { toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { agentAntwoord, agentReservering, annuleerViaAgent } from "@/lib/horeca/agent-server";
import { geannuleerdZaak, verstuur } from "@/lib/horeca/mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Voor AI-assistenten: één reservering bekijken (GET) of annuleren (DELETE),
// alleen met het token uit het antwoord bij het boeken (dezelfde ondertekende
// link als in de mail aan de gast, lib/horeca/link.ts). Annuleren mag zolang de
// reservering nog niet begonnen is; de zaak krijgt dan een seintje.
type Ctx = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "agent-horeca-kijk", identifier: clientIp(request), limit: 300, windowSeconds: 600 });
    const { zaak, reservering } = await agentReservering((await params).token);
    return NextResponse.json({ reservering: agentAntwoord(zaak, reservering) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}

export async function DELETE(request: Request, { params }: Ctx): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "agent-horeca-annuleer", identifier: clientIp(request), limit: 30, windowSeconds: 3600 });
    const { zaak, reservering } = await annuleerViaAgent((await params).token);
    after(() => verstuur(geannuleerdZaak(zaak, reservering)).then(() => undefined));
    return NextResponse.json({ reservering: agentAntwoord(zaak, reservering) });
  } catch (err) {
    const { status, body, headers } = toErrorBody(err);
    return NextResponse.json(body, { status, headers });
  }
}
