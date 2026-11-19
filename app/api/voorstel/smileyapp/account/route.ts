import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { inloggen, neemUitnodigingAan, uitloggen } from "@/lib/voorstel/smileyapp-accounts";
import { smileyPoort } from "@/lib/voorstel/smileyapp-poort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inloggen in het SmileyApp-beheer (eigen sessie-cookie smiley_sessie, los van
// de ZekerFlex-login; openbaar in lib/auth/public-routes.ts).
// POST {actie: "inloggen", email, wachtwoord}
// POST {actie: "aannemen", token, wachtwoord}  → wachtwoord kiezen met de link uit de uitnodiging
// POST {actie: "uitloggen"}
// Er is geen registratie: je komt alleen binnen met een uitnodiging. De kaart
// "Kies een wachtwoord" leest de uitnodiging op de server (beheer/page.tsx).

const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("inloggen"), email: z.string().trim().max(200), wachtwoord: z.string().min(1).max(200) }),
  z.object({ actie: z.literal("aannemen"), token: z.string().max(100), wachtwoord: z.string().max(400) }),
  z.object({ actie: z.literal("uitloggen") }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const ip = await smileyPoort(request, { json: true });
    const gelezen = await jsonBegrensd(request, 4_000);
    const parsed = schema.safeParse(gelezen.ok ? gelezen.waarde : null);
    if (!parsed.success) throw AppError.validation("Controleer je gegevens.");
    const d = parsed.data;

    if (d.actie === "inloggen") {
      await enforceRateLimit({ name: "smileyapp-inloggen", identifier: ip, limit: 10, windowSeconds: 600, message: "Te veel inlogpogingen. Wacht tien minuten en probeer het opnieuw." });
      return NextResponse.json({ account: await inloggen(d.email, d.wachtwoord) });
    }
    if (d.actie === "aannemen") {
      await enforceRateLimit({ name: "smileyapp-aannemen", identifier: ip, limit: 10, windowSeconds: 600, message: "Te veel pogingen. Wacht tien minuten en probeer het opnieuw." });
      return NextResponse.json({ account: await neemUitnodigingAan({ token: d.token, wachtwoord: d.wachtwoord }) });
    }
    await uitloggen();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
