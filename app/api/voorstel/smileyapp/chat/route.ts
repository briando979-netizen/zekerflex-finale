import { enforceRateLimit } from "@/lib/rate-limit";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { NextResponse } from "next/server";
import { z } from "zod";
import { lijst } from "@/lib/http/zod-lijst";
import { AppError } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { withUsage } from "@/lib/ops/usage";
import { chatAntwoord } from "@/lib/sitechat/antwoord";
import { haalGesprek, voegBerichtToe, zetStatus } from "@/lib/sitechat/gesprek";
import { zelfdeHerkomst } from "@/lib/voorstel/herkomst";
import { CONTACT } from "@/lib/voorstel/smileyapp";
import { heeftTeam } from "@/lib/voorstel/smileyapp-accounts";
import { SMILEYAPP_KANAAL, smileyappKennis } from "@/lib/voorstel/smileyapp-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chat op het SmileyApp-voorstel (openbaar onder /api/voorstel/smileyapp).
// POST {id, berichten}      → antwoord van de AI-assistent (tekststroom), alleen met
//                             de teksten van smileyapp.nl (lib/voorstel/smileyapp-chat.ts)
// POST {id, actie: "mens"}  → de bezoeker vraagt om een medewerker
// Een medewerker bestaat pas als iemand van SmileyApp in het beheer kan inloggen
// (heeftTeam, 19 nov 2026). Tot dan belooft de chat niets: de assistent verwijst
// naar info@smileyapp.nl en de actie "mens" wordt geweigerd.

const ID = z.string().regex(/^[A-Za-z0-9_-]{16,48}$/);
const schema = z.union([
  z.object({
    id: ID,
    pagina: z.string().max(200).optional(),
    berichten: lijst(z.object({ rol: z.enum(["gast", "ai"]), tekst: z.string().trim().min(1).max(1500) }), { min: 1, max: 12 }),
  }),
  z.object({ id: ID, actie: z.literal("mens"), pagina: z.string().max(200).optional() }),
]);

async function handlePOST(request: Request): Promise<Response> {
  try {
    // alleen JSON en alleen vanaf de eigen site (achter Caddy: Origin tegen Host/X-Forwarded-Host)
    if (!(request.headers.get("content-type") ?? "").includes("application/json")) throw AppError.validation("Verwacht JSON.");
    if (!zelfdeHerkomst(request.headers, request.url)) throw AppError.forbidden("Verzoek van een andere website.");
    // vóór het lezen: een ruime limiet per IP, en een begrensde body
    await enforceRateLimit({ name: "smileyapp-chat-ip", identifier: clientIp(request), limit: 120, windowSeconds: 600 });
    const gelezen = await jsonBegrensd(request, 16_000);
    const parsed = schema.safeParse(gelezen.ok ? gelezen.waarde : null);
    if (!parsed.success) throw AppError.validation("Ongeldig chatbericht.");
    const d = parsed.data;
    const medewerker = await heeftTeam();

    if ("berichten" in d) {
      return await chatAntwoord({ kanaal: SMILEYAPP_KANAAL, id: d.id, berichten: d.berichten, pagina: d.pagina, ip: clientIp(request) }, async () => smileyappKennis({ medewerker }));
    }
    // actie "mens": alleen als er echt iemand kan meelezen
    if (!medewerker) throw AppError.validation(`Er leest nu geen medewerker mee. Mail je vraag naar ${CONTACT.email}.`);
    const g = await haalGesprek(SMILEYAPP_KANAAL, d.id);
    if (g?.status === "mens") return NextResponse.json({ ok: true, status: g.status });
    await voegBerichtToe(
      SMILEYAPP_KANAAL,
      d.id,
      { rol: "systeem", tekst: `Je hebt om een medewerker gevraagd. Zodra iemand van ${CONTACT.naam} meeleest, antwoordt die hier. Haast? Mail naar ${CONTACT.email}.` },
      { pagina: d.pagina },
    );
    await zetStatus(SMILEYAPP_KANAAL, d.id, "wacht");
    return NextResponse.json({ ok: true, status: "wacht" });
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = withUsage("website-chat-smileyapp", handlePOST);
