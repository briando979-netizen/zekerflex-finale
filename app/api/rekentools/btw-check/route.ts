import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { checkVies } from "@/lib/integrations/vies";
import { kvkZoekLink, leesInvoer, nlBtwVormKlopt } from "@/lib/rekentools/btw-check";
import { recordServerEvent } from "@/lib/analytics/track";

// POST /api/rekentools/btw-check — de gratis btw-nummer-/KVK-check
// (/rekentools/btw-nummer-check). Openbaar, per IP begrensd. Een btw-id gaat
// naar VIES (Europese Commissie, gratis); een KVK-nummer controleren we op
// vorm en geven we een zoeklink in het Handelsregister. Niets wordt bewaard.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ nummer: z.string().trim().min(2).max(40) });

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({
      name: "btw-check",
      identifier: clientIp(request),
      limit: 20,
      windowSeconds: 600,
      message: "Te veel controles achter elkaar. Probeer het over een paar minuten opnieuw.",
    });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Vul een btw-nummer of KVK-nummer in.");
    const invoer = leesInvoer(parsed.data.nummer);
    void recordServerEvent({ path: "/rekentools/btw-nummer-check", label: "rekentool-btw-check", meta: { soort: invoer.soort } });

    if (invoer.soort === "kvk") {
      return NextResponse.json({ soort: "kvk", waarde: invoer.waarde, link: kvkZoekLink(invoer.waarde) });
    }
    if (invoer.soort === "onbekend") {
      return NextResponse.json({ soort: "onbekend", waarde: invoer.waarde });
    }
    if (invoer.landcode === "NL" && !nlBtwVormKlopt(invoer.waarde)) {
      return NextResponse.json({ soort: "btw", waarde: invoer.waarde, landcode: "NL", status: "malformed", naam: null, adres: null });
    }
    const r = await checkVies(invoer.waarde);
    return NextResponse.json({
      soort: "btw",
      waarde: r.vatNumber,
      landcode: r.countryCode || invoer.landcode,
      status: r.status,
      naam: r.name,
      adres: r.address,
      gecontroleerdOp: new Date().toISOString(),
    });
  } catch (err) {
    const { status, body } = toErrorBody(err);
    return NextResponse.json(body, { status });
  }
}
