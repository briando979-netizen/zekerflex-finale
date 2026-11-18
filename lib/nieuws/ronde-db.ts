import { chatJson, llmConfigProblem } from "@/lib/ai/client";
import { featureEnabled } from "@/lib/flags";
import { fetchPage } from "@/lib/website-check/fetch";
import { SITE } from "@/lib/seo";
import { NIEUWS_BRONNEN } from "@/lib/nieuws/bronnen";
import { consultatieTekst, leesRss, paginaTekst, RUBRIEK_NAAM } from "@/lib/nieuws/regels";
import { NIEUWS_VLAG, type NieuwsAfhankelijkheden } from "@/lib/nieuws/ronde";
import { alleBerichten, bewaarBericht, bewaarNieuwsStand, isGezien, ruimNieuwsOp, zetGezien } from "@/lib/nieuws/store";

// De echte afhankelijkheden van de nieuwsronde (lib/nieuws/ronde.ts): de feeds en bronpagina's via de beveiligde
// fetcher (alleen openbare adressen, begrensd in tijd en grootte), het schrijven via het taalmodel, de opslag in KV.

// Een bron geeft soms één keer een 5xx (18 nov 18:40 UTC: het CBS antwoordde met 500, een minuut later gewoon 200): dan
// nog twee keer proberen met een korte pauze, anders valt een hele ronde weg en is de volgende pas uren later.
async function haal(url: string, maxBytes: number): Promise<string> {
  let status = 0;
  for (let poging = 0; poging < 3; poging++) {
    if (poging > 0) await new Promise((r) => setTimeout(r, 4000 * poging));
    const p = await fetchPage(url, { timeoutMs: 25_000, maxBytes });
    if (p.status < 400) return p.body;
    status = p.status;
    if (p.status < 500) break;
  }
  throw new Error(`${new URL(url).host} antwoordde met status ${status}`);
}

/** De opdracht aan het model. De stijl is die van de site: gewoon Nederlands, je/jij, kort, zonder reclame. */
export function nieuwsOpdracht(invoer: { bronNaam: string; titel: string; tekst: string; rubriek: string; wet?: boolean }): { system: string; user: string } {
  const wet = invoer.wet
    ? `- Dit is een VOORSTEL dat de overheid openbaar voorlegt (een internetconsultatie). Het is nog geen wet. Schrijf dus "het voorstel", "de overheid wil" en "als dit doorgaat", nooit dat het al geldt. Noem tot wanneer mensen kunnen reageren als dat in de brontekst staat. Geef de titel van het voorstel weer in gewone woorden.\n` +
      `- Is de brontekst kort, schrijf dan ook kort (minimaal 100 woorden) en vul niets aan uit eigen kennis.\n`
    : "";
  const system =
    `Je schrijft korte nieuwsberichten voor de nieuwsroom van ${SITE.name}, een Nederlands platform voor flexwerk. ` +
    `De lezers zijn flexwerkers, zzp'ers, uitzendkrachten en bedrijven die personeel inhuren.\n\n` +
    `Stijl: gewoon, helder Nederlands. Spreek de lezer aan met je. Korte zinnen. Geen vaktaal, geen uitroeptekens, geen reclame voor ${SITE.name}.\n\n` +
    `Regels:\n` +
    `- Gebruik ALLEEN feiten uit de brontekst. Verzin niets en reken niets zelf uit. Elk getal dat je noemt staat letterlijk zo in de brontekst.\n` +
    `- Schrijf in je eigen woorden; neem geen hele zinnen over.\n` +
    `- Neem tijd en omvang precies over: staat er "het vierde kwartaal van 2026" of "bijna 77 procent", schrijf dan niet "2026" of "77 procent".\n` +
    `- Schrijf alleen "het sterkst", "de meeste", "het hoogst" en zulke vergelijkingen als de brontekst die zelf maakt, en over hetzelfde onderwerp.\n` +
    `- Elke alinea heeft 2 tot 4 zinnen die op elkaar aansluiten. Geen losse zinnen onder elkaar.\n` +
    `- Geef geen juridisch of fiscaal advies en doe geen voorspellingen.\n` +
    `- Zet geen links of webadressen in de tekst; de bron komt er apart onder.\n` +
    wet +
    `- VERPLICHT: het laatste blok heeft als kop precies "Wat betekent dit voor jou?" en zegt in 2 tot 3 zinnen, voorzichtig, wat een flexwerker of een bedrijf dat inhuurt hieraan heeft. Staat dat niet in de bron, zeg dan alleen waarom het goed is om dit te weten.\n\n` +
    `Antwoord UITSLUITEND met JSON: {"titel": string (hooguit 90 tekens, geen clickbait), "samenvatting": string (1 tot 2 zinnen), ` +
    `"blokken": [{"kop": string, "alineas": string[]}] (precies 3 blokken, samen minstens 150 en hooguit 300 woorden; een bericht onder de 120 woorden wordt weggegooid)}.`;
  const user = `Rubriek: ${invoer.rubriek}\nBron: ${invoer.bronNaam}\nTitel van de bron: ${invoer.titel}\n\nBrontekst:\n${invoer.tekst}`;
  return { system, user };
}

export function echteNieuwsAfhankelijkheden(): NieuwsAfhankelijkheden {
  return {
    vanzelf: () => featureEnabled(NIEUWS_VLAG),
    bronnen: NIEUWS_BRONNEN,
    haalFeed: async (bron) => leesRss(await haal(bron.feed, 1_500_000), bron.soort === "consultatie"),
    haalPagina: async (url, bron) => (bron.soort === "consultatie" ? consultatieTekst(await haal(url, 3_000_000)) : paginaTekst(await haal(url, 3_000_000))),
    schrijf: async ({ bron, item, tekst, rubriek }) => {
      const probleem = llmConfigProblem();
      if (probleem) throw new Error(`het AI-model is niet ingesteld (${probleem})`);
      const { system, user } = nieuwsOpdracht({ bronNaam: bron.naam, titel: item.titel, tekst, rubriek: RUBRIEK_NAAM[rubriek], wet: bron.soort === "consultatie" });
      return chatJson<unknown>({
        purpose: "nieuws-bericht",
        temperature: 0.3,
        maxTokens: 1400,
        timeoutMs: 180_000,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
    },
    isGezien,
    zetGezien,
    slugs: async () => (await alleBerichten()).map((b) => b.slug),
    bewaar: bewaarBericht,
    bewaarStand: bewaarNieuwsStand,
    ruimOp: ruimNieuwsOp,
  };
}
