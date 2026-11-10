import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { ruimVerlopenGesprekkenOp } from "@/lib/sitechat/gesprek";
import { ruimVerlopenVoorraadmeldingenOp } from "@/lib/sites/voorraadmelding-opslag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Elke nacht (deploy/cron/entrypoint.sh): websitechats (Schwarzwald en alle
// klantsites) wissen als er 90 dagen niets in gebeurde, zoals de chat belooft. En de wachtlijsten
// "mail me als het er weer is" van webshops: een adres waarvan het product een half jaar niet
// terugkwam is weg, zoals het formulier belooft (lib/sites/voorraadmelding-opslag.ts).
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  try {
    const uitkomst = { ...(await ruimVerlopenGesprekkenOp()), voorraadmeldingen: (await ruimVerlopenVoorraadmeldingenOp()).gewist };
    recordCronRun("sitechat-opruimen", true);
    return NextResponse.json(uitkomst);
  } catch (err) {
    recordCronRun("sitechat-opruimen", false);
    logger.error("sitechat cleanup failed", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Opruimen mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
