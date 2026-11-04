import type { Rijschool } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { chat, ensureAiNode, llmConfigProblem } from "@/lib/ai/client";
import { isLocalInference, llmHost } from "@/lib/ai/governor";
import { enforceRateLimit } from "@/lib/rate-limit";
import { websiteVan } from "@/lib/rijschool/website";
import { siteUrl } from "@/lib/rijschool/mail";
import { GESCHIEDENIS_MAX, kennisVan, regelAntwoord, schoonAntwoord, systeemPrompt, type Beurt, type SchoolKennis } from "@/lib/rijschool/assistent";

// ---------------------------------------------------------------------------
// De AI-assistent op de website van een rijschool (lib/rijschool/assistent.ts):
// aan/uit per rijschool (standaard uit; de rijschool kiest zelf), de vraag aan
// het model, en vaste antwoorden als er geen model is of de dagelijkse grens per
// rijschool bereikt is. Vragen en antwoorden worden niet bewaard.
// ---------------------------------------------------------------------------

/** Zoveel modelantwoorden per rijschool per dag; daarna vaste antwoorden. */
const PER_DAG = 300;

const sleutel = (rijschoolId: string) => `rijschool-assistent:${rijschoolId}`;

export async function assistentAan(rijschoolId: string): Promise<boolean> {
  return Boolean((await kvGet<{ aan?: boolean }>(sleutel(rijschoolId)).catch(() => null))?.aan);
}

export async function zetAssistent(rijschoolId: string, aan: boolean): Promise<void> {
  await kvSet(sleutel(rijschoolId), { aan, at: new Date().toISOString() });
}

/** Wie het antwoord maakt, voor de privacyverklaring. */
export function aiVerwerker(): string {
  if (isLocalInference()) return "een AI-model op de eigen servers van ZekerFlex";
  return /googleapis\.com$|google\.com$/.test(llmHost()) ? "een AI-dienst van Google (Gemini)" : "een externe AI-dienst";
}

export async function schoolKennis(r: Rijschool): Promise<SchoolKennis> {
  const [producten, instructeurs, voertuigen] = await Promise.all([
    prisma.rijschoolProduct.findMany({ where: { rijschoolId: r.id, zichtbaar: true }, orderBy: [{ volgorde: "asc" }, { createdAt: "asc" }], take: 30 }),
    prisma.rijschoolInstructeur.findMany({ where: { rijschoolId: r.id, actief: true }, select: { naam: true, categorieen: true, actief: true }, take: 30 }),
    prisma.rijschoolVoertuig.findMany({ where: { rijschoolId: r.id, actief: true }, select: { automaat: true, actief: true }, take: 30 }),
  ]);
  return kennisVan({ rijschool: r, website: websiteVan(r.website, r), producten, instructeurs, voertuigen, proeflesUrl: siteUrl(r, "/proefles") });
}

/** Beantwoord een vraag van een bezoeker. Valt altijd terug op een vast antwoord; gooit nooit door het model. */
export async function beantwoordVraag(r: Rijschool, vraag: string, eerder: Beurt[]): Promise<{ antwoord: string; bron: "ai" | "regels" }> {
  const k = await schoolKennis(r);
  const regels = () => ({ antwoord: regelAntwoord(vraag, k), bron: "regels" as const });

  await ensureAiNode().catch(() => undefined);
  if (llmConfigProblem()) return regels();
  try {
    // kosten begrensd per rijschool per dag; daarna gewoon vaste antwoorden
    await enforceRateLimit({ name: "rijschool-assistent-dag", identifier: r.id, limit: PER_DAG, windowSeconds: 86_400 });
  } catch {
    return regels();
  }
  try {
    const { text } = await chat({
      purpose: "rijschool-assistent",
      temperature: 0.2,
      maxTokens: 350,
      retry: false,
      timeoutMs: 15_000,
      messages: [
        { role: "system", content: systeemPrompt(k) },
        ...eerder.slice(-GESCHIEDENIS_MAX).map((b) => ({ role: b.van === "bezoeker" ? ("user" as const) : ("assistant" as const), content: b.tekst.slice(0, 600) })),
        { role: "user", content: vraag },
      ],
    });
    const antwoord = schoonAntwoord(text);
    return antwoord ? { antwoord, bron: "ai" } : regels();
  } catch {
    return regels();
  }
}
