import { z } from "zod";
import { chatStream, fastModel } from "@/lib/ai/client";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { logExchange, topExamples } from "@/lib/learn/store";
import { searchKnowledge } from "@/lib/jarvis/public-knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(1500),
      }),
    )
    .min(1)
    .max(10),
});

const SYSTEM = `Je bent de publieke assistent op de website van ZekerFlex, een Nederlands
platform voor flexibel werk. Je helpt werknemers en werkgevers met vragen over het platform.

Feiten die je mag gebruiken:
- ZekerFlex matcht werknemers aan losse diensten (shifts) op basis van reistijd, betrouwbaarheid en vakmatch.
- Freelancers worden niet automatisch meteen uitbetaald: na goedkeuring van de uren kiezen ze zelf per dienst — direct bij goedkeuring (4% van de factuur), binnen 3 werkdagen (2%) of gratis wachten tot de opdrachtgever afrekent (binnen 30 dagen). Uitbetalen gaat via directe SEPA-overboeking. Een voorschot van max. 80% op openstaande diensten kan tegen 3%.
- Elke opdracht loopt via een goedgekeurde modelovereenkomst; ZekerFlex bewaakt de Wet DBA automatisch.
- Werkgevers betalen alleen bij gebruik: € 3,50 platformkosten per gewerkt uur. Geen abonnement, geen opstartkosten.
- Aanmelden vereist KVK-inschrijving (zzp) en identiteitsverificatie (KYC).
- Facturatie verloopt via reverse billing: ZekerFlex maakt de facturen automatisch aan.
- Het platform draait volledig in Nederland, zonder tussenpartijen.

Regels: antwoord kort (max 4 zinnen), in het Nederlands, vriendelijk en concreet.
Verzin geen prijzen of functies die hierboven niet staan. Weet je iets niet, verwijs naar
info@zekerflex.com of de pagina Voor bedrijven / Voor freelancers.`;

const CANNED: { match: RegExp; reply: string }[] = [
  { match: /uitbetaal|betaald|payout|geld|wanneer.*betaal/i, reply: "Je wordt niet automatisch meteen betaald — je kiest zelf per dienst nadat je uren zijn goedgekeurd: direct bij goedkeuring (4% van de factuur), binnen 3 werkdagen (2%) of gratis wachten tot de opdrachtgever afrekent (binnen 30 dagen). Uitbetalen gaat via SEPA en de factuur maakt ZekerFlex automatisch aan." },
  { match: /prijs|prijzen|kost|tarief|fee|commissie|abonnement/i, reply: "Voor bedrijven rekent ZekerFlex € 3,50 platformkosten per gewerkt uur, en je betaalt alleen als er daadwerkelijk iemand werkt. Geen abonnement of opstartkosten. Voor freelancers is meedoen gratis." },
  { match: /\bdba\b|schijnzelfstand|modelovereenkomst|wet dba/i, reply: "Elke opdracht loopt via een goedgekeurde modelovereenkomst. ZekerFlex bewaakt automatisch de Wet DBA-signalen — urenconcentratie bij één opdrachtgever, opeenvolgende weken en omzetafhankelijkheid — en grijpt in voordat een samenwerking risicovol wordt." },
  { match: /aanmeld|registr|account|begin|starten|inschrijv/i, reply: "Aanmelden kan via 'Aan de slag'. Als zzp'er heb je een KVK-inschrijving nodig en doorloop je een korte identiteitsverificatie. Bedrijven registreren hun organisatie en kunnen daarna direct diensten uitzetten." },
  { match: /match|hoe werkt|vind.*klus|shift|klus/i, reply: "Je geeft je vak, beschikbaarheid en thuisbasis op. Bij een nieuwe dienst rangschikt ZekerFlex kandidaten op reistijd, betrouwbaarheid en vakmatch. Wie de drempel van de vestiging haalt wordt direct toegewezen, de rest krijgt het aanbod in golven." },
  { match: /veilig|privacy|data|gegevens|avg|gdpr/i, reply: "Het platform draait volledig in Nederland zonder externe tussenpartijen. Gevoelige gegevens worden versleuteld opgeslagen, analytics werkt zonder cookies en elke handeling wordt vastgelegd in een auditspoor." },
  { match: /contact|bereik|mail|telefoon|hulp/i, reply: "Je kunt ons bereiken via support@zekerflex.com (algemene vragen: info@zekerflex.com). Op de pagina's Voor freelancers en Voor bedrijven vind je ook de meeste antwoorden." },
];

function pickCanned(text: string): string | null {
  return CANNED.find((c) => c.match.test(text))?.reply ?? null;
}

function textStream(
  chunks: AsyncIterable<string> | string,
  question?: string,
  fallback?: string,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder();
      let full = "";
      try {
        if (typeof chunks === "string") {
          full = chunks;
          controller.enqueue(enc.encode(chunks));
        } else {
          for await (const c of chunks) {
            full += c;
            controller.enqueue(enc.encode(c));
          }
        }
      } catch (err) {
        // Never leak a raw connection/model error to a visitor — fall back to
        // a real, sourced answer (or a friendly pointer) instead.
        logger.warn("chat generation failed mid-stream", { error: (err as Error).message });
        if (!full.trim()) {
          full = fallback ?? "Daar kan ik je nu niet direct mee helpen. Mail info@zekerflex.com.";
          controller.enqueue(enc.encode(full));
        }
      } finally {
        controller.close();
        if (question && full.trim()) {
          void logExchange("public", { q: question, a: full.trim() }).catch(() => undefined);
        }
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";

  try {
    const key = `chat:rl:${ip}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 60);
    if (n > 15) {
      return textStream("Rustig aan — probeer het over een minuut nog eens.");
    }
  } catch {
    /* best-effort */
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return textStream("Ongeldig verzoek.");
  }

  const lastUser = [...parsed.messages].reverse().find((m) => m.role === "user");
  const question = lastUser?.content ?? "";
  const canned = lastUser ? pickCanned(lastUser.content) : null;
  if (canned && parsed.messages.length <= 2) {
    return textStream(canned, question);
  }

  // Ground the model in the same facts the Kennis pages show — and double as
  // a real, sourced fallback if the local model is unreachable.
  const knowledgeHits = lastUser ? searchKnowledge(lastUser.content, 4) : [];
  const smartFallback =
    canned ??
    (knowledgeHits[0]
      ? knowledgeHits[0].a
      : "Daar kan ik je nu niet direct mee helpen. Kijk op de pagina Voor bedrijven of Voor freelancers, of mail info@zekerflex.com.");

  const shortConversation = parsed.messages.length <= 4;
  try {
    const examples = await topExamples("public", 2).catch(() => []);
    const exampleMsgs = examples.length
      ? [
          {
            role: "system" as const,
            content:
              "Voorbeelden van eerdere goede antwoorden (gebruik dezelfde toon en feiten):\n" +
              examples.map((e) => `V: ${e.q}\nA: ${e.a}`).join("\n\n"),
          },
        ]
      : [];
    const knowledgeMsgs = knowledgeHits.length
      ? [
          {
            role: "system" as const,
            content:
              "Relevante info uit de ZekerFlex-kennisbank voor deze vraag (gebruik dit, verzin niets extra's):\n" +
              knowledgeHits.map((h) => `[${h.source}] V: ${h.q}\nA: ${h.a}`).join("\n\n"),
          },
        ]
      : [];
    const gen = chatStream({
      purpose: "public-chat",
      ...(shortConversation ? { model: fastModel() } : {}),
      temperature: 0.3,
      maxTokens: 260,
      messages: [{ role: "system", content: SYSTEM }, ...knowledgeMsgs, ...exampleMsgs, ...parsed.messages],
    });
    return textStream(gen, question, smartFallback);
  } catch (err) {
    logger.warn("public chat stream failed", { error: (err as Error).message });
    return textStream(smartFallback, question);
  }
}
