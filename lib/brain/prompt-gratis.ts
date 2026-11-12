import { GRATIS_PROMPT_BUDGET, PER_BERICHT_TOKENS, kiesBinnenBudget, laatsteBinnenBudget, schatTokens, woordOverlap } from "@/lib/ai/prompt-budget";

// ---------------------------------------------------------------------------
// De breinprompt voor het eigen model (alles gratis, lib/ai/prompt-budget.ts): binnen het budget, op relevantie gekozen.
// Altijd: het systeemdeel en de vraag. Dan de eigen gegevens van de gebruiker (hele blokken), de laatste twee beurten van
// het gesprek, en de kennis: eerst de RAG-fragmenten voor deze vraag (beste eerst), dan de regels van het vaste
// kennispakket die het meest met de vraag te maken hebben. Puur bestand.
// ---------------------------------------------------------------------------

export interface BreinHit {
  title: string;
  source: string;
  excerpt: string;
}

export interface BreinInvoer {
  systeem: string;
  /** de gegevensblokken van de tools (### naam + tekst), elk heel of niet */
  gegevens: readonly string[];
  /** de RAG-fragmenten voor deze vraag, beste eerst */
  hits: readonly BreinHit[];
  /** de tekst van het vaste kennispakket (regels "• titel — tekst") */
  pakket: string;
  geheugen: readonly { role: "user" | "assistant"; content: string }[];
  vraag: string;
}

export type BreinBericht = { role: "system" | "user" | "assistant"; content: string };

const KOP_GEGEVENS = "JOUW GEGEVENS (live, alleen van deze gebruiker):\n";
const KOP_KENNIS = "\n\nKENNIS (gezocht voor deze vraag):\n";

export function breinBerichtenGratis(i: BreinInvoer, budget: number = GRATIS_PROMPT_BUDGET): BreinBericht[] {
  const t = (s: string) => schatTokens(s) + 1;
  let over = budget - (schatTokens(i.systeem) + schatTokens(i.vraag) + 3 * PER_BERICHT_TOKENS + schatTokens(KOP_GEGEVENS + KOP_KENNIS) + 10);

  // eigen gegevens: hoogstens de helft van wat over is, hele blokken
  const gegevens = kiesBinnenBudget(i.gegevens, t, Math.max(0, Math.floor(over / 2)));
  over -= gegevens.reduce((s, g) => s + t(g), 0);

  // de laatste twee beurten, als ze passen (hoogstens een kwart van wat over is)
  const geheugen = laatsteBinnenBudget(i.geheugen.slice(-2), (b) => schatTokens(b.content) + PER_BERICHT_TOKENS, Math.max(0, Math.floor(over / 4)));
  over -= geheugen.reduce((s, b) => s + schatTokens(b.content) + PER_BERICHT_TOKENS, 0);

  // kennis: RAG-fragmenten (al op deze vraag gezocht en gerangschikt), dan pakketregels op woordoverlap met de vraag
  const fragmenten = i.hits.map((h, n) => `[${n + 1}] ${h.title} (${h.source})\n${h.excerpt}`);
  const regels = i.pakket
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => r.startsWith("•"))
    .map((r) => ({ r, s: woordOverlap(i.vraag, r) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);
  const kennis = kiesBinnenBudget([...fragmenten, ...regels], t, Math.max(0, over));

  return [
    { role: "system", content: i.systeem },
    {
      role: "system",
      content: `${KOP_GEGEVENS}${gegevens.join("\n\n") || "(niet nodig voor deze vraag)"}${KOP_KENNIS}${kennis.join("\n\n") || "(niets extra gevonden)"}`,
    },
    ...geheugen,
    { role: "user", content: i.vraag },
  ];
}
