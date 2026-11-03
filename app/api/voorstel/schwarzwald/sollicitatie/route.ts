import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { eisZelfdeHerkomst, huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { plaatsSollicitatie } from "@/lib/voorstel/schwarzwald-sollicitaties";
import { UREN } from "@/lib/voorstel/sollicitatie-regels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Solliciteren via een vacaturepagina: komt in het beheer (Sollicitaties) in
// plaats van in de mailbox. Ingelogd → gekoppeld aan het account.

const schema = z.object({
  vacature: z.string().trim().max(100),
  naam: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  telefoon: z.string().trim().min(6).max(40),
  uren: z.union([z.enum(UREN), z.literal("")]).default(""),
  start: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal("")]).default(""),
  motivatie: z.string().trim().min(20, "Vertel in een paar zinnen waarom je bij ons wilt werken.").max(3000),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    eisZelfdeHerkomst(request);
    await enforceRateLimit({ name: "voorstel-schwarzwald-sollicitatie", identifier: clientIp(request), limit: 3, windowSeconds: 600, message: "Te veel sollicitaties achter elkaar. Probeer het later opnieuw." });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const motivatie = parsed.error.flatten().fieldErrors.motivatie?.[0];
      throw AppError.validation(motivatie ?? "Vul je naam, e-mail, telefoon en je motivatie in.", parsed.error.flatten());
    }
    const account = await huidigAccount();
    const s = await plaatsSollicitatie(parsed.data, account?.email);
    return NextResponse.json({ id: s.id, functie: s.functie });
  } catch (err) {
    return jsonError(err);
  }
}
