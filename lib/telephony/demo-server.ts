import { chatJson, fastModel } from "@/lib/ai/client";
import { piperSpreek, STANDAARD_PIPER_STEM } from "@/lib/ai/piper";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { extractFacts } from "@/lib/website-check/analyze";
import { assertFetchableUrl, fetchPage, FetchError } from "@/lib/website-check/fetch";
import { leesOpeningstijden, tekstVan } from "@/lib/website-check/inlezen";
import {
  leesGesprek,
  leesInvoer,
  naamVanSite,
  reserveGesprek,
  uurVoorlezen,
  voorStem,
  VOORBEELD,
  VOORBEELD_ZAAK,
  type DemoGesprek,
  type DemoRegel,
  type DemoRegelMetGeluid,
  type ZaakInfo,
} from "@/lib/telephony/demo";

// ---------------------------------------------------------------------------
// De luisterdemo van de telefoonassistent (lib/telephony/demo.ts): de site van de bezoeker lezen (alleen openbare
// adressen, lib/website-check/fetch.ts), ons taalmodel een kort gesprek met een testklant laten schrijven en dat met
// twee eigen stemmen voorlezen (Piper: de assistent "nl-vrouw", de testklant "nl-man", deploy/piper/config). Niets
// wordt bewaard: wat de bezoeker invult, gaat alleen naar de site zelf en naar ons eigen model.
// ---------------------------------------------------------------------------

export const STEM_ASSISTENT = "nl-vrouw";
export const STEM_KLANT = "nl-man";

/** Hooguit zoveel gesprekken tegelijk maken: het taalmodel en de stem draaien op dezelfde server als de site. */
const MAX_TEGELIJK = 2;
const VOORBEELD_TTL_MS = 24 * 3600_000;

const gedeeld = globalThis as typeof globalThis & {
  __zfTelefoonDemoBezig?: number;
  __zfTelefoonVoorbeeld?: { op: number; gesprek: DemoGesprek };
};

/** Een metatag uit de kop van een pagina, zoals og:site_name. */
function meta(html: string, naam: string): string | null {
  const kop = /<head\b[\s\S]*?<\/head>/i.exec(html)?.[0] ?? html.slice(0, 20_000);
  for (const tag of kop.match(/<meta\b[^>]*>/gi) ?? []) {
    if (new RegExp(`(?:property|name)\\s*=\\s*["']${naam}["']`, "i").test(tag)) {
      return /content\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1]?.trim() || null;
    }
  }
  return null;
}

/** Wat de assistent over de zaak weet. Een site die niet te lezen is, levert alleen de naam uit het domein. */
export async function zaakVan(invoer: string): Promise<ZaakInfo> {
  const i = leesInvoer(invoer);
  if (!i) throw AppError.validation("Vul je website of de naam van je zaak in.");
  if (i.soort === "naam") return { naam: i.naam };
  let host = "";
  try {
    host = assertFetchableUrl(i.url).hostname;
  } catch (err) {
    throw AppError.validation(err instanceof FetchError ? err.message : "Dit is geen geldig webadres.");
  }
  try {
    const pagina = await fetchPage(i.url, { timeoutMs: 8000, maxBytes: 1_500_000 });
    if (pagina.status >= 400) return { naam: naamVanSite(null, null, host) };
    const feiten = extractFacts(pagina.body, pagina.finalUrl, pagina.headers);
    const tekst = tekstVan(pagina.body);
    const uren = leesOpeningstijden(tekst).slice(0, 4).map((u) => uurVoorlezen(u.dag, u.tijd));
    const omschrijving = (feiten.description ?? tekst.slice(0, 300)).replace(/\s+/g, " ").trim().slice(0, 300);
    return {
      naam: naamVanSite(feiten.title, meta(pagina.body, "og:site_name"), new URL(pagina.finalUrl).hostname),
      ...(omschrijving ? { omschrijving } : {}),
      ...(uren.length ? { openingstijden: uren } : {}),
    };
  } catch (err) {
    // alleen de host in het log, nooit het hele adres
    logger.info("telefoon-demo: site niet te lezen", { host, fout: err instanceof FetchError ? err.code : "anders" });
    return { naam: naamVanSite(null, null, host) };
  }
}

const SYSTEEM = `Je schrijft een kort, natuurlijk telefoongesprek in het Nederlands tussen de digitale telefoonassistent van een zaak en een beller (een testklant die Sanne heet).
Regels:
- 6 tot 8 beurten, om en om. De assistent begint en de assistent eindigt.
- De eerste zin van de assistent is: "Goedendag, u spreekt met de digitale assistent van {naam}." gevolgd door een korte vraag waarmee hij kan helpen.
- Elke beurt hooguit twee korte zinnen, zoals mensen aan de telefoon praten. Geen opsommingen, geen emoji, geen markdown.
- Sanne stelt een vraag die past bij dit soort zaak.
- De assistent gebruikt alleen de feiten die je krijgt. Weet hij iets niet (een prijs, of iets vrij is, een afspraak in de agenda zetten), dan zegt hij dat eerlijk en zet hij een terugbelverzoek klaar: hij vraagt haar naam; het nummer heeft hij al, want zij belt ermee.
- Noem geen telefoonnummers, mailadressen, webadressen of bedragen. Verzin geen namen van medewerkers.
- De assistent zegt "u" tegen de beller.
Antwoord alleen met JSON: {"regels":[{"wie":"assistent","tekst":"..."},{"wie":"klant","tekst":"..."}]}`;

/** Het gesprek: door ons taalmodel geschreven, of het reservegesprek als dat niet op tijd of niet bruikbaar is. */
async function gesprekVoor(z: ZaakInfo): Promise<{ regels: DemoRegel[]; door: "ai" | "vast" }> {
  const feiten = [
    `Naam van de zaak: ${z.naam}`,
    z.omschrijving ? `Over de zaak: ${z.omschrijving}` : "Over de zaak is verder niets bekend.",
    z.openingstijden?.length ? `Openingstijden: ${z.openingstijden.join("; ")}` : "Openingstijden: onbekend.",
  ].join("\n");
  try {
    const raw = await chatJson<unknown>({
      messages: [
        { role: "system", content: SYSTEEM.replace("{naam}", z.naam) },
        { role: "user", content: feiten },
      ],
      model: fastModel(),
      temperature: 0.7,
      maxTokens: 700,
      timeoutMs: 45_000,
      retry: false,
      stilBijFout: true,
      purpose: "telefoon-demo",
    });
    const regels = leesGesprek(raw);
    if (regels) return { regels, door: "ai" };
    logger.info("telefoon-demo: antwoord van het model niet bruikbaar, reservegesprek");
  } catch (err) {
    logger.info("telefoon-demo: taalmodel gaf geen gesprek, reservegesprek", { fout: err instanceof Error ? err.message.slice(0, 120) : "onbekend" });
  }
  return { regels: reserveGesprek(z), door: "vast" };
}

/** Eén regel voorlezen met de stem van die spreker; ontbreekt die stem, dan de standaardstem; lukt niets, dan null. */
async function geluidVan(r: DemoRegel): Promise<DemoRegelMetGeluid["geluid"]> {
  const tekst = voorStem(r.tekst);
  const stem = r.wie === "assistent" ? STEM_ASSISTENT : STEM_KLANT;
  const spraak =
    (await piperSpreek(tekst, { stem, formaat: "mp3", timeoutMs: 20_000 }).catch(() => null)) ??
    (await piperSpreek(tekst, { stem: STANDAARD_PIPER_STEM, formaat: "mp3", timeoutMs: 20_000 }).catch(() => null));
  return spraak ? { mime: spraak.mime, data: spraak.audio.toString("base64") } : null;
}

async function voorlezen(regels: DemoRegel[]): Promise<DemoRegelMetGeluid[]> {
  const uit: DemoRegelMetGeluid[] = [];
  // na elkaar: de stem-server doet één tekst tegelijk, en zo blijft er ruimte voor de rest van de site
  for (const r of regels) uit.push({ ...r, geluid: await geluidVan(r) });
  return uit;
}

/** Het vaste voorbeeld, voorgelezen; een dag bewaard in het geheugen (het is voor iedereen hetzelfde). */
export async function voorbeeldGesprek(): Promise<DemoGesprek> {
  const klaar = gedeeld.__zfTelefoonVoorbeeld;
  if (klaar && Date.now() - klaar.op < VOORBEELD_TTL_MS) return klaar.gesprek;
  const gesprek: DemoGesprek = { zaak: VOORBEELD_ZAAK, door: "vast", regels: await voorlezen(VOORBEELD) };
  // alleen bewaren als de stem er was; anders de volgende keer opnieuw proberen
  if (gesprek.regels.every((r) => r.geluid)) gedeeld.__zfTelefoonVoorbeeld = { op: Date.now(), gesprek };
  return gesprek;
}

/** Een gesprek voor de zaak van de bezoeker: site lezen, gesprek schrijven, voorlezen. */
export async function maakDemo(invoer: string): Promise<DemoGesprek> {
  if ((gedeeld.__zfTelefoonDemoBezig ?? 0) >= MAX_TEGELIJK) {
    throw AppError.rateLimited("Het is even druk met voorbeeldgesprekken. Probeer het over een minuut opnieuw.", 60);
  }
  gedeeld.__zfTelefoonDemoBezig = (gedeeld.__zfTelefoonDemoBezig ?? 0) + 1;
  const begon = Date.now();
  try {
    const zaak = await zaakVan(invoer);
    const { regels, door } = await gesprekVoor(zaak);
    const gesprek: DemoGesprek = { zaak: zaak.naam, door, regels: await voorlezen(regels) };
    logger.info("telefoon-demo gemaakt", { door, regels: regels.length, metGeluid: gesprek.regels.filter((r) => r.geluid).length, ms: Date.now() - begon });
    return gesprek;
  } finally {
    gedeeld.__zfTelefoonDemoBezig = Math.max(0, (gedeeld.__zfTelefoonDemoBezig ?? 1) - 1);
  }
}
