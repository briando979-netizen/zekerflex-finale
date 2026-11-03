import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { eisZelfdeHerkomst, huidigAccount, inloggen, registreer, uitloggen, wijzigProfiel } from "@/lib/voorstel/schwarzwald-accounts";
import { annuleerEigen, boekingenVanAccount } from "@/lib/voorstel/schwarzwald-boekingen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Klantaccount van de Schwarzwald-site (eigen sessie-cookie, los van
// ZekerFlex-login; openbaar in lib/auth/public-routes.ts).
// GET  → ingelogd account + eigen reserveringen
// POST {actie: registreren | inloggen | uitloggen | profiel | annuleren}

export async function GET(): Promise<NextResponse> {
  try {
    const account = await huidigAccount();
    if (!account) return NextResponse.json({ account: null, boekingen: [] });
    return NextResponse.json({ account, boekingen: await boekingenVanAccount(account.email) });
  } catch (err) {
    return jsonError(err);
  }
}

const WACHTWOORD = z.string().min(8, "Wachtwoord: minimaal 8 tekens.").max(200);

const schema = z.discriminatedUnion("actie", [
  z.object({
    actie: z.literal("registreren"),
    email: z.string().trim().email().max(200),
    naam: z.string().trim().min(2).max(120),
    telefoon: z.string().trim().min(6).max(40),
    wachtwoord: WACHTWOORD,
  }),
  z.object({ actie: z.literal("inloggen"), email: z.string().trim().email().max(200), wachtwoord: z.string().min(1).max(200) }),
  z.object({ actie: z.literal("uitloggen") }),
  z.object({
    actie: z.literal("profiel"),
    naam: z.string().trim().min(2).max(120),
    telefoon: z.string().trim().min(6).max(40),
    nieuwWachtwoord: z.union([WACHTWOORD, z.literal("")]).optional(),
  }),
  z.object({ actie: z.literal("annuleren"), datum: z.string().max(10), id: z.string().max(8) }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    eisZelfdeHerkomst(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const eerste = parsed.error.issues[0]?.message;
      throw AppError.validation(eerste && !eerste.startsWith("Invalid") ? eerste : "Controleer je gegevens.", parsed.error.flatten());
    }
    const d = parsed.data;
    const ip = clientIp(request);

    if (d.actie === "registreren") {
      await enforceRateLimit({ name: "voorstel-schwarzwald-registreren", identifier: ip, limit: 5, windowSeconds: 3600, message: "Te veel nieuwe accounts. Probeer het later opnieuw." });
      return NextResponse.json({ account: await registreer(d) });
    }
    if (d.actie === "inloggen") {
      await enforceRateLimit({ name: "voorstel-schwarzwald-inloggen", identifier: ip, limit: 10, windowSeconds: 600, message: "Te veel inlogpogingen. Wacht even en probeer het opnieuw." });
      return NextResponse.json({ account: await inloggen(d.email, d.wachtwoord) });
    }
    if (d.actie === "uitloggen") {
      await uitloggen();
      return NextResponse.json({ ok: true });
    }

    const account = await huidigAccount();
    if (!account) throw AppError.forbidden("Log eerst in.");
    if (d.actie === "profiel") {
      return NextResponse.json({ account: await wijzigProfiel(account.email, { naam: d.naam, telefoon: d.telefoon, nieuwWachtwoord: d.nieuwWachtwoord || undefined }) });
    }
    return NextResponse.json({ boeking: await annuleerEigen(d.datum, d.id, account.email) });
  } catch (err) {
    return jsonError(err);
  }
}
