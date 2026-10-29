import { chat } from "@/lib/ai/client";

// ---------------------------------------------------------------------------
// AI-outreach: een kort, persoonlijk concept-bericht om een kandidaat voor een
// klus te benaderen. Draait op de EIGEN (self-hoste) LLM — geen kosten per
// intake, in tegenstelling tot externe tools. Mens-in-de-lus: dit levert een
// CONCEPT dat de recruiter aanpast en zelf verstuurt; de AI beslist niets en
// verzint geen feiten. Faalt de LLM (box uit), dan valt het terug op een sjabloon.
// ---------------------------------------------------------------------------

export type OutreachChannel = "whatsapp" | "email" | "chat";

export interface DraftContext {
  candidateName: string;
  vacancyTitle: string;
  city: string;
  dateLabel: string; // bv. "donderdag 30 oktober"
  hourlyRate: string; // bv. "€ 21,50"
  channel: OutreachChannel;
  highlights?: string[]; // redenen waarom ze passen (uit explainMatch)
}

export interface DraftResult {
  message: string;
  aiUsed: boolean;
}

function firstName(full: string): string {
  return (full.trim().split(/\s+/)[0] ?? full).trim() || "daar";
}

export function fallbackDraft(ctx: DraftContext): string {
  const hi = firstName(ctx.candidateName);
  const core = `er is een klus "${ctx.vacancyTitle}" in ${ctx.city} op ${ctx.dateLabel}, ${ctx.hourlyRate} per uur. Lijkt me iets voor jou — heb je interesse?`;
  if (ctx.channel === "email") {
    return `Beste ${hi},\n\n${core.charAt(0).toUpperCase()}${core.slice(1)}\n\nGroet,\nZekerFlex`;
  }
  return `Hoi ${hi}, ${core}`;
}

export async function draftOutreach(ctx: DraftContext): Promise<DraftResult> {
  const channelHint =
    ctx.channel === "whatsapp"
      ? "Kanaal: WhatsApp — informeel, kort, mag een emoji."
      : ctx.channel === "email"
        ? "Kanaal: e-mail — nette aanhef en afsluiting."
        : "Kanaal: kort chatbericht.";
  const system =
    "Je bent een Nederlandse uitzend-recruiter van ZekerFlex. Schrijf één kort, warm, persoonlijk bericht om een kandidaat uit te nodigen voor een klus. Tutoyeer, max ~60 woorden, geen overdreven verkooppraat. Gebruik ALLEEN de gegeven feiten — verzin niets (geen bedrijfsnamen, bedragen of eisen die er niet staan). Sluit af met een korte vraag naar interesse. Geef alleen de berichttekst terug, zonder aanhalingstekens of opmaak.";
  const user = [
    `Kandidaat (voornaam gebruiken): ${ctx.candidateName}`,
    `Klus: ${ctx.vacancyTitle} in ${ctx.city} op ${ctx.dateLabel}, ${ctx.hourlyRate} per uur.`,
    ctx.highlights && ctx.highlights.length ? `Past goed omdat: ${ctx.highlights.join("; ")}.` : "",
    channelHint,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const res = await chat({
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      purpose: "recruiter-draft",
      retry: false,
      temperature: 0.7,
      maxTokens: 240,
    });
    const msg = res.text.trim().replace(/^["']|["']$/g, "").trim();
    if (msg.length >= 10) return { message: msg, aiUsed: true };
  } catch {
    /* val terug op het sjabloon */
  }
  return { message: fallbackDraft(ctx), aiUsed: false };
}
