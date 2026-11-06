import { llmHealth, type LlmHealth } from "@/lib/ai/client";
import { cached } from "@/lib/redis";

// ---------------------------------------------------------------------------
// "Doet de AI het nog?" voor een tegel op een dashboard.
//
// llmHealth() vraagt het live aan de aanbieder: tot 4 seconden voor de
// modellenlijst, en als die route ontbreekt zelfs een echt vraagje van 12
// seconden. Dat hoort niet bij elke keer dat iemand het controlecentrum opent
// — 6 november deed GET /api/admin/overview er daardoor 9,2 seconde over.
//
// Een statustegel mag een minuut oud zijn. Wie het nú wil weten gebruikt de
// knop "Test taalmodel" in Admin → Systeem; die blijft llmHealth() rechtstreeks
// aanroepen. De cache is fail-open: valt Redis weg, dan meet hij gewoon zelf.
// ---------------------------------------------------------------------------

const SLEUTEL = "ai:gezondheid";
const TTL_SECONDEN = 60;

export async function llmGezondheidGecachet(): Promise<LlmHealth> {
  return cached(SLEUTEL, TTL_SECONDEN, () => llmHealth());
}
