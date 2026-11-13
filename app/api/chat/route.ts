import { withUsage } from "@/lib/ops/usage";
import { z } from "zod";
import { AFGEBROKEN_ZIN, chatStream, ensureAiNode, fastModel, isStroomAfgebroken, llmConfigProblem } from "@/lib/ai/client";
import { fallbackAnswer, kortGenoegVoorVastAntwoord, smallTalk, topicAnswer, withSuggestions } from "@/lib/chat/public-intents";
import { appendMessage, isConversationId } from "@/lib/chat/webchat";
import { fixedWindow } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http/request";
import { logger } from "@/lib/logger";
import { logExchange } from "@/lib/learn/store";
import { vastBegin } from "@/lib/chat/publiek-begin";
import { gratisAan, primeGratis } from "@/lib/ai/gratis";
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
        } else if (isStroomAfgebroken(err)) {
          // het begin staat al op het scherm: zeg dat het niet af is (niet in het bewaarde antwoord)
          controller.enqueue(enc.encode(AFGEBROKEN_ZIN));
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
  // No model connected, or a short known question (also mid-conversation):
  // answer ourselves — curated facts, instantly, without waiting on the model.
  // A long question of its own goes to the model, with the topic as a hint.
  await ensureAiNode();
  if (llmConfigProblem() || (topic && kortGenoegVoorVastAntwoord(question))) {
    return textStream(ownAnswer, question, undefined, saveReply);
  }
  const smartFallback = ownAnswer;

  const shortConversation = parsed.messages.length <= 4;
  try {
    // vast begin (instructie + voorbeelden) altijd vooraan en letterlijk gelijk: het eigen model
    // hergebruikt het dan (lib/chat/publiek-systeem.ts). Op het eigen model (geen videokaart,
    // ±55 tokens/s inlezen) gaat er minder kennisbank mee: 3 kortere stukken in plaats van 4.
    await primeGratis();
    const begin = await vastBegin();
    const hits = gratisAan() ? knowledgeHits.slice(0, 3).map((h) => ({ ...h, excerpt: h.excerpt.slice(0, 450) })) : knowledgeHits;
    const knowledgeMsgs = hits.length
      ? [
          {
            role: "system" as const,
            content:
              "Relevante info uit de ZekerFlex-kennisbank voor deze vraag (gebruik dit, verzin niets extra's):\n" +
              hits.map((h) => `[${h.source}] ${h.title}\n${h.excerpt}`).join("\n\n"),
          },
        ]
      : [];
    const topicMsgs = topic
      ? [
          {
            role: "system" as const,
            content: `Een standaardantwoord dat misschien past. Gebruik het alleen als het de vraag echt beantwoordt, en let op of de vrager een bedrijf of een werker is:\n${topic.reply}`,
          },
        ]
      : [];
    const gen = chatStream({
      purpose: "public-chat",
      ...(shortConversation ? { model: fastModel() } : {}),
      temperature: 0.3,
      maxTokens: 260,
      messages: [...begin, ...knowledgeMsgs, ...topicMsgs, ...parsed.messages],
    });
    return textStream(gen, question, smartFallback, saveReply);
  } catch (err) {
    logger.warn("public chat stream failed", { error: (err as Error).message });
    return textStream(smartFallback, question, undefined, saveReply);
  }
}

export const POST = withUsage("website-chat", handlePOST);
