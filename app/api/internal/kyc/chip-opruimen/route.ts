import { NextResponse } from "next/server";
import { checkInternalToken } from "@/lib/internal-auth";
import { recordCronRun } from "@/lib/metrics";
import { logger } from "@/lib/logger";
import { ruimChipOp } from "@/lib/kyc/chip/sessie";
import { ruimOverdrachtOp } from "@/lib/kyc/overdracht";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cron (elke 15 min): de verzegelde chipgegevens van de ID-controle (MRZ-sleutel,
// chipsessies, uitslagen) echt wissen als ze te oud zijn. KV kent geen
// verlooptijd, dus zonder deze taak bleven ze staan. Ook achtergebleven
// overdrachten naar de telefoon (lib/kyc/overdracht.ts), met hun foto's. Eigen shared-secret auth.
async function handle(request: Request): Promise<NextResponse> {
  const gate = checkInternalToken(request);
  if (!gate.ok) {
    return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: gate.message } }, { status: gate.status });
  }
  try {
    const gewist = (await ruimChipOp()) + (await ruimOverdrachtOp());
    recordCronRun("chip-opruimen", true);
    return NextResponse.json({ gewist });
  } catch (err) {
    recordCronRun("chip-opruimen", false);
    logger.error("chip-opruimen mislukt", { error: (err as Error).message });
    return NextResponse.json({ error: { code: "INTERNAL", message: "Opruimen mislukt" } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
