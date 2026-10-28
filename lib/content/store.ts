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
  { key: "hero.eyebrow", group: "Homepage — hero", label: "Bovenregel", default: "Flexwerk in Nederland · helder geregeld" },
  { key: "hero.titleLine1", group: "Homepage — hero", label: "Titel regel 1", default: "Zeker van je werk." },
  { key: "hero.titleLine2", group: "Homepage — hero", label: "Titel regel 2 (accent)", default: "Zeker van je mensen." },
  {
    key: "hero.lead",
    group: "Homepage — hero",
    label: "Introtekst",
    default:
      "Het platform waar werknemers en werkgevers elkaar vinden. Slim gematcht op reistijd en vakmanschap, met de optie om dezelfde dag uitbetaald te worden, en volledig Wet DBA-proof — zonder tussenpartijen.",
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
];

const KEY = "content:overrides";
type Overrides = Record<string, string>;

export async function getContentOverrides(): Promise<Overrides> {
  return (await kvGet<Overrides>(KEY).catch(() => null)) ?? {};
}

const defaultFor = (key: string) => CONTENT_REGISTRY.find((c) => c.key === key)?.default ?? "";

/** Alle geregistreerde teksten met de huidige waarde (override of standaard). */
export async function getContentValues(): Promise<Record<string, string>> {
  const o = await getContentOverrides();
  const out: Record<string, string> = {};
  for (const c of CONTENT_REGISTRY) out[c.key] = o[c.key] ?? c.default;
  return out;
}

/** Alleen de gevraagde sleutels (voor een pagina). */
export async function getContentMap(keys: string[]): Promise<Record<string, string>> {
  const o = await getContentOverrides();
  const out: Record<string, string> = {};
  for (const k of keys) out[k] = o[k] ?? defaultFor(k);
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
