import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError } from "@/lib/errors";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { jsonError } from "@/lib/http/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ROLLEN } from "@/lib/voorstel/smileyapp-account-regels";
import { alleAccounts, blokkeer, eisBeheerder, eisToegang, nodigUit, verwijderAccount, vraagHerstel, wijzigRol } from "@/lib/voorstel/smileyapp-accounts";
import { beheerVan, smileyPoort } from "@/lib/voorstel/smileyapp-poort";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Het team van het SmileyApp-beheer.
// GET           → de accounts (iedereen van het team mag de lijst zien)
// POST {actie}  → uitnodigen (ook opnieuw) | rol | blokkeren | verwijderen | herstel (link voor een nieuw wachtwoord)
// Wijzigen mag alleen een beheerder: een medewerker krijgt 423 met de code
// ALLEEN_BEHEERDER (geen 403: CrowdSec). De regels (jezelf niet, de laatste
// beheerder blijft) staan in lib/voorstel/smileyapp-account-regels.ts.

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await smileyPoort(request);
    const ik = await eisToegang();
    return NextResponse.json({ ik: { email: ik.email, rol: ik.rol }, accounts: await alleAccounts() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return jsonError(err);
  }
}

const EMAIL = z.string().trim().max(200);
const schema = z.discriminatedUnion("actie", [
  z.object({ actie: z.literal("uitnodigen"), naam: z.string().trim().max(200), email: EMAIL, rol: z.enum(ROLLEN) }),
  z.object({ actie: z.literal("rol"), email: EMAIL, rol: z.enum(ROLLEN) }),
  z.object({ actie: z.literal("blokkeren"), email: EMAIL, geblokkeerd: z.boolean() }),
  z.object({ actie: z.literal("verwijderen"), email: EMAIL }),
  z.object({ actie: z.literal("herstel"), email: EMAIL }),
]);

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await smileyPoort(request, { json: true });
    const ik = await eisBeheerder();
    const gelezen = await jsonBegrensd(request, 4_000);
    const parsed = schema.safeParse(gelezen.ok ? gelezen.waarde : null);
    if (!parsed.success) throw AppError.validation("Controleer je gegevens.");
    const d = parsed.data;

    if (d.actie === "uitnodigen") {
      await enforceRateLimit({ name: "smileyapp-uitnodigen", identifier: ik.id, limit: 20, windowSeconds: 3600, message: "Je hebt dit uur al veel uitnodigingen verstuurd. Probeer het later opnieuw." });
      return NextResponse.json(await nodigUit({ naam: d.naam, email: d.email, rol: d.rol, door: ik.naam, beheer: beheerVan(request) }));
    }
    if (d.actie === "herstel") {
      // dezelfde emmer als uitnodigen: beide sturen een mail met een link
      await enforceRateLimit({ name: "smileyapp-uitnodigen", identifier: ik.id, limit: 20, windowSeconds: 3600, message: "Je hebt dit uur al veel mails verstuurd. Probeer het later opnieuw." });
      const uitslag = await vraagHerstel(d.email, beheerVan(request));
      if (uitslag === "geen") throw AppError.validation("Een link sturen kan alleen bij een actief account.");
      return NextResponse.json({ verstuurd: uitslag === "verstuurd" });
    }
    if (d.actie === "rol") return NextResponse.json({ account: await wijzigRol(ik, d.email, d.rol) });
    if (d.actie === "blokkeren") return NextResponse.json({ account: await blokkeer(ik, d.email, d.geblokkeerd) });
    await verwijderAccount(ik, d.email);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
