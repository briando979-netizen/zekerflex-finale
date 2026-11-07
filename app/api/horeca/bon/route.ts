import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { z } from "zod";
import { AppError, toErrorBody } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { zelfdeHerkomst } from "@/lib/rijschool/herkomst";
import { attachmentResponse } from "@/lib/mail/attachment-response";
import { isReservedTestAddress } from "@/lib/mail";
import { lees } from "@/lib/horeca/schema";
import { verstuur } from "@/lib/horeca/mail";
import { bonMail, bonPdf, bonUitToken } from "@/lib/horeca/bon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// De bon voor de gast (lib/horeca/bon.ts). Openbaar, maar alleen met een
// ondertekende link die precies één betaalde bon opent:
//   GET ?t=<token>          → de bon als pdf (download)
//   POST {t, email}         → de bon per mail, met de pdf als bijlage
// IP-begrensd; per bon hooguit een paar mails, zodat niemand er een spamkanon van maakt.

const mailSchema = z.object({ t: z.string().min(10).max(200), email: z.string().trim().toLowerCase().email("Vul een geldig e-mailadres in.").max(200) });

const fout = (err: unknown) => {
  const { status, body, headers } = toErrorBody(err);
  return NextResponse.json(body, { status, headers });
};

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await enforceRateLimit({ name: "horeca-bon-pdf", identifier: clientIp(request), limit: 60, windowSeconds: 600, message: "Even geduld, probeer het zo opnieuw." });
    const gevonden = await bonUitToken(new URL(request.url).searchParams.get("t") ?? undefined);
    if (!gevonden) throw AppError.notFound("Deze bon bestaat niet (meer).");
    const { zaak, bon, kop } = gevonden;
    return attachmentResponse({ filename: `bon-${zaak.slug}-${bon.bonNummer ?? "zekerflex"}.pdf`, contentType: "application/pdf", bytes: bonPdf(kop, bon) });
  } catch (err) {
    return fout(err);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website geweigerd.");
    await enforceRateLimit({ name: "horeca-bon-mail", identifier: clientIp(request), limit: 30, windowSeconds: 600, message: "Er zijn net veel bonnen gemaild. Probeer het over een paar minuten opnieuw." });
    const m = lees(mailSchema, await request.json().catch(() => null));
    const gevonden = await bonUitToken(m.t);
    if (!gevonden) throw AppError.notFound("Deze bon bestaat niet (meer).");
    const perBon = createHash("sha256").update(m.t).digest("hex").slice(0, 24);
    await enforceRateLimit({ name: "horeca-bon-mail-per-bon", identifier: perBon, limit: 5, windowSeconds: 86_400, message: "Deze bon is vandaag al een paar keer gemaild." });
    const { zaak, bon, kop } = gevonden;
    // een testadres (.test, .example, …) blijft in de eigen postbus: dat telt als gelukt
    const gelukt = await verstuur(bonMail(zaak, kop, bon, m.t, m.email));
    if (!gelukt && !isReservedTestAddress(m.email)) throw AppError.upstream("De mail kon niet worden verstuurd. Download de bon of probeer het later opnieuw.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fout(err);
  }
}
