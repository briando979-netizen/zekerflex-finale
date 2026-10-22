import type { Principal } from "@/lib/auth";
import { chat, chatJson, fastModel, llmConfigProblem } from "@/lib/ai/client";
import { inspectPrompt } from "@/lib/security/prompt-guard";
import { logExchange } from "@/lib/learn/store";
import { logger } from "@/lib/logger";
import { contextBlock, recall, type RecallHit } from "@/lib/rag/recall";
import type { Audience } from "@/lib/rag/corpus";
import { roleOf, runTools, toolsFor, type ToolResult } from "@/lib/brain/tools";
import { routeQuestion } from "@/lib/brain/router";
import { loadMemory, remember } from "@/lib/brain/memory";

// ---------------------------------------------------------------------------
// ZekerFlex brain — one assistant for workers, employers and admin.
//
//   question ─┬─ prompt guard
//             ├─ who is asking (role → which tools + which knowledge)
//             ├─ router: rules first, the model only when rules find nothing
//             ├─ tools: read-only views of the user's OWN data
//             ├─ RAG brain: hybrid recall over the knowledge corpus
//             ├─ memory: the last turns of this user's conversation
//             └─ answer: the model composes from the above; without a model
//                the tool summaries + best knowledge passage ARE the answer.
//
// The brain only reads and explains. It never changes data, sends anything or
// acts for the user — it points to the screen where they can do it.
// ---------------------------------------------------------------------------

export interface BrainSource {
  title: string;
  source: string;
  href?: string;
}

export interface BrainAnswer {
  answer: string;
  mode: "model" | "rules";
  tools: string[];
  sources: BrainSource[];
  links: { label: string; href: string }[];
  suggestions: string[];
}

const ROLE_LABEL: Record<Audience, string> = {
  public: "bezoeker",
  werknemer: "werknemer (flexwerker/zzp'er of uitzendkracht)",
  opdrachtgever: "opdrachtgever (bedrijf dat klussen uitzet)",
  admin: "beheerder van het ZekerFlex-platform",
};

export const STARTERS: Record<Audience, string[]> = {
  public: ["Wat kost ZekerFlex?", "Heb ik een KVK nodig?"],
  werknemer: ["Wanneer is mijn volgende klus?", "Welke klussen passen bij mij?", "Heb ik nog uren in te vullen?", "Wanneer krijg ik betaald?"],
  opdrachtgever: ["Welke klussen zijn nog niet bezet?", "Welke uren moet ik goedkeuren?", "Hoe zet ik een klus uit?", "Wat kost het per uur?"],
  admin: ["Platformcijfers", "Hoe werkt de AI-governor?", "Hoe werkt de matching?"],
};

const LINK_LABEL: Record<string, string> = {
  mijn_planning: "Mijn klussen",
  mijn_reacties: "Mijn klussen",
  mijn_uren: "Uren",
  mijn_geld: "Uitbetalingen",
  mijn_account_status: "Account",
  klussen_voor_mij: "Klussen bekijken",
  bedrijf_overzicht: "Overzicht",
  onbezette_klussen: "Diensten",
  uren_goedkeuren: "Uren goedkeuren",
  facturen: "Facturen",
  platform_cijfers: "Admin",
};

function systemPrompt(p: Principal, role: Audience): string {
  const today = new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" });
  return [
    `Je bent de ZekerFlex-assistent, het brein van ZekerFlex (Nederlands platform voor flexwerk). Vandaag is het ${today}.`,
    `Je praat met ${p.fullName.split(" ")[0] || "een gebruiker"}, ${ROLE_LABEL[role]}.`,
    "Regels:",
    "- Gebruik ALLEEN de feiten uit 'JOUW GEGEVENS' en 'KENNIS' hieronder. Verzin geen bedragen, data, regels of functies.",
    "- Staat het antwoord er niet in, zeg dat eerlijk en verwijs naar Support (Chat → Tools → Support).",
    "- Je kunt alleen uitleggen en informatie geven. Je voert NIETS uit (niet aanmelden, niet goedkeuren, niets versturen); wijs de gebruiker het scherm waar het kan.",
    "- Noem bij kennis de bron als [nummer].",
    "- Antwoord kort (max 6 zinnen of een korte lijst), vriendelijk en concreet, in de taal waarin de gebruiker schrijft.",
    role === "werknemer" ? "- Geef geen fiscaal of juridisch advies voor iemands persoonlijke situatie; verwijs dan naar een adviseur." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function modelRoute(question: string, role: Audience): Promise<string[]> {
  const tools = toolsFor(role);
  if (!tools.length) return [];
  try {
    const out = await chatJson<{ tools?: string[] }>({
      purpose: "brain-route",
      model: fastModel(),
      temperature: 0,
      maxTokens: 60,
      retry: false,
      timeoutMs: 8_000,
      messages: [
        {
          role: "system",
          content: `Kies welke gegevens nodig zijn om de vraag te beantwoorden. Opties:\n${tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}\nAntwoord als JSON {"tools": [...]} met 0 tot 2 namen. Een algemene "hoe werkt…"-vraag heeft geen gegevens nodig.`,
        },
        { role: "user", content: question.slice(0, 500) },
      ],
    });
    const allowed = new Set(tools.map((t) => t.name));
    return (out.tools ?? []).filter((n) => allowed.has(n)).slice(0, 2);
  } catch {
    return [];
  }
}

function linksFrom(results: { name: string; result: ToolResult }[], hits: RecallHit[]): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  for (const r of results) if (r.result.href) out.push({ label: LINK_LABEL[r.name] ?? "Openen", href: r.result.href });
  for (const h of hits.slice(0, 2)) if (h.href && h.href.startsWith("/") && !out.some((l) => l.href === h.href)) out.push({ label: h.title.length > 40 ? `${h.title.slice(0, 38)}…` : h.title, href: h.href });
  return out.slice(0, 3);
}

/** The model-free answer: tool summaries, else the best knowledge passage, else an honest pointer. */
export function ruleAnswer(results: { name: string; result: ToolResult }[], hits: RecallHit[], confident: boolean): string {
  if (results.length) return results.map((r) => r.result.text).join("\n\n");
  if (hits[0] && confident) return hits[0].text;
  if (hits.length) return `Ik weet niet zeker wat je bedoelt. Gaat het hierover?\n${hits.slice(0, 3).map((h) => `• ${h.title}`).join("\n")}`;
  return "Daar heb ik nog geen antwoord op. Stel je vraag anders, of vraag het een collega via Chat → Tools → Support.";
}

export async function think(p: Principal, question: string): Promise<BrainAnswer> {
  const role = roleOf(p);
  const q = question.trim().slice(0, 1500);
  const guard = inspectPrompt(q);
  if (!guard.allowed) {
    return { answer: "Daar kan ik je niet mee helpen. Stel gerust een vraag over je klussen, uren, uitbetalingen of hoe ZekerFlex werkt.", mode: "rules", tools: [], sources: [], links: [], suggestions: STARTERS[role].slice(0, 3) };
  }

  const modelOn = !llmConfigProblem();
  const memory = await loadMemory(p.userId);
  // follow-ups ("en morgen?") are routed with the previous question as context
  const lastQ = [...memory].reverse().find((t) => t.role === "user")?.content ?? "";
  const routingText = q.length < 25 && lastQ ? `${lastQ} ${q}` : q;

  let toolNames = routeQuestion(routingText, role);
  if (!toolNames.length && modelOn && /\b(mijn|ik|me|mij|ons|onze|my|i)\b/i.test(q)) toolNames = await modelRoute(q, role);

  const [results, rec] = await Promise.all([runTools(p, toolNames), recall(routingText, { role, k: 5 })]);
  const knowledge = results.length ? rec.hits.slice(0, 2) : rec.hits;

  let answer = ruleAnswer(results, knowledge, rec.confident);
  let mode: BrainAnswer["mode"] = "rules";
  if (modelOn) {
    try {
      const data = results.map((r) => `### ${r.name}\n${r.result.text}`).join("\n\n");
      const res = await chat({
        purpose: "brain",
        temperature: 0.2,
        maxTokens: 450,
        retry: false,
        timeoutMs: 30_000,
        messages: [
          { role: "system", content: systemPrompt(p, role) },
          { role: "system", content: `JOUW GEGEVENS (live, alleen van deze gebruiker):\n${data || "(niet nodig voor deze vraag)"}\n\nKENNIS:\n${contextBlock(knowledge) || "(niets gevonden)"}` },
          ...memory.slice(-8).map((t) => ({ role: t.role, content: t.content })),
          { role: "user", content: q },
        ],
      });
      const text = res.text.trim();
      if (text) {
        answer = text;
        mode = "model";
      }
    } catch (err) {
      logger.warn("brain model answer failed — rules answer", { error: (err as Error).message });
    }
  }

  await Promise.all([remember(p.userId, q, answer), logExchange("brain", { q, a: answer, userId: p.userId }).catch(() => undefined)]);

  return {
    answer,
    mode,
    tools: results.map((r) => r.name),
    sources: knowledge.slice(0, 3).map((h) => ({ title: h.title, source: h.source, ...(h.href ? { href: h.href } : {}) })),
    links: linksFrom(results, knowledge),
    suggestions: STARTERS[role].filter((s) => s.toLowerCase() !== q.toLowerCase()).slice(0, 3),
  };
}
