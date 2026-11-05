import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { checkNetwerkToken } from "@/lib/netwerk/token";
import { REDEN_TEKST, wifiToegang } from "@/lib/netwerk/radius";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// De RADIUS-server vraagt per inlogpoging op de wifi: mag deze gebruiker nu,
// op het netwerk dat vanaf dit IP komt? (lib/netwerk/radius.ts). Alleen met
// NETWERK_RADIUS_TOKEN (lib/netwerk/token.ts); staat daarom in de lijst van
// openbare routes (lib/auth/public-routes.ts) met eigen sleutelcontrole.
// Het antwoord is in de vorm die FreeRADIUS (rlm_rest) direct kan gebruiken:
//   control:Cleartext-Password  waarmee hij het wachtwoord van het apparaat controleert
//   reply:Session-Timeout       seconden tot de wifi vanzelf stopt
// Geen toegang → 401 met de reden.
// ---------------------------------------------------------------------------

const schema = z.object({
  username: z.string().min(1).max(254),
  nasIp: z.string().min(1).max(64),
});

export async function POST(request: Request): Promise<Response> {
  const poort = checkNetwerkToken(request);
  if (!poort.ok) return NextResponse.json({ ok: false, reden: poort.message }, { status: poort.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reden: "username en nasIp zijn verplicht" }, { status: 400 });

  const r = await wifiToegang({ gebruiker: parsed.data.username, nasIp: parsed.data.nasIp });
  if (!r.ok) {
    // geen gebruikersnaam of IP in het log: alleen de reden en een getal
    logger.info("wifi geweigerd", { reden: r.reden });
    return NextResponse.json({ ok: false, reden: r.reden, tekst: REDEN_TEKST[r.reden] }, { status: 401 });
  }
  logger.info("wifi toegestaan", { soort: r.soort, sessieSeconden: r.sessieSeconden });
  return NextResponse.json({
    ok: true,
    soort: r.soort,
    sessieSeconden: r.sessieSeconden,
    "control:Cleartext-Password": r.wachtwoord,
    "reply:Session-Timeout": r.sessieSeconden,
    "reply:Reply-Message": `Welkom ${r.naam}`,
  });
}
