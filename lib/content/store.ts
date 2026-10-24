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
  multiline?: boolean;
}

export const CONTENT_REGISTRY: ContentItem[] = [
  { key: "hero.eyebrow", label: "Homepage hero — bovenregel", default: "Nederlands · onafhankelijk · lokaal gehost" },
  { key: "hero.titleLine1", label: "Homepage hero — titel regel 1", default: "Zeker van je werk." },
  { key: "hero.titleLine2", label: "Homepage hero — titel regel 2 (accent)", default: "Zeker van je mensen." },
  {
    key: "hero.lead",
    label: "Homepage hero — introtekst",
    default:
      "Het platform waar werknemers en werkgevers elkaar vinden. Slim gematcht op reistijd en vakmanschap, met de optie om dezelfde dag uitbetaald te worden, en volledig Wet DBA-proof — zonder tussenpartijen.",
    multiline: true,
  },
  { key: "hero.ctaPrimary", label: "Homepage hero — knop 1 (werk zoeken)", default: "Ik zoek werk" },
  { key: "hero.ctaSecondary", label: "Homepage hero — knop 2 (mensen zoeken)", default: "Ik zoek mensen" },
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
