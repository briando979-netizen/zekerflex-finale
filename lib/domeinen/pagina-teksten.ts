// Teksten van de openbare pagina /domeinnaam (puur bestand, zodat de test ze kan lezen).
//
// Opbouw zoals de grote domeinwinkels (15 nov 2026, eigenaar: "dezelfde weergave"): zoekbalk in de kop, in drie
// stappen, domein met website, waarom bij ons, verhuizen, de extensies met prijzen, vragen. Alleen de opbouw;
// de inhoud is van ons en klopt: geen klantaantallen, geen beoordelingen, geen acties. Online betalen staat dicht
// (Stripe), dus een bezoeker vraagt aan en een mens neemt contact op (DomeinZoeker → /api/domeinen/aanvraag).

import { BUNDEL_TLDS, EXTENSIES, euroPrijs, metBtw, type Extensie } from "@/lib/domeinen/extensies";

/** ".nl, .com, .eu of .be" */
export const BUNDEL_TEKST = BUNDEL_TLDS.map((t) => `.${t}`)
  .join(", ")
  .replace(/, ([^,]*)$/, " of $1");

/** De goedkoopste extensie in het eerste jaar (voor "vanaf" in de kop). */
export function goedkoopsteEersteJaar(lijst: readonly Extensie[] = EXTENSIES): Extensie | undefined {
  return [...lijst].sort((a, b) => a.prijsCent - b.prijsCent)[0];
}

/** De populaire extensies als prijskaart: eerste jaar en daarna, excl. en incl. btw. */
export function prijsKaarten(lijst: readonly Extensie[] = EXTENSIES) {
  return lijst
    .filter((e) => e.populair)
    .map((e) => ({
      tld: e.tld,
      omschrijving: e.omschrijving,
      eersteJaar: euroPrijs(e.prijsCent),
      eersteJaarIncl: euroPrijs(metBtw(e.prijsCent).inclCent),
      daarna: euroPrijs(e.verlengCent),
      inBundel: (BUNDEL_TLDS as readonly string[]).includes(e.tld),
    }));
}

export interface Stap {
  titel: string;
  tekst: string;
}

export const DOMEIN_STAPPEN: Stap[] = [
  { titel: "Zoek je naam", tekst: "Typ de naam die je wilt. Je ziet meteen welke extensies nog vrij zijn, met de prijs erbij." },
  { titel: "Vraag hem aan", tekst: "Kies je naam en laat je gegevens achter. Binnen één werkdag nemen we contact met je op en leggen we hem voor je vast." },
  { titel: "Gebruik hem", tekst: "We koppelen je domein aan je website of webshop van ZekerFlex, met een beveiligde verbinding (https)." },
];

export const VERHUIS_STAPPEN: Stap[] = [
  { titel: "Vul je domein in", tekst: "Typ je domeinnaam bij Verhuizen, hierboven onder de zoekbalk, en laat je gegevens achter." },
  { titel: "Vraag de verhuiscode op", tekst: "Die krijg je van je huidige provider (ook wel autorisatiecode of token). Wij vertellen je waar je hem vindt." },
  { titel: "Wij regelen de rest", tekst: "Je houdt je naam; alleen de beheerder wordt ZekerFlex. Je website en e-mail blijven gewoon werken." },
];

export interface Voordeel {
  icoon: "prijs" | "koppelen" | "een-plek" | "vrij";
  titel: string;
  tekst: string;
}

export const DOMEIN_VOORDELEN: Voordeel[] = [
  { icoon: "prijs", titel: "De prijs vooraf", tekst: "Je ziet het eerste jaar én wat hij daarna per jaar kost. Geen verrassing bij het verlengen." },
  { icoon: "koppelen", titel: "Meteen gekoppeld", tekst: "Aan je website of webshop van ZekerFlex, met https. Je hoeft zelf niets in te stellen." },
  { icoon: "een-plek", titel: "Alles op één plek", tekst: "Domein, website, webshop, reviews en personeel: met één account en één aanspreekpunt." },
  { icoon: "vrij", titel: "Altijd van jou", tekst: "Opzeggen kan voor de verlengdatum. Wil je weg, dan krijg je de verhuiscode van ons." },
];

export const DOMEIN_FAQ: { q: string; a: string }[] = [
  {
    q: "Hoe weet ik of een domeinnaam vrij is?",
    a: "Typ de naam in de zoekbalk. We vragen het register van elke extensie direct, en zien zo of de naam al bezet is. Bij .eu, .be, .de en .nu kijken we of de naam in gebruik is; daar staat dan 'waarschijnlijk vrij'. Bij het aanvragen controleren we het altijd nog een keer.",
  },
  {
    q: "Wat kost een domeinnaam?",
    a: `De prijzen staan op deze pagina, excl. btw: het eerste jaar en daarna per jaar. Een .nl kost ${euroPrijs(EXTENSIES[0]?.prijsCent ?? 295)} het eerste jaar en daarna ${euroPrijs(EXTENSIES[0]?.verlengCent ?? 1995)} per jaar. Heb je een websiteabonnement van ZekerFlex (Basis of Pro), dan is je eerste ${BUNDEL_TEKST} het eerste jaar inbegrepen.`,
  },
  {
    q: "Hoe vraag ik een domeinnaam aan?",
    a: "Zoek je naam, kies hem en laat je gegevens achter. Binnen één werkdag nemen we contact met je op. Je krijgt eerst een bevestiging met de prijs; pas daarna leggen we de naam voor je vast.",
  },
  {
    q: "Wat is verhuizen?",
    a: "Je houdt je eigen domeinnaam; alleen de partij die hem voor je beheert, wordt ZekerFlex. Je vraagt bij je huidige provider een verhuiscode (ook wel autorisatiecode of token) op en geeft die aan ons. Je website en e-mail blijven tijdens het verhuizen gewoon werken. Een .nl verhuizen is gratis; bij andere extensies kost verhuizen hetzelfde als een jaar verlengen.",
  },
  {
    q: "Ik heb al een domein elders. Moet ik verhuizen?",
    a: "Nee. Je kunt je eigen domein ook gewoon koppelen aan je website van ZekerFlex en het bij je huidige provider laten. Dat doe je in de websitebouwer, op het tabblad Domein.",
  },
  {
    q: "Kan ik mijn domein later opzeggen of meenemen?",
    a: "Ja. Je domein verlengt per jaar en je krijgt de factuur ruim vooraf. Wil je het niet meer, dan zeg je het op voor de verlengdatum. Wil je naar een andere provider, dan krijg je van ons de verhuiscode.",
  },
];

/** schema.org FAQPage met precies de vragen die op de pagina staan. */
export function domeinFaqJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: DOMEIN_FAQ.map((v) => ({ "@type": "Question", name: v.q, acceptedAnswer: { "@type": "Answer", text: v.a } })),
  };
}
