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

export interface AssistentAntwoord {
  uitleg: string;
  /** het hele thema na de wijziging, of null als de stijl gelijk blijft */
  thema: Thema | null;
  /** tekstvoorstellen per sleutel uit CONTENT_REGISTRY */
  teksten: Record<string, string>;
}

/**
 * De assistent van de ontwerper: een wens in gewone taal ("warmer, rondere
 * knoppen", "de homepagekop moet over horeca gaan") wordt een voorstel voor de
 * stijl en de teksten. Alleen bekende tekst-sleutels, alleen geldige
 * themawaarden; de eigenaar kiest zelf wat hij overneemt.
 */
export async function ontwerpAssistent(vraag: string, huidig: Thema, teksten: { key: string; label: string; waarde: string }[]): Promise<AssistentAntwoord> {
  aiBeschikbaar();
  const res = await chatJson<{ uitleg?: unknown; thema?: unknown; teksten?: unknown }>({
    purpose: "ontwerper",
    retry: false,
    timeoutMs: 40_000,
    temperature: 0.5,
    maxTokens: 1800,
    messages: [
      {
        role: "system",
        content:
          "Je bent de ontwerpassistent van de ZekerFlex-website (Nederlands platform voor personeel, websites en bedrijfssoftware). " +
          "Je antwoordt alleen met JSON: {\"uitleg\": string (kort, gewoon Nederlands, wat je voorstelt en waarom), \"thema\": object met alleen de velden die veranderen of null, \"teksten\": object sleutel → nieuwe tekst (alleen sleutels uit de lijst, alleen als de wens over tekst gaat)}. " +
          `Themavelden: primair, accent, inkt, papier (#RRGGBB; witte tekst moet leesbaar blijven op primair), koppen en tekst (${Object.keys(LETTERTYPES).join(", ")}), hoeken (${Object.keys(HOEKEN).join(", ")}), knoppen (${Object.keys(KNOPPEN).join(", ")}), schaduw (${Object.keys(SCHADUWEN).join(", ")}), tekstgrootte (90-115), breedte (1040-1440). ` +
          "Verzin geen feiten, cijfers, prijzen of beloftes in teksten. Kun je iets niet (bijvoorbeeld een nieuwe functie bouwen), zeg dat dan eerlijk in de uitleg.",
      },
      {
        role: "user",
        content: `Huidige stijl: ${JSON.stringify(huidig)}\nTeksten (sleutel | veld | huidige tekst):\n${teksten.map((t) => `${t.key} | ${t.label} | ${t.waarde.slice(0, 200)}`).join("\n")}\n\nWens: ${vraag.slice(0, 800)}`,
      },
    ],
  });
  const bekend = new Set(teksten.map((t) => t.key));
  const voorstel = res.teksten && typeof res.teksten === "object" && !Array.isArray(res.teksten) ? (res.teksten as Record<string, unknown>) : {};
  const nieuweTeksten = Object.fromEntries(
    Object.entries(voorstel)
      .filter(([k, v]) => bekend.has(k) && typeof v === "string" && v.trim())
      .map(([k, v]) => [k, String(v).trim().slice(0, 2000)]),
  );
  const patch = res.thema && typeof res.thema === "object" && !Array.isArray(res.thema) ? (res.thema as Record<string, unknown>) : null;
  const thema = patch ? normalizeThema({ ...huidig, ...patch }) : null;
  const uitleg = typeof res.uitleg === "string" ? res.uitleg.slice(0, 600) : "";
  if (!thema && !Object.keys(nieuweTeksten).length && !uitleg) throw AppError.validation("De assistent gaf geen bruikbaar antwoord. Probeer het anders te zeggen.");
  return { uitleg, thema, teksten: nieuweTeksten };
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
