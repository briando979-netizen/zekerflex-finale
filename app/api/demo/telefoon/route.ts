import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { MAX_INVOER } from "@/lib/telephony/demo";
import { maakDemo, voorbeeldGesprek } from "@/lib/telephony/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De luisterdemo van de telefoonassistent op /aanbod/telefonie (lib/telephony/demo-server.ts). Openbaar (valt onder
// /api/demo in lib/auth/public-routes.ts), daarom: alleen van de eigen site, IP- en dagbegrensd, een verborgen botveld,
// en nooit meer dan twee gesprekken tegelijk. Het vaste voorbeeld is voor iedereen gelijk en staat in het geheugen.

const schema = z.object({
  voorbeeld: z.boolean().optional(),
  invoer: z.string().trim().max(MAX_INVOER).optional(),
  /** botveld: mensen zien het niet en laten het leeg */
  extra: z.string().max(200).optional(),
});

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    const b = schema.safeParse(await request.json().catch(() => null));
    if (!b.success) throw AppError.validation("Vul je website of de naam van je zaak in.");
    const ip = clientIp(request);
    // een bot vult het verborgen veld in: die krijgt het vaste voorbeeld, zonder ons model aan het werk te zetten
    if (b.data.voorbeeld || b.data.extra?.trim()) {
      await enforceRateLimit({ name: "telefoon-demo-voorbeeld", identifier: ip, limit: 30, windowSeconds: 3600 });
      return NextResponse.json(await voorbeeldGesprek());
    }
    if (!b.data.invoer || b.data.invoer.length < 2) throw AppError.validation("Vul je website of de naam van je zaak in.");
    await enforceRateLimit({ name: "telefoon-demo", identifier: ip, limit: 5, windowSeconds: 3600, message: "Je hebt er al een paar gemaakt. Probeer het over een uur opnieuw." });
    await enforceRateLimit({ name: "telefoon-demo-dag", identifier: "alle", limit: 300, windowSeconds: 86_400, message: "Vandaag zijn er al veel voorbeeldgesprekken gemaakt. Probeer het morgen opnieuw." });
    return NextResponse.json(await maakDemo(b.data.invoer));
  } catch (err) {
    return fout(err);
  }
}
