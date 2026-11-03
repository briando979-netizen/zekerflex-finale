import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { eisZelfdeHerkomst, huidigAccount } from "@/lib/voorstel/schwarzwald-accounts";
import { haalVanWachtlijst, zetOpWachtlijst } from "@/lib/voorstel/schwarzwald-wachtlijst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST   → op de wachtlijst voor een vol tijdslot (ingelogd: gekoppeld aan het account)
// DELETE → de gast haalt zijn eigen plek weg (alleen ingelogd)

const schema = z.object({
  activiteit: z.string().max(60),
  datum: z.string().max(10),
  tijd: z.string().max(5),
  personen: z.number().int().min(1).max(500),
  naam: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  telefoon: z.string().trim().min(6).max(40),
});

export async function POST(request: Request): Promise<NextResponse> {
  try {
    eisZelfdeHerkomst(request);
    await enforceRateLimit({ name: "voorstel-schwarzwald-wachtlijst", identifier: clientIp(request), limit: 5, windowSeconds: 600, message: "Te veel aanmeldingen achter elkaar. Probeer het later opnieuw." });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Vul je naam, e-mail en telefoonnummer in.", parsed.error.flatten());
    const account = await huidigAccount();
    const w = await zetOpWachtlijst(parsed.data, account?.email);
    return NextResponse.json({ id: w.id });
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    eisZelfdeHerkomst(request);
    const account = await huidigAccount();
    if (!account) throw AppError.forbidden("Log eerst in.");
    const parsed = z.object({ id: z.string().max(40) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation("Onbekende wachtlijstplek.");
    await haalVanWachtlijst(parsed.data.id, account.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
