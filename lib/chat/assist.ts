import { chat, llmConfigProblem } from "@/lib/ai/client";

// ---------------------------------------------------------------------------
// ✨ AI help in the in-app chat (workers, employers, admin):
//   - suggest: short replies that fit the last incoming message — rule-based
//     without a model, written by the model when connected;
//   - rewrite: friendlier / shorter / more formal, or translate — needs the
//     model (says so plainly when it isn't connected).
// The user always sees and edits the text before sending; nothing is sent
// on their behalf.
// ---------------------------------------------------------------------------

export type RewriteStyle = "vriendelijk" | "kort" | "zakelijk" | "en" | "pl" | "de" | "ro" | "ar";

const STYLE_PROMPT: Record<RewriteStyle, string> = {
  vriendelijk: "Herschrijf vriendelijker en warmer, zelfde betekenis, Nederlands.",
  kort: "Herschrijf korter en duidelijker, zelfde betekenis, Nederlands.",
  zakelijk: "Herschrijf zakelijk en professioneel, zelfde betekenis, Nederlands.",
  en: "Vertaal naar natuurlijk Engels.",
  pl: "Vertaal naar natuurlijk Pools.",
  de: "Vertaal naar natuurlijk Duits.",
  ro: "Vertaal naar natuurlijk Roemeens.",
  ar: "Vertaal naar natuurlijk Arabisch.",
};

const RULES: { re: RegExp; replies: string[] }[] = [
  { re: /hoe laat|welke tijd|wanneer (begin|start|ben je)|aankomst/i, replies: ["Ik ben er om de afgesproken tijd.", "Ik kom 10 minuten eerder om me te melden.", "Kun je de begintijd nog even bevestigen?"] },
  { re: /adres|waar (moet|is)|locatie|parkeren|ingang/i, replies: ["Kun je het adres en de ingang nog even sturen?", "Is er parkeergelegenheid in de buurt?", "Top, ik weet waar het is!"] },
  { re: /kleding|dresscode|schoenen|meenemen|pbm|hesje|wat moet ik aan|aantrekken/i, replies: ["Wat moet ik aan of meenemen?", "Ik neem mijn veiligheidsschoenen mee.", "Is er werkkleding aanwezig?"] },
  { re: /ziek|kan niet|lukt niet|afzeggen|verhinderd/i, replies: ["Jammer, beterschap! Ik zoek een vervanger.", "Dank voor het laten weten. Kun je een vervanger aanvragen in de app?", "Geen probleem, bedankt voor je bericht."] },
  { re: /te laat|vertraging|file|trein/i, replies: ["Geen probleem, rijd voorzichtig!", "Dank voor het laten weten. Hoe laat verwacht je er te zijn?", "Ik ben iets later, sorry — ongeveer 15 minuten."] },
  { re: /uren|goedkeur|declar|uitbetal|betaling/i, replies: ["Ik heb mijn uren ingediend.", "Kun je mijn uren goedkeuren?", "Je uren zijn goedgekeurd, bedankt!"] },
  { re: /bedankt|dank je|top gedaan|goed gewerkt/i, replies: ["Graag gedaan! Tot de volgende keer.", "Dank je wel, het was fijn werken!", "Bedankt! Ik kom graag nog eens."] },
  { re: /\?$/, replies: ["Ja, dat is goed.", "Nee, helaas niet.", "Ik laat het zo snel mogelijk weten."] },
];
const GENERIC = ["Top, dank je!", "Is goed, tot dan.", "Ik laat het je zo weten."];

export function ruleSuggestions(lastIncoming: string): string[] {
  const hit = RULES.find((r) => r.re.test(lastIncoming.trim()));
  return hit ? hit.replies : GENERIC;
}

export async function suggestReplies(lastIncoming: string, role: string): Promise<{ suggestions: string[]; mode: "model" | "rules" }> {
  if (!lastIncoming.trim() || llmConfigProblem()) return { suggestions: ruleSuggestions(lastIncoming), mode: "rules" };
  try {
    const res = await chat({
      purpose: "chat-assist",
      temperature: 0.5,
      maxTokens: 160,
      retry: false,
      timeoutMs: 15_000,
      messages: [
        { role: "system", content: `Je helpt een ${role} op ZekerFlex (flexwerk-platform) antwoorden in een chat. Geef precies 3 korte, vriendelijke antwoordopties in het Nederlands (max 15 woorden elk), elk op een eigen regel, zonder nummering.` },
        { role: "user", content: `Laatste bericht: "${lastIncoming.slice(0, 600)}"` },
      ],
    });
    const lines = res.text.split("\n").map((l) => l.replace(/^[-*\d.)\s"]+|"$/g, "").trim()).filter(Boolean).slice(0, 3);
    return lines.length ? { suggestions: lines, mode: "model" } : { suggestions: ruleSuggestions(lastIncoming), mode: "rules" };
  } catch {
    return { suggestions: ruleSuggestions(lastIncoming), mode: "rules" };
  }
}

export async function rewrite(text: string, style: RewriteStyle): Promise<{ text: string } | { error: string }> {
  const problem = llmConfigProblem();
  if (problem) return { error: "Herschrijven en vertalen werken zodra het taalmodel gekoppeld is." };
  try {
    const res = await chat({
      purpose: "chat-assist",
      temperature: 0.3,
      maxTokens: 400,
      retry: false,
      timeoutMs: 20_000,
      messages: [
        { role: "system", content: `${STYLE_PROMPT[style]} Geef alleen de nieuwe tekst terug, zonder uitleg of aanhalingstekens.` },
        { role: "user", content: text.slice(0, 2000) },
      ],
    });
    const out = res.text.trim().replace(/^"|"$/g, "");
    return out ? { text: out } : { error: "Geen resultaat ontvangen." };
  } catch (err) {
    return { error: (err as Error).message };
  }
}
