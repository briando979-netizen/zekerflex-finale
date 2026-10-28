import { withUsage } from "@/lib/ops/usage";
import { z } from "zod";
import { chatStream, ensureAiNode, fastModel, llmConfigProblem } from "@/lib/ai/client";
import { fallbackAnswer, smallTalk, topicAnswer, withSuggestions } from "@/lib/chat/public-intents";
import { appendMessage, isConversationId } from "@/lib/chat/webchat";
import { fixedWindow } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { logExchange, topExamples } from "@/lib/learn/store";
import { advancedRecall } from "@/lib/rag/advanced";
import { inspectPrompt } from "@/lib/security/prompt-guard";

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
  /** random token from the widget — makes the conversation a ticket admins can follow */
  conversationId: z.string().optional(),
  page: z.string().max(200).optional(),
});

const SYSTEM = `Je bent de publieke assistent op de website van ZekerFlex, een Nederlands
platform voor flexibel werk. Je helpt werknemers en werkgevers met vragen over het platform.

Feiten die je mag gebruiken:
- ZekerFlex matcht werknemers aan losse diensten (shifts) op basis van reistijd, betrouwbaarheid en vakmatch.
- Freelancers worden niet automatisch meteen uitbetaald: na goedkeuring van de uren kiezen ze zelf per dienst — direct bij goedkeuring (4% van de factuur), binnen 3 werkdagen (2%) of gratis wachten tot de opdrachtgever afrekent (binnen 30 dagen). Uitbetalen gaat via directe SEPA-overboeking. Een voorschot van max. 80% op openstaande diensten kan tegen 3%.
- ZekerFlex legt afspraken per relatie vast en signaleert onder meer urenconcentratie en opeenvolgende weken. Deze hulpmiddelen geven geen garantie over de arbeidsrelatie; de feitelijke werkwijze blijft bepalend.
- Werkgevers betalen alleen bij gebruik: € 3,50 platformkosten per gewerkt uur. Geen abonnement, geen opstartkosten.
- Aanmelden vereist KVK-inschrijving (zzp) en identiteitsverificatie (KYC).
- Facturatie verloopt via reverse billing: ZekerFlex maakt de facturen automatisch aan.
- ZekerFlex gebruikt gespecialiseerde dienstverleners voor onderdelen zoals hosting, betalingen, e-mail en identiteitscontroles. De AI-assistent kan op een eigen modelserver draaien.
- ZekerFlex Bank: eigen rekening in de app; verdiensten direct erop, potjes, sparen met vaste rente, overmaken, betaalverzoeken, gratis virtuele betaalpas. Eerste 30 dagen gratis.
- Zonder KVK werk je als uitzendkracht via ZekerFlex (loonstrook, voorschot binnen 1 minuut na goedkeuring).
- Op de dag van de klus check je in en uit op locatie; uren vul je in stappen in.

Regels: antwoord kort (max 4 zinnen), in het Nederlands, vriendelijk en concreet.
Verzin geen prijzen of functies die hierboven niet staan. Weet je iets niet, verwijs naar
info@zekerflex.com of de pagina Voor bedrijven / Voor freelancers.`;

function textStream(
  chunks: AsyncIterable<string> | string,
  question?: string,
  fallback?: string,
  onDone?: (full: string) => Promise<unknown>,
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
        if (onDone && full.trim()) await onDone(full.trim()).catch(() => undefined);
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

async function handlePOST(request: Request): Promise<Response> {
  const ip = clientIp(request);
  const gate = await fixedWindow(`rl:chat:${ip}`, 15, 60);
  if (!gate.ok) {
    return textStream("Rustig aan — probeer het over een minuut nog eens.");
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return textStream("Ongeldig verzoek.");
  }

  const lastUser = [...parsed.messages].reverse().find((m) => m.role === "user");
  const question = lastUser?.content ?? "";

  // Ticket: keep the conversation; once an agent took over, the AI stays quiet.
  const convId = isConversationId(parsed.conversationId) ? parsed.conversationId : null;
  if (convId && question) {
    const conv = await appendMessage(convId, { role: "user", content: question }, parsed.page).catch(() => null);
    if (conv?.status === "human") {
      return new Response("", { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-ZF-Human": "1" } });
    }
  }
  const saveReply = convId ? (full: string) => appendMessage(convId, { role: "assistant", content: full }) : undefined;
  const guard = inspectPrompt(question);
  if (!guard.allowed) {
    logger.warn("prompt injection blocked", { reason: guard.reason, ip });
    return textStream("Daar kan ik niet mee helpen. Stel een vraag over ZekerFlex.");
  }
  // Small talk ("hoi", "bedankt", "wie ben jij") — instant, also mid-conversation.
  const chit = smallTalk(question);
  if (chit) return textStream(withSuggestions(chit), question, undefined, saveReply);

  const topic = topicAnswer(question);
  // RAG brain: public knowledge only (never in-app or internal passages)
  // advanced RAG (synonyms + hybrid/RRF + rerank + compression), no extra model round-trips on the public widget
  const rec = lastUser ? await advancedRecall(lastUser.content, { role: "public", k: 4, useModel: false, history: parsed.messages.slice(0, -1) }) : null;
  const knowledgeHits = rec?.hits ?? [];
  const confident = Boolean(rec?.confident);
  // The assistant's own answer: a known topic, else the best knowledge-base
  // hit, else an honest "ask a colleague" with topics to pick from.
  const ownAnswer = withSuggestions(
    topic ?? (knowledgeHits[0] && confident ? { reply: knowledgeHits[0].text, suggestions: ["Contact met een mens", "Hoe meld ik me aan?"] } : fallbackAnswer()),
  );
  // No model connected, or a known question (also mid-conversation): answer
  // ourselves — curated facts, instantly, without waiting on the model.
  await ensureAiNode();
  if (llmConfigProblem() || topic) {
    return textStream(ownAnswer, question, undefined, saveReply);
  }
  const smartFallback = ownAnswer;

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
              knowledgeHits.map((h) => `[${h.source}] ${h.title}\n${h.excerpt}`).join("\n\n"),
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
    return textStream(gen, question, smartFallback, saveReply);
  } catch (err) {
    logger.warn("public chat stream failed", { error: (err as Error).message });
    return textStream(smartFallback, question, undefined, saveReply);
  }
}

export const POST = withUsage("website-chat", handlePOST);
