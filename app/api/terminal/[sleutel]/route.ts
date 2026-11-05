import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { z } from "zod";
import { env } from "@/lib/env";
import { AppError, toErrorBody } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit, privateRateLimitIdentifier } from "@/lib/rate-limit";
import { otpRest, otpVoor } from "@/lib/incheck/regels";
import { koppelingOpen, markeerGezien, terminalVanSleutel, tikOpTerminal } from "@/lib/incheck/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Het terminalscherm (app/terminal/[sleutel]) praat met deze route. De sleutel
// in het adres is het bewijs (geen login op de tablet); hij staat alleen als
// hash in de database en komt nooit in een log. Openbaar (lib/auth/public-routes.ts),
// met een limiet per IP.
//   GET  → naam, vestiging, de QR van dit moment en hoe lang hij nog geldt
//   POST → een tik: sleutelhanger (serienummer) of gescand werkpaspoort
// ---------------------------------------------------------------------------

async function terminal(sleutel: string, request: Request) {
  await enforceRateLimit({ name: "terminal-ip", identifier: privateRateLimitIdentifier(clientIp(request)), limit: 240, windowSeconds: 600, message: "Te veel verzoeken." });
  const t = await terminalVanSleutel(sleutel);
  if (!t) throw AppError.notFound("Deze terminal bestaat niet (meer). Vraag een nieuwe link in ZekerFlex onder Inchecken op locatie.");
  return t;
}

export async function GET(request: Request, { params }: { params: Promise<{ sleutel: string }> }): Promise<NextResponse> {
  try {
    const t = await terminal((await params).sleutel, request);
    const [branch, koppeling] = await Promise.all([prisma.branch.findUnique({ where: { id: t.branchId }, select: { name: true, city: true, tenant: { select: { name: true } } } }), koppelingOpen(t.id)]);
    void markeerGezien(t);
    const base = new URL(env.APP_BASE_URL).origin;
    const otp = otpVoor(t.id);
    const url = `${base}/i/${t.code}?k=${otp}`;
    const svg = await QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
    return NextResponse.json(
      {
        naam: t.naam,
        vestiging: branch?.name ?? "",
        plaats: branch?.city ?? "",
        bedrijf: branch?.tenant.name ?? "",
        qr: svg,
        geldigSeconden: otpRest(),
        /** iemand staat klaar om een sleutelhanger te koppelen */
        koppelen: Boolean(koppeling),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}

const tik = z.object({ serie: z.string().max(80).optional(), paspoort: z.string().max(300).optional() }).refine((v) => v.serie || v.paspoort, "Geen sleutelhanger of paspoort");

export async function POST(request: Request, { params }: { params: Promise<{ sleutel: string }> }): Promise<NextResponse> {
  try {
    const t = await terminal((await params).sleutel, request);
    const body = tik.parse(await request.json().catch(() => ({})));
    const uitslag = await tikOpTerminal(t, body);
    return NextResponse.json(uitslag, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
