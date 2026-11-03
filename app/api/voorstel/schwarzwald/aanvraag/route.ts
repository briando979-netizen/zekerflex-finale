import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { eisZelfdeHerkomst, huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { maakAanvraag } from "@/lib/voorstel/schwarzwald-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Aanvraagformulier (themafeest, bruiloft, grote groep): komt als lead in het
// CRM in plaats van als e-mail. Ingelogd → gekoppeld aan het account.

const schema = z.object({
  naam: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  telefoon: z.string().trim().min(6).max(40),
  gelegenheid: z.string().trim().max(80).default(""),
  programma: z.string().trim().max(120).default(""),
  datum: z.string().trim().max(10).default(""),
  personen: z.number().int().min(1).max(1000),
  bericht: z.string().trim().max(2000).default(""),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    eisZelfdeHerkomst(request);
    await enforceRateLimit({ name: "voorstel-schwarzwald-aanvraag", identifier: clientIp(request), limit: 5, windowSeconds: 600, message: "Te veel aanvragen achter elkaar. Probeer het later opnieuw." });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Vul je naam, e-mail, telefoon en het aantal personen in.", parsed.error.flatten());
    const account = await huidigAccount();
    const a = await maakAanvraag({ ...parsed.data, ...(account ? { account: account.email } : {}) });
    return NextResponse.json({ id: a.id });
  } catch (err) {
    return jsonError(err);
  }
}
