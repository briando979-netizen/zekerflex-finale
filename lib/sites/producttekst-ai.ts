import { chatJson, ensureAiNode, llmConfigProblem } from "@/lib/ai/client";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { PRODUCTTEKST_SYSTEEM, leesProductTekst, productTekstInvoer, productTekstVraag, teControleren, type ProductTekst } from "@/lib/sites/producttekst";
import type { SiteProduct } from "@/lib/sites/types";

// ---------------------------------------------------------------------------
// Studio → Webshop → Slim: de AI schrijft een voorstel voor de korte zin en de
// omschrijving van één product. Via lib/ai/client.ts (dus met het reservemodel en
// "alles gratis"); er wordt niets opgeslagen: de eigenaar ziet het voorstel, past
// het aan en bewaart het zelf in het product. Lezen gaat soepel (lib/sites/producttekst.ts).
// ---------------------------------------------------------------------------

export const PRODUCTTEKST_PURPOSE = "winkel-producttekst";

const NIET_BEREIKBAAR = "De AI kan nu geen tekst schrijven. Probeer het over een paar minuten opnieuw, of schrijf de tekst zelf bij het product.";

export interface ProductTekstVoorstel extends ProductTekst {
  /** getallen en feitwoorden die niet in de gegevens van de eigenaar staan: nalopen vóór het opslaan */
  controleer: string[];
}

export async function schrijfProductTekst(p: SiteProduct, bedrijfNaam: string): Promise<ProductTekstVoorstel> {
  const invoer = productTekstInvoer(p, bedrijfNaam);
  if (!invoer.naam) throw AppError.validation("Geef het product eerst een naam.");
  await ensureAiNode().catch(() => undefined);
  if (llmConfigProblem()) throw AppError.upstream(NIET_BEREIKBAAR);
  let ruw: unknown;
  try {
    ruw = await chatJson<unknown>({
      purpose: PRODUCTTEKST_PURPOSE,
      temperature: 0.3,
      maxTokens: 600,
      // iemand wacht op het scherm: één poging (het reservemodel springt zelf in), met de ruimere grens van "alles gratis"
      retry: false,
      timeoutMs: 30_000,
      messages: [
        { role: "system", content: PRODUCTTEKST_SYSTEEM },
        { role: "user", content: productTekstVraag(invoer) },
      ],
    });
  } catch (err) {
    // alleen de soort fout, nooit de producttekst
    logger.warn("producttekst: AI gaf geen antwoord", { purpose: PRODUCTTEKST_PURPOSE, error: (err as Error).message.slice(0, 160) });
    if (err instanceof AppError && /JSON/.test(err.message)) throw AppError.upstream("De AI gaf geen bruikbare tekst. Probeer het nog een keer.");
    throw AppError.upstream(NIET_BEREIKBAAR);
  }
  const tekst = leesProductTekst(ruw);
  if (!tekst) throw AppError.upstream("De AI gaf geen bruikbare tekst. Probeer het nog een keer.");
  return { ...tekst, controleer: teControleren(tekst, invoer) };
}
