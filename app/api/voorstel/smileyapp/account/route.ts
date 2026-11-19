import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { HERSTEL_ANTWOORD, normEmail } from "@/lib/voorstel/smileyapp-account-regels";
import { inloggen, kiesNieuwWachtwoord, neemUitnodigingAan, uitloggen, vraagHerstel } from "@/lib/voorstel/smileyapp-accounts";
import { beheerVan, smileyPoort } from "@/lib/voorstel/smileyapp-poort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Inloggen in het SmileyApp-beheer (eigen sessie-cookie smiley_sessie, los van
// de ZekerFlex-login; openbaar in lib/auth/public-routes.ts).
// POST {actie: "inloggen", email, wachtwoord}
// POST {actie: "aannemen", token, wachtwoord}  → wachtwoord kiezen met de link uit de uitnodiging
// POST {actie: "uitloggen"}
// POST {actie: "vergeten", email}              → mail met een link (1 uur, één keer); het antwoord is ALTIJD hetzelfde
// POST {actie: "nieuw-wachtwoord", token, wachtwoord} → nieuw wachtwoord met die link; oude sessies vervallen
// Er is geen registratie: je komt alleen binnen met een uitnodiging. De kaart
// "Kies een wachtwoord" leest de uitnodiging op de server (beheer/page.tsx).

const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("inloggen"), email: z.string().trim().max(200), wachtwoord: z.string().min(1).max(200) }),
  z.object({ actie: z.literal("aannemen"), token: z.string().max(100), wachtwoord: z.string().max(400) }),
  z.object({ actie: z.literal("uitloggen") }),
  z.object({ actie: z.literal("vergeten"), email: z.string().trim().max(200) }),
  z.object({ actie: z.literal("nieuw-wachtwoord"), token: z.string().max(100), wachtwoord: z.string().max(400) }),
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
    if (d.actie === "vergeten") {
      await enforceRateLimit({ name: "smileyapp-vergeten", identifier: ip, limit: 5, windowSeconds: 3600, message: "Je hebt dit al een paar keer aangevraagd. Probeer het over een uur opnieuw." });
      // per adres hooguit 3 per uur. Is die grens bereikt, dan gaat er geen mail meer uit, maar het antwoord blijft
      // gelijk: anders zou het scherm iets verraden over een adres. Het adres zelf komt niet in de sleutel (alleen een hash).
      const perAdres = await enforceRateLimit({ name: "smileyapp-vergeten-adres", identifier: createHash("sha256").update(normEmail(d.email)).digest("hex"), limit: 3, windowSeconds: 3600 }).then(
        () => true,
        () => false,
      );
      // niet wachten op de mail: een bekend adres antwoordt dan even snel als een onbekend adres
      if (perAdres) void vraagHerstel(d.email, beheerVan(request)).catch(() => undefined);
      return NextResponse.json({ ok: true, melding: HERSTEL_ANTWOORD });
    }
    if (d.actie === "nieuw-wachtwoord") {
      await enforceRateLimit({ name: "smileyapp-aannemen", identifier: ip, limit: 10, windowSeconds: 600, message: "Te veel pogingen. Wacht tien minuten en probeer het opnieuw." });
      return NextResponse.json({ account: await kiesNieuwWachtwoord({ token: d.token, wachtwoord: d.wachtwoord }) });
    }
    await uitloggen();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
