import { chatJson } from "@/lib/ai/client";
import { logger } from "@/lib/logger";
import { lijktDuits } from "@/lib/shop/cj/cj-core";

// ---------------------------------------------------------------------------
// De vertaling van een CJ-vermelding naar het Nederlands, met drie remmen (18 nov 2026). Ons eigen model (gemma3:4b in
// Ollama) zat die dag in rust op 99,7% van zijn geheugengrens; elke prompt liet de runner ±0,9 GB groeien en de kernel
// schoot hem acht keer af, juist tijdens de CJ-vertalingen (wachtrij "Alles overnemen" + de Bijwerken-ronde + de autopilot
// om 15:00). Daarom:
//   1. strikt één vertaling tegelijk over het hele proces (wachtrij, Bijwerken-ronde en de knop delen één rij);
//   2. een korte prompt: hooguit OMSCHRIJVING_MAX tekens bron en 400 tokens antwoord;
//   3. een storingsstand: mislukt het model (onbereikbaar, afgeschoten, time-out), dan STORING_MS lang geen nieuwe
//      vertalingen; de tekst blijft Engels en het product wacht op de volgende Bijwerken-ronde (activerenNaVertaling).
//      Een onleesbaar antwoord van het model (geen JSON) telt niet als storing: dan is het model er wel.
// ---------------------------------------------------------------------------

const VERTAAL = `Je vertaalt een productvermelding van een leverancier naar gewoon, vlot Nederlands voor een webshop. De bron is Engels, soms Duits of gebrekkig Engels; het resultaat is altijd Nederlands, nooit Duits en nooit Engels. Geen Engels, geen opsmuk, geen beloftes over levertijd, voorraad, keurmerken, certificaten of kwaliteit ("premium", "topkwaliteit"). Verzin niets wat er niet staat. De naam: kort en duidelijk (maximaal 70 tekens, geen hoofdletters-schreeuw, geen merknaam die er niet staat). De omschrijving: 2 tot 4 zinnen, maximaal 450 tekens, wat het is en waarvoor het handig is.
Antwoord uitsluitend met JSON: {"naam":"…","omschrijving":"…"}.`;

/** zoveel tekens van de Engelse omschrijving gaan mee (was 1200; de omschrijving die terugkomt is toch hooguit 450) */
export const OMSCHRIJVING_MAX = 700;
export const VERTAAL_MAX_TOKENS = 400;
/** zolang slaan we vertalingen over na een storing van het model */
export const STORING_MS = 5 * 60_000;

interface Staat {
  rij: Promise<void>;
  storingTot: number;
}
const g = globalThis as unknown as { __zfCjVertaal?: Staat };
const staat: Staat = (g.__zfCjVertaal ??= { rij: Promise.resolve(), storingTot: 0 });

export interface Vertaling {
  naam: string;
  omschrijving: string;
  vertaald: boolean;
}

/** Staat het vertalen stil na een storing? */
export function vertaalStoringActief(now = Date.now()): boolean {
  return staat.storingTot > now;
}

/** Voor tests en het beheerscherm: de storingsstand wissen. */
export function vertaalStoringWis(): void {
  staat.storingTot = 0;
}

/** Een fout van het model zelf (weg, afgeschoten, time-out, 5xx) — niet een antwoord dat we niet konden lezen. */
function isModelStoring(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  if (code === "UPSTREAM_UNAVAILABLE") return true; // AppError.upstream: "LLM niet bereikbaar", 5xx, time-out
  const m = e instanceof Error ? e.message : String(e);
  return /niet bereikbaar|fetch failed|timeout|timed out|afgebroken|ECONN|socket|5\d\d|unavailable|overloaded/i.test(m);
}

async function eenTegelijk<T>(werk: () => Promise<T>): Promise<T> {
  const vorige = staat.rij;
  let klaar!: () => void;
  staat.rij = new Promise<void>((r) => (klaar = r));
  try {
    await vorige;
    return await werk();
  } finally {
    klaar();
  }
}

/** Naam en omschrijving in het Nederlands; lukt het niet, dan de Engelse tekst (en `vertaald: false`). Gooit nooit. */
export async function vertaalVermelding(naamEn: string, omschrijvingEn: string): Promise<Vertaling> {
  const terugval: Vertaling = { naam: naamEn.slice(0, 120), omschrijving: (omschrijvingEn || naamEn).slice(0, 600), vertaald: false };
  if (vertaalStoringActief()) return terugval;
  return eenTegelijk(async () => {
    if (vertaalStoringActief()) return terugval; // de storing kan zijn begonnen terwijl we op onze beurt wachtten
    // een Duitse bron komt soms half Duits terug ("Goldaufkleber 16 Stücke"): één keer opnieuw, anders de brontekst
    for (let poging = 1; poging <= 2; poging++) {
      try {
        const r = await chatJson<{ naam?: unknown; omschrijving?: unknown }>({
          purpose: "shop-product",
          temperature: 0.2,
          maxTokens: VERTAAL_MAX_TOKENS,
          messages: [
            { role: "system", content: VERTAAL },
            { role: "user", content: `Naam: ${naamEn.slice(0, 200)}\nOmschrijving: ${(omschrijvingEn || "(geen)").slice(0, OMSCHRIJVING_MAX)}` },
          ],
        });
        const naam = typeof r.naam === "string" ? r.naam.trim().slice(0, 120) : "";
        const omschrijving = typeof r.omschrijving === "string" ? r.omschrijving.trim().slice(0, 600) : "";
        if (naam.length < 2 || omschrijving.length < 10) return terugval;
        if (lijktDuits(`${naam} ${omschrijving}`)) continue;
        return { naam, omschrijving, vertaald: true };
      } catch (e) {
        const storing = isModelStoring(e);
        if (storing) staat.storingTot = Date.now() + STORING_MS;
        logger.warn("cj: vertalen mislukt, Engelse tekst blijft staan", { error: (e as Error).message.slice(0, 120), ...(storing ? { pauzeMinuten: STORING_MS / 60_000 } : {}) });
        return terugval;
      }
    }
    return terugval;
  });
}
