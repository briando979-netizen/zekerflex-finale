import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// Bewerkbare site-teksten zonder code. Een register van tekst-sleutels met hun
// standaardwaarde; de eigenaar kan ze overschrijven (Admin → Huisstijl →
// Teksten). Overrides staan in de KeyValueStore; leeg of gelijk aan de default
// = geen override (dus exact de oorspronkelijke tekst).
// ---------------------------------------------------------------------------

export interface ContentItem {
  key: string;
  label: string;
  default: string;
  group?: string;
  multiline?: boolean;
}

export const CONTENT_REGISTRY: ContentItem[] = [
  // ─────────────────────────────────────────────────────────── Hero
  { key: "hero.eyebrow", group: "Homepage — hero", label: "Bovenregel", default: "Personeel · website · branchesoftware · administratie" },
  { key: "hero.titleLine1", group: "Homepage — hero", label: "Titel regel 1", default: "Zeker van je werk." },
  { key: "hero.titleLine2", group: "Homepage — hero", label: "Titel regel 2 (accent)", default: "Zeker van je mensen." },
  {
    key: "hero.lead",
    group: "Homepage — hero",
    label: "Introtekst",
    default:
      "Eén plek voor je hele bedrijf: personeel, een eigen website, software voor jouw branche en je administratie. Zoek je werk? Hier vind je diensten bij jou in de buurt.",
    multiline: true,
  },
  { key: "hero.ctaPrimary", group: "Homepage — hero", label: "Knop 1 (werk zoeken)", default: "Ik zoek werk" },
  { key: "hero.ctaSecondary", group: "Homepage — hero", label: "Knop 2 (mensen zoeken)", default: "Ik zoek mensen" },

  // ─────────────────────────────────────────────────────────── Trust band
  { key: "trust.label", group: "Homepage — vertrouwensbalk", label: "Label", default: "Gebouwd op" },

  // ─────────────────────────────────────────────────────────── Hoe het werkt
  { key: "how.eyebrow", group: "Homepage — hoe het werkt", label: "Bovenregel", default: "Hoe het werkt" },
  { key: "how.title", group: "Homepage — hoe het werkt", label: "Titel", default: "Van aanmelding tot uitbetaling in drie stappen" },
  { key: "how.lead", group: "Homepage — hoe het werkt", label: "Introtekst", default: "Geen mailwisselingen, geen losse facturen, geen wachten op je geld.", multiline: true },

  // ─────────────────────────────────────────────────────────── Split: freelancers
  { key: "fl.eyebrow", group: "Homepage — blok freelancers", label: "Bovenregel", default: "Voor freelancers" },
  { key: "fl.title", group: "Homepage — blok freelancers", label: "Titel", default: "Werk dat bij je past. Geld dat op tijd komt." },
  { key: "fl.body", group: "Homepage — blok freelancers", label: "Introtekst", default: "Jij levert vakmanschap. Wij regelen de match, de overeenkomst, de factuur en de uitbetaling.", multiline: true },

  // ─────────────────────────────────────────────────────────── Split: bedrijven
  { key: "emp.eyebrow", group: "Homepage — blok bedrijven", label: "Bovenregel", default: "Voor bedrijven" },
  { key: "emp.title", group: "Homepage — blok bedrijven", label: "Titel", default: "Betrouwbare mensen, precies wanneer je ze nodig hebt." },
  { key: "emp.body", group: "Homepage — blok bedrijven", label: "Introtekst", default: "Zet een dienst uit en ZekerFlex regelt de rest: match, overeenkomst, check-in, facturatie en compliance.", multiline: true },

  // ─────────────────────────────────────────────────────────── Drie werkvormen
  { key: "work.eyebrow", group: "Homepage — drie werkvormen", label: "Bovenregel", default: "Drie manieren om te werken" },
  { key: "work.title", group: "Homepage — drie werkvormen", label: "Titel", default: "Zzp'er, flexwerker — of via ons uitzendbureau" },

  // ─────────────────────────────────────────────────────────── Features
  { key: "feat.eyebrow", group: "Homepage — het platform", label: "Bovenregel", default: "Het platform" },
  { key: "feat.title", group: "Homepage — het platform", label: "Titel", default: "Alles wat flexibel werk betrouwbaar maakt, in één systeem" },

  // ─────────────────────────────────────────────────────────── Compliance
  { key: "comp.eyebrow", group: "Homepage — compliance", label: "Bovenregel", default: "Zeker zit het goed" },
  { key: "comp.title", group: "Homepage — compliance", label: "Titel", default: "Compliance is geen bijzaak — het zit in de kern" },
  { key: "comp.lead", group: "Homepage — compliance", label: "Introtekst", default: "ZekerFlex controleert doorlopend of een samenwerking binnen de regels blijft, en grijpt in vóór het misgaat.", multiline: true },

  // ─────────────────────────────────────────────────────────── Testimonial
  {
    key: "quote.text",
    group: "Homepage — quote",
    label: "Citaat",
    default:
      "Ik plaats 's ochtends een dienst en heb binnen tien minuten een bekende kracht die komt. De uren keur ik 's avonds goed, de factuur staat er automatisch. Zo hoort het.",
    multiline: true,
  },
  { key: "quote.author", group: "Homepage — quote", label: "Naam / functie", default: "Merel — vestigingsmanager, supermarktketen Amsterdam" },

  // ─────────────────────────────────────────────────────────── FAQ
  { key: "faq.eyebrow", group: "Homepage — veelgestelde vragen", label: "Bovenregel", default: "Veelgestelde vragen" },
  { key: "faq.title", group: "Homepage — veelgestelde vragen", label: "Titel", default: "Goed om te weten" },

  // ─────────────────────────────────────────────────────────── Slot-CTA
  { key: "cta.title", group: "Homepage — slot-oproep", label: "Titel", default: "Klaar om zeker te werken?" },
  { key: "cta.lead", group: "Homepage — slot-oproep", label: "Introtekst", default: "Maak in een paar minuten een account aan. Gratis voor freelancers, geen opstartkosten voor bedrijven.", multiline: true },
  { key: "cta.primary", group: "Homepage — slot-oproep", label: "Knop 1", default: "Account aanmaken" },
  { key: "cta.secondary", group: "Homepage — slot-oproep", label: "Knop 2", default: "Bekijk de prijzen" },

  // ─────────────────────────────────────────────────────────── Voor bedrijven (/voor-bedrijven)
  { key: "vb.eyebrow", group: "Voor bedrijven — hero", label: "Bovenregel", default: "Voor bedrijven" },
  { key: "vb.title", group: "Voor bedrijven — hero", label: "Titel", default: "Betrouwbare mensen, precies wanneer je ze nodig hebt." },
  { key: "vb.lead", group: "Voor bedrijven — hero", label: "Introtekst", default: "Zet een dienst uit en ZekerFlex regelt de rest: de match, de overeenkomst, de check-in, de facturatie en de compliance.", multiline: true },
  { key: "vb.cta1", group: "Voor bedrijven — hero", label: "Knop 1", default: "Organisatie aanmelden" },
  { key: "vb.cta2", group: "Voor bedrijven — hero", label: "Knop 2", default: "Bekijk de prijzen" },
  { key: "vb.sys.eyebrow", group: "Voor bedrijven — secties", label: "Het systeem: bovenregel", default: "Het systeem" },
  { key: "vb.sys.title", group: "Voor bedrijven — secties", label: "Het systeem: titel", default: "Van dienst uitzetten tot factuur — één doorlopend proces" },
  { key: "vb.tools.eyebrow", group: "Voor bedrijven — secties", label: "Rekentools: bovenregel", default: "Reken het zelf uit" },
  { key: "vb.tools.title", group: "Voor bedrijven — secties", label: "Rekentools: titel", default: "Twee gratis rekentools voor werkgevers" },
  { key: "vb.tools.intro", group: "Voor bedrijven — secties", label: "Rekentools: introtekst", default: "Zonder account, en alles wordt in je eigen browser berekend." },
  { key: "vb.faq.eyebrow", group: "Voor bedrijven — secties", label: "Vragen: bovenregel", default: "Veelgestelde vragen" },
  { key: "vb.faq.title", group: "Voor bedrijven — secties", label: "Vragen: titel", default: "Goed om te weten" },
  { key: "vb.cta.title", group: "Voor bedrijven — slot-oproep", label: "Titel", default: "Zet vandaag je eerste dienst uit" },
  { key: "vb.cta.body", group: "Voor bedrijven — slot-oproep", label: "Tekst", default: "Meld je organisatie aan, richt je vestigingen in en nodig je managers uit. Binnen een uur operationeel.", multiline: true },
  { key: "vb.cta.primary", group: "Voor bedrijven — slot-oproep", label: "Knop 1", default: "Organisatie aanmelden" },
  { key: "vb.cta.secondary", group: "Voor bedrijven — slot-oproep", label: "Knop 2", default: "Voor freelancers" },

  // ─────────────────────────────────────────────────────────── Voor freelancers (/voor-freelancers)
  { key: "vf.eyebrow", group: "Voor freelancers — hero", label: "Bovenregel", default: "Voor freelancers" },
  { key: "vf.title", group: "Voor freelancers — hero", label: "Titel", default: "Werk dat bij je past. Geld dat op tijd komt." },
  { key: "vf.lead", group: "Voor freelancers — hero", label: "Introtekst", default: "Jij levert vakmanschap. Wij regelen de match, de overeenkomst, de factuur en de uitbetaling — zodat jij je op je werk kunt richten.", multiline: true },
  { key: "vf.cta1", group: "Voor freelancers — hero", label: "Knop 1", default: "Maak je profiel aan" },
  { key: "vf.cta2", group: "Voor freelancers — hero", label: "Knop 2", default: "Bekijk de voorwaarden" },
  { key: "vf.got.eyebrow", group: "Voor freelancers — secties", label: "Wat je krijgt: bovenregel", default: "Wat je krijgt" },
  { key: "vf.got.title", group: "Voor freelancers — secties", label: "Wat je krijgt: titel", default: "Alles geregeld, behalve het werk zelf" },
  { key: "vf.how.eyebrow", group: "Voor freelancers — secties", label: "Zo werkt het: bovenregel", default: "Zo werkt het" },
  { key: "vf.how.title", group: "Voor freelancers — secties", label: "Zo werkt het: titel", default: "Van aanmelding tot eerste uitbetaling" },
  { key: "vf.faq.eyebrow", group: "Voor freelancers — secties", label: "Vragen: bovenregel", default: "Veelgestelde vragen" },
  { key: "vf.faq.title", group: "Voor freelancers — secties", label: "Vragen: titel", default: "Goed om te weten" },
  { key: "vf.cta.title", group: "Voor freelancers — slot-oproep", label: "Titel", default: "Klaar om aan de slag te gaan?" },
  { key: "vf.cta.body", group: "Voor freelancers — slot-oproep", label: "Tekst", default: "Je profiel staat in een paar minuten. Gratis, geen verplichtingen.", multiline: true },
  { key: "vf.cta.primary", group: "Voor freelancers — slot-oproep", label: "Knop 1", default: "Profiel aanmaken" },
  { key: "vf.cta.secondary", group: "Voor freelancers — slot-oproep", label: "Knop 2", default: "Voor bedrijven" },

  // ─────────────────────────────────────────────────────────── Prijzen (/prijzen)
  // Alleen tekst: de bedragen en de staffel komen uit lib/pricing/tiers.ts en zijn hier niet te wijzigen.
  { key: "pr.eyebrow", group: "Prijzen — hero", label: "Bovenregel", default: "Prijzen" },
  { key: "pr.title", group: "Prijzen — hero", label: "Titel", default: "Eerlijk en voorspelbaar" },
  { key: "pr.lead", group: "Prijzen — hero", label: "Introtekst", default: "Geen abonnement. Je betaalt alleen voor daadwerkelijk gewerkte uren; bij meer uren daalt je platformfee volgens een vaste, vooraf zichtbare staffel.", multiline: true },
  { key: "pr.fl.label", group: "Prijzen — kaarten", label: "Kaart freelancers: bovenregel", default: "Freelancers" },
  { key: "pr.fl.sub", group: "Prijzen — kaarten", label: "Kaart freelancers: onder de prijs", default: "Voor altijd. Meedoen kost je niets." },
  { key: "pr.fl.knop", group: "Prijzen — kaarten", label: "Kaart freelancers: knop", default: "Profiel aanmaken" },
  { key: "pr.bv.label", group: "Prijzen — kaarten", label: "Kaart bedrijven: bovenregel", default: "Bedrijven" },
  { key: "pr.bv.badge", group: "Prijzen — kaarten", label: "Kaart bedrijven: label rechtsboven", default: "Populair" },
  { key: "pr.bv.sub", group: "Prijzen — kaarten", label: "Kaart bedrijven: onder de prijs", default: "Platformkosten per gewerkt uur. Alleen wanneer er iemand werkt — met staffelkorting bij veel uren.", multiline: true },
  { key: "pr.bv.knop", group: "Prijzen — kaarten", label: "Kaart bedrijven: knop", default: "Organisatie aanmelden" },
  { key: "pr.api.eyebrow", group: "Prijzen — secties", label: "API: bovenregel", default: "Los van de klusprijs" },
  { key: "pr.api.title", group: "Prijzen — secties", label: "API: titel", default: "API-toegang voor ontwikkelaars" },
  { key: "pr.api.intro", group: "Prijzen — secties", label: "API: introtekst", default: "Een eigen systeem koppelen aan ZekerFlex (diensten lezen/aanmaken, uren ophalen, webhooks) is een los product met eigen abonnementen — de klusprijs hierboven blijft ongewijzigd.", multiline: true },
  { key: "pr.api.knop", group: "Prijzen — secties", label: "API: knop", default: "Bekijk API-abonnementen" },
  { key: "pr.faq.eyebrow", group: "Prijzen — secties", label: "Vragen: bovenregel", default: "Veelgestelde vragen" },
  { key: "pr.faq.title", group: "Prijzen — secties", label: "Vragen: titel", default: "Over de kosten" },
  { key: "pr.cta.title", group: "Prijzen — slot-oproep", label: "Titel", default: "Begin vandaag" },
  { key: "pr.cta.body", group: "Prijzen — slot-oproep", label: "Tekst", default: "Aanmelden is gratis en kost een paar minuten. Je zit nergens aan vast.", multiline: true },
  { key: "pr.cta.primary", group: "Prijzen — slot-oproep", label: "Knop 1", default: "Account aanmaken" },
  { key: "pr.cta.secondary", group: "Prijzen — slot-oproep", label: "Knop 2", default: "Voor bedrijven" },

  // ─────────────────────────────────────────────────────────── Over ons (/over-ons)
  { key: "oo.eyebrow", group: "Over ons — hero", label: "Bovenregel", default: "Over ons" },
  { key: "oo.title", group: "Over ons — hero", label: "Titel", default: "Flexibel werk hoort eerlijk, snel en zeker te zijn." },
  {
    key: "oo.verhaal1",
    group: "Over ons — ons verhaal",
    label: "Alinea 1",
    default:
      "ZekerFlex is ontstaan uit een simpele frustratie: flexibel werken in Nederland is omslachtig geworden. Zzp'ers wachten weken op hun geld en verdrinken in facturen. Werkgevers puzzelen met bezetting en lopen risico op de Wet DBA. En tussen beide partijen staat een groeiend aantal bemiddelaars die vooral zichzelf bedienen.",
    multiline: true,
  },
  {
    key: "oo.verhaal2",
    group: "Over ons — ons verhaal",
    label: "Alinea 2",
    default:
      "Wij bouwen het alternatief: één systeem dat de match maakt, de overeenkomst regelt, de uren verwerkt, de facturen opstelt en de uitbetaling laat kiezen — met compliance ingebouwd in plaats van erbij bedacht.",
    multiline: true,
  },
  {
    key: "oo.verhaal3",
    group: "Over ons — ons verhaal",
    label: "Alinea 3",
    default:
      "We bouwen ZekerFlex voor de Nederlandse arbeidsmarkt. Voor hosting, betalingen, e-mail en identiteitscontroles werken we met gespecialiseerde dienstverleners. Onze AI-assistent kan draaien op een eigen modelserver. We leggen in ons privacybeleid uit welke gegevens we gebruiken en met wie we die delen.",
    multiline: true,
  },
  { key: "oo.opr.eyebrow", group: "Over ons — de oprichter", label: "Bovenregel", default: "De oprichter" },
  { key: "oo.opr.title", group: "Over ons — de oprichter", label: "Titel", default: "Gebouwd door één persoon" },
  {
    key: "oo.opr.tekst",
    group: "Over ons — de oprichter",
    label: "Tweede alinea (de eerste, met de naam, staat vast)",
    default:
      "De overtuiging erachter is nuchter: flexibel werk hoort voor iedereen bereikbaar te zijn. Of je nu studeert, er een baan naast hebt, of je leven even anders loopt — je moet er werk bij kunnen pakken dat zich voegt naar jóuw agenda, snel uitbetaalt en je niet opzadelt met rompslomp. Dat is waar ZekerFlex voor is gebouwd: werk dat meebeweegt met je leven, niet andersom.",
    multiline: true,
  },
  { key: "oo.punten.eyebrow", group: "Over ons — secties", label: "Uitgangspunten: bovenregel", default: "Waar we voor staan" },
  { key: "oo.punten.title", group: "Over ons — secties", label: "Uitgangspunten: titel", default: "Drie uitgangspunten" },
  { key: "oo.werk.eyebrow", group: "Over ons — secties", label: "Werken bij ons: bovenregel", default: "Werken bij ons" },
  { key: "oo.werk.title", group: "Over ons — secties", label: "Werken bij ons: titel", default: "Bouw mee aan ZekerFlex" },
  {
    key: "oo.werk.intro",
    group: "Over ons — secties",
    label: "Werken bij ons: introtekst",
    default: "We hebben niet altijd een vacature openstaan, maar goede mensen zijn altijd welkom. Stuur een open sollicitatie — vertel wat je meebrengt en waar je energie van krijgt.",
    multiline: true,
  },
  { key: "oo.cta.title", group: "Over ons — slot-oproep", label: "Titel", default: "Doe mee" },
  { key: "oo.cta.body", group: "Over ons — slot-oproep", label: "Tekst", default: "Als freelancer of als werkgever — aanmelden is gratis.", multiline: true },
  { key: "oo.cta.primary", group: "Over ons — slot-oproep", label: "Knop 1", default: "Account aanmaken" },
  { key: "oo.cta.secondary", group: "Over ons — slot-oproep", label: "Knop 2", default: "Voor bedrijven" },
];

/** Alle sleutels van één groep-voorvoegsel (bv. "vb." voor /voor-bedrijven), voor getContentMap op die pagina. */
export const contentKeys = (prefix: string) => CONTENT_REGISTRY.filter((c) => c.key.startsWith(prefix)).map((c) => c.key);

const KEY = "content:overrides";
type Overrides = Record<string, string>;

function publicValue(key: string, value: string | undefined): string {
  const fallback = defaultFor(key);
  if (!value) return fallback;

  // Older CMS overrides can outlive a copy correction in the registry. Avoid
  // continuing to publish the specific hosting and DBA guarantees we removed.
  if (
    (key === "hero.eyebrow" && /lokaal gehost|100%.*nederland/i.test(value)) ||
    (key === "hero.lead" && /wet dba.?proof|goedgekeurde modelovereenkomst|volledig in nederland gehost/i.test(value))
  ) {
    return fallback;
  }

  return value;
}

export async function getContentOverrides(): Promise<Overrides> {
  return (await kvGet<Overrides>(KEY).catch(() => null)) ?? {};
}

const defaultFor = (key: string) => CONTENT_REGISTRY.find((c) => c.key === key)?.default ?? "";

/** Alle geregistreerde teksten met de huidige waarde (override of standaard). */
export async function getContentValues(): Promise<Record<string, string>> {
  const o = await getContentOverrides();
  const out: Record<string, string> = {};
  for (const c of CONTENT_REGISTRY) out[c.key] = publicValue(c.key, o[c.key]);
  return out;
}

/** Alleen de gevraagde sleutels (voor een pagina). */
export async function getContentMap(keys: string[]): Promise<Record<string, string>> {
  const o = await getContentOverrides();
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = publicValue(k, o[k]);
  return out;
}

export async function setContent(key: string, value: string): Promise<void> {
  if (!CONTENT_REGISTRY.some((c) => c.key === key)) return;
  const o = await getContentOverrides();
  const trimmed = value.trim();
  if (!trimmed || trimmed === defaultFor(key)) delete o[key];
  else o[key] = trimmed.slice(0, 2000);
  await kvSet(KEY, o);
}
