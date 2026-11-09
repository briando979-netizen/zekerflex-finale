import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/handlers";
import { passkeyFoutAntwoord } from "@/lib/auth/passkey/fout";
import { registratieJson } from "@/lib/auth/passkey/json";
import { NAAM_MAX } from "@/lib/auth/passkey/naam";
import { beginRegistratie, passkeyStatus, verwijderPasskey, voltooiRegistratie } from "@/lib/auth/passkey/beheer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/me/passkeys — mijn passkeys + wat ik moet invullen om er een toe te voegen.
export const GET = withAuth(async (_req, { principal }) =>
  NextResponse.json(await passkeyStatus(principal.userId), { headers: { "Cache-Control": "no-store" } }),
);

const schema = z.discriminatedUnion("action", [
  // opnieuw bevestigen (wachtwoord of mailcode, plus de 2FA-code als die aan staat), dan de opties voor het toestel
  z.object({
    action: z.literal("begin"),
    wachtwoord: z.string().max(200).optional(),
    code: z.string().trim().max(20).optional(),
    mailcode: z.string().trim().max(20).optional(),
  }),
  z.object({ action: z.literal("finish"), naam: z.string().max(NAAM_MAX * 4), credential: registratieJson }),
  z.object({ action: z.literal("remove"), id: z.string().min(1).max(40) }),
]);

// POST /api/me/passkeys — een passkey toevoegen (begin → finish) of verwijderen.
export const POST = withAuth(async (req, { principal }) => {
  const body = schema.parse(await req.json().catch(() => ({})));
  try {
    if (body.action === "begin") {
      const publicKey = await beginRegistratie(principal.userId, { wachtwoord: body.wachtwoord, code: body.code, mailcode: body.mailcode });
      return NextResponse.json({ publicKey }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action === "finish") {
      return NextResponse.json({ passkeys: await voltooiRegistratie(principal.userId, { naam: body.naam, credential: body.credential }) });
    }
    return NextResponse.json({ passkeys: await verwijderPasskey(principal.userId, body.id) });
  } catch (err) {
    const antwoord = passkeyFoutAntwoord(err);
    if (antwoord) return antwoord;
    throw err;
  }
});
