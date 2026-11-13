import { chatJson, ensureAiNode, llmConfigProblem } from "@/lib/ai/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { BLOKTEKST_SYSTEEM, blokTekstVraag, getallenTeControleren, leesBlokTekst, type BlokTekst, type BlokTekstInvoer } from "@/lib/sites/bloktekst";

// ---------------------------------------------------------------------------
// De bouwer → "Schrijf met AI": een voorstel voor de kop en de tekst van één blok. Via lib/ai/client.ts (dus met het
// reservemodel en "alles gratis"); er wordt niets opgeslagen. Lezen gaat soepel (lib/sites/bloktekst.ts).
// ---------------------------------------------------------------------------

export const BLOKTEKST_PURPOSE = "site-bloktekst";

const NIET_BEREIKBAAR = "De AI kan nu geen tekst schrijven. Probeer het over een paar minuten opnieuw, of schrijf de tekst zelf.";
const NIET_BRUIKBAAR = "De AI gaf geen bruikbare tekst. Probeer het nog een keer.";

export interface BlokTekstVoorstel extends BlokTekst {
  /** getallen die niet in de gegevens van de ondernemer staan: nalopen vóór het gebruiken */
  controleer: string[];
}

export async function schrijfBlokTekst(invoer: BlokTekstInvoer): Promise<BlokTekstVoorstel> {
  if (!invoer.bedrijf && !invoer.kop && !invoer.tekst && !invoer.wens) throw AppError.validation("Vul eerst de naam van je bedrijf in, of schrijf een paar woorden waar de tekst over moet gaan.");
  await ensureAiNode().catch(() => undefined);
  if (llmConfigProblem()) throw AppError.upstream(NIET_BEREIKBAAR);
  let ruw: unknown;
  try {
    ruw = await chatJson<unknown>({
      purpose: BLOKTEKST_PURPOSE,
      temperature: 0.4,
      maxTokens: 500,
      // iemand wacht op het scherm: één poging (het reservemodel springt zelf in)
      retry: false,
      timeoutMs: 30_000,
      messages: [
        { role: "system", content: BLOKTEKST_SYSTEEM },
        { role: "user", content: blokTekstVraag(invoer) },
      ],
    });
  } catch (err) {
    // alleen de soort fout, nooit de tekst van de ondernemer
    logger.warn("bloktekst: AI gaf geen antwoord", { purpose: BLOKTEKST_PURPOSE, error: (err as Error).message.slice(0, 160) });
    if (err instanceof AppError && /JSON/.test(err.message)) throw AppError.upstream(NIET_BRUIKBAAR);
    throw AppError.upstream(NIET_BEREIKBAAR);
  }
  const tekst = leesBlokTekst(ruw);
  if (!tekst) throw AppError.upstream(NIET_BRUIKBAAR);
  return { ...tekst, controleer: getallenTeControleren(tekst, invoer) };
}
