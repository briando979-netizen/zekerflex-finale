import { alleenFlexwerkAan } from "@/lib/seo/verbergen";
import { getLocale } from "@/lib/i18n/server";
import { samenLabel, type SamenGroep } from "@/lib/werkgever/samen-tabs";

/**
 * De titel van een pagina die met de vlag `publiek-alleen-flexwerk` onder een samengevoegde ingang valt: dezelfde naam als de
 * regel in het menu ("Planning", "Mijn werkers", "Uren"), in de taal van de app. Zonder de vlag (de pagina's staan dan los in
 * het menu) blijft het de eigen titel van de pagina. Alleen voor servercomponenten (leest de vlag en de taal per verzoek).
 */
export async function samenTitel(groep: SamenGroep, eigenTitel: string): Promise<string> {
  const aan = await alleenFlexwerkAan().catch(() => false);
  if (!aan) return eigenTitel;
  return samenLabel(groep, await getLocale());
}