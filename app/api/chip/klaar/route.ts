import { NextResponse } from "next/server";
import { AppError, toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";
import { laadCsca } from "@/lib/kyc/chip/csca";
import { chipTekst, rondChipAf } from "@/lib/kyc/chip/sessie";

// POST /api/chip/klaar — de Android-app stuurt wat hij van de chip las (DG1, DG2,
// SOD, base64) met de eenmalige code. De server controleert de passieve
// authenticatie (lib/kyc/chip) en bewaart alleen de uitslag; de bestanden zelf,
// de pasfoto en het BSN niet. Openbaar: de code is het bewijs, IP-begrensd.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX = { dg1: 2_000, dg2: 300_000, sod: 40_000 };

function bytes(v: unknown, max: number, naam: string): Buffer {
  if (typeof v !== "string" || !/^[A-Za-z0-9+/=]+$/.test(v)) throw AppError.validation(`${naam} ontbreekt of is geen base64`);
  const b = Buffer.from(v, "base64");
  if (b.length === 0 || b.length > max) throw AppError.validation(`${naam} heeft een onverwachte grootte`);
  return b;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "chip-klaar", identifier: clientIp(request), limit: 20, windowSeconds: 600 });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const code = typeof body.code === "string" ? body.code : "";
    const bestanden = {
      dg1: bytes(body.dg1, MAX.dg1, "DG1"),
      sod: bytes(body.sod, MAX.sod, "SOD"),
      ...(body.dg2 ? { dg2: bytes(body.dg2, MAX.dg2, "DG2") } : {}),
    };
    const lezing = await rondChipAf(code, bestanden, await laadCsca());
    if (!lezing) throw AppError.notFound("Deze code is niet (meer) geldig. Start het chip lezen opnieuw vanuit ZekerFlex.");
    return NextResponse.json({ echt: lezing.echt, tekst: chipTekst(lezing) }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    // nooit de inhoud loggen (de chip bevat het BSN en de pasfoto)
    if (status >= 500) logger.error("chip klaar mislukt", { error: (err as Error).message });
    return NextResponse.json(body, { status });
  }
}
