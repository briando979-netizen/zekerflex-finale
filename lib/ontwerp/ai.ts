import { chat, chatJson, llmConfigProblem } from "@/lib/ai/client";
import { AppError } from "@/lib/errors";
import { HOEKEN, KNOPPEN, LETTERTYPES, SCHADUWEN, STANDAARD_THEMA, normalizeThema, type Thema } from "@/lib/ontwerp/thema";
import { normalizeInhoud, type PaginaInhoud } from "@/lib/ontwerp/paginas";

// ---------------------------------------------------------------------------
// AI-hulp in de Site-ontwerper. Alleen voorstellen: de uitkomst gaat door
// normalizeThema (onbekende waarden worden standaard) en komt pas in het
// concept als de eigenaar dat wil. Zonder AI werkt de ontwerper gewoon.
// ---------------------------------------------------------------------------

function aiBeschikbaar() {
  const probleem = llmConfigProblem();
  if (probleem) throw AppError.validation("De AI-hulp staat nu uit. Alles in de ontwerper werkt ook zonder AI.");
}

/** Een stijl bij een omschrijving ("rustig en betrouwbaar, voor de zorg"). */
export async function stelThemaVoor(omschrijving: string, huidig: Thema): Promise<{ thema: Thema; uitleg: string }> {
  aiBeschikbaar();
  const keuzes = {
    koppen: Object.keys(LETTERTYPES),
    tekst: Object.keys(LETTERTYPES),
    hoeken: Object.keys(HOEKEN),
    knoppen: Object.keys(KNOPPEN),
    schaduw: Object.keys(SCHADUWEN),
  };
  const res = await chatJson<Partial<Thema> & { uitleg?: string }>({
    purpose: "ontwerper",
    retry: false,
    timeoutMs: 30_000,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "Je bent ontwerper van de website van ZekerFlex, een Nederlands platform voor personeel, websites en bedrijfssoftware. " +
          "Je kiest een stijl en antwoordt alleen met JSON. Velden: primair (#RRGGBB, donker genoeg voor witte tekst, contrast ≥ 4,5), " +
          "accent (#RRGGBB, licht en fris, leesbaar op de donkere kleur), inkt (#RRGGBB, heel donker), papier (#RRGGBB, heel licht), " +
          `koppen en tekst (een van ${keuzes.koppen.join(", ")}), hoeken (${keuzes.hoeken.join(", ")}), knoppen (${keuzes.knoppen.join(", ")}), ` +
          `schaduw (${keuzes.schaduw.join(", ")}), tekstgrootte (90-115), breedte (1040-1440), uitleg (één of twee zinnen in gewoon Nederlands waarom deze stijl past).`,
      },
      { role: "user", content: `Huidige stijl: ${JSON.stringify(huidig)}\n\nWens van de eigenaar: ${omschrijving.slice(0, 600)}` },
    ],
  });
  const thema = normalizeThema({ ...STANDAARD_THEMA, ...res });
  return { thema, uitleg: typeof res.uitleg === "string" ? res.uitleg.slice(0, 400) : "" };
}

/**
 * Een hele pagina als blokken bij een onderwerp ("pagina voor horecabedrijven die
 * personeel zoeken"). Zonder foto's (die kiest de eigenaar uit de bibliotheek)
 * en zonder verzonnen cijfers of beloftes; alles gaat door normalizeInhoud.
 */
export async function maakPaginaMetAi(onderwerp: string): Promise<PaginaInhoud> {
  aiBeschikbaar();
  const res = await chatJson<unknown>({
    purpose: "ontwerper",
    retry: false,
    timeoutMs: 45_000,
    temperature: 0.7,
    maxTokens: 2500,
    messages: [
      {
        role: "system",
        content:
          "Je bouwt een webpagina voor ZekerFlex (Nederlands platform voor personeel, websites en bedrijfssoftware; bedrijven betalen het uurtarief van de kracht plus € 3,50 platformkosten per gewerkt uur, plaatsen is gratis). " +
          "Schrijf in gewoon Nederlands (B1). Verzin geen klantnamen, cijfers, keurmerken of garanties. Antwoord alleen met JSON: " +
          '{"titel": string, "omschrijving": string (max 155 tekens, voor Google), "blokken": [blok, ...]} met 4 tot 7 blokken. Een blok heeft "soort" en "achtergrond" ("licht","zacht","donker","merk") en per soort: ' +
          'hero {bovenregel, kop, tekst, knop:{tekst,link}, knop2:{tekst,link}, uitlijning:"links"|"midden"}; tekst {kop, tekst (alinea\'s gescheiden door een lege regel)}; ' +
          "kolommen {kop, items:[{kop,tekst}] (3)}; faq {kop, items:[{vraag,antwoord}] (3-5)}; citaat {tekst, naam} (alleen als het duidelijk een voorbeeld is); oproep {kop, tekst, knop:{tekst,link}}. " +
          "Links alleen naar bestaande paden: /register, /klus-plaatsen, /prijzen, /contact, /voor-bedrijven, /voor-freelancers, /aanbod. Begin met een hero op donker en eindig met een oproep op merk.",
      },
      { role: "user", content: `Onderwerp van de pagina: ${onderwerp.slice(0, 600)}` },
    ],
  });
  const inhoud = normalizeInhoud(res);
  if (!inhoud.blokken.length) throw AppError.validation("De AI-hulp maakte geen bruikbare pagina. Probeer een andere omschrijving of begin met een sjabloon.");
  return { ...inhoud, blokken: inhoud.blokken.slice(0, 10) };
}

const OPDRACHTEN = {
  verbeter: "Maak deze websitetekst duidelijker en aantrekkelijker, in dezelfde lengte.",
  korter: "Maak deze websitetekst korter en krachtiger; houd de betekenis.",
  langer: "Maak deze websitetekst iets uitgebreider en overtuigender, met één concreet voordeel erbij.",
  zakelijk: "Herschrijf deze websitetekst zakelijker en rustiger.",
  vriendelijk: "Herschrijf deze websitetekst vriendelijker en persoonlijker.",
} as const;
export type TekstOpdracht = keyof typeof OPDRACHTEN;
export const TEKST_OPDRACHTEN = Object.keys(OPDRACHTEN) as TekstOpdracht[];

/** Eén tekstveld herschrijven. Geen verzonnen feiten, prijzen of beloftes. */
export async function herschrijfTekst(tekst: string, opdracht: TekstOpdracht, label: string): Promise<string> {
  aiBeschikbaar();
  const res = await chat({
    purpose: "ontwerper",
    retry: false,
    timeoutMs: 30_000,
    temperature: 0.6,
    messages: [
      {
        role: "system",
        content:
          "Je schrijft teksten voor de website van ZekerFlex in gewoon, helder Nederlands (B1). " +
          "Verzin geen feiten, cijfers, prijzen, keurmerken of garanties die niet in de tekst staan. " +
          "Antwoord alleen met de nieuwe tekst, zonder aanhalingstekens of uitleg.",
      },
      { role: "user", content: `${OPDRACHTEN[opdracht]}\nVeld: ${label}\nTekst: ${tekst.slice(0, 2000)}` },
    ],
  });
  return res.text.trim().replace(/^["“”']+|["“”']+$/g, "").slice(0, 2000);
}
