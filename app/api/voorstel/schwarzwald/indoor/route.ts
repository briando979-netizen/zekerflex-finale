import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { eisZelfdeHerkomst, huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { meldAanIndoor } from "@/lib/voorstel/schwarzwald-indoor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST → op de interesselijst voor het indoor megacenter (ingelogd: gekoppeld
// aan het account). Opnieuw aanmelden met hetzelfde adres werkt de bestaande
// aanmelding bij. Er gaat geen mail uit.

const schema = z.object({
  email: z.string().trim().email().max(200),
  naam: z.string().trim().max(120).optional(),
  interesses: z.array(z.string().max(30)).max(10).optional(),
  groep: z.number().int().min(1).max(500).optional(),
  toestemming: z.literal(true),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    eisZelfdeHerkomst(request);
    await enforceRateLimit({ name: "voorstel-schwarzwald-indoor", identifier: clientIp(request), limit: 5, windowSeconds: 600, message: "Te veel aanmeldingen achter elkaar. Probeer het later opnieuw." });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Vul een geldig e-mailadres in en geef toestemming om je te mailen.", parsed.error.flatten());
    const account = await huidigAccount();
    const { nieuw } = await meldAanIndoor(
      { email: parsed.data.email, naam: parsed.data.naam ?? "", interesses: parsed.data.interesses ?? [], groep: parsed.data.groep },
      account?.email,
    );
    return NextResponse.json({ ok: true, nieuw });
  } catch (err) {
    return jsonError(err);
  }
}
