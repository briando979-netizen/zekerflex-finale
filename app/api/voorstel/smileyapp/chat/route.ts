import { enforceRateLimit } from "@/lib/rate-limit";
import { jsonBegrensd } from "@/lib/http/body-grens";
import { z } from "zod";
import { lijst } from "@/lib/http/zod-lijst";
import { AppError } from "@/lib/errors";
import { clientIp } from "@/lib/http/request";
import { jsonError } from "@/lib/http/errors";
import { withUsage } from "@/lib/ops/usage";
import { chatAntwoord } from "@/lib/sitechat/antwoord";
import { zelfdeHerkomst } from "@/lib/voorstel/herkomst";
import { SMILEYAPP_KANAAL, smileyappKennis } from "@/lib/voorstel/smileyapp-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Chat op het SmileyApp-voorstel (openbaar onder /api/voorstel/smileyapp).
// POST {id, berichten} → antwoord van de AI-assistent (tekststroom), alleen met
// de teksten van smileyapp.nl (lib/voorstel/smileyapp-chat.ts). Er leest geen
// team mee, dus geen actie "mens": de assistent verwijst naar info@smileyapp.nl.

const ID = z.string().regex(/^[A-Za-z0-9_-]{16,48}$/);
const schema = z.object({
  id: ID,
  pagina: z.string().max(200).optional(),
  berichten: lijst(z.object({ rol: z.enum(["gast", "ai"]), tekst: z.string().trim().min(1).max(1500) }), { min: 1, max: 12 }),
});

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
    return await chatAntwoord({ kanaal: SMILEYAPP_KANAAL, id: d.id, berichten: d.berichten, pagina: d.pagina, ip: clientIp(request) }, async () => smileyappKennis());
  } catch (err) {
    return jsonError(err);
  }
}

export const POST = withUsage("website-chat-smileyapp", handlePOST);
