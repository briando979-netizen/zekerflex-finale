import { z } from "zod";
import { KANAAL_IDS, type KanaalId } from "@/lib/social/kanalen";

// ---------------------------------------------------------------------------
// Datamodel van het sociale-mediaonderdeel (Admin → Sales & groei → Sociale media). Puur: geen
// prisma, geen kv. Berichten staan als losse KV-regels (`social:post:<id>`); er is geen migratie nodig.
// ---------------------------------------------------------------------------

export type Doelgroep = "werkgever" | "freelancer" | "algemeen";
export type PostBron = "handmatig" | "ai" | "autopilot" | "campagne";
export type PostStatus = "concept" | "gepland" | "gepost" | "deels" | "handmatig" | "mislukt";

/** Wat er op één kanaal met een bericht gebeurde. `wacht` = nog niet aan de beurt. */
export interface KanaalUitslag {
  status: "wacht" | "gepost" | "handmatig" | "mislukt";
  at?: string;
  /** korte, gewone zin; nooit een token of een URL met geheimen */
  fout?: string;
  /** id van het bericht bij het platform, als het via de koppeling is geplaatst */
  extId?: string;
}

export interface SocialPost {
  id: string;
  tekst: string;
  hashtags: string[];
  kanalen: KanaalId[];
  /** https-adres van een beeld (Instagram heeft er altijd een nodig) */
  beeldUrl: string | null;
  /** wat er op het beeld of in de video hoort, als gedachte voor wie het maakt */
  beeldIdee: string;
  /** link naar de site die bij het bericht hoort */
  link: string;
  /** geplande tijd (UTC, ISO) of null */
  plan: string | null;
  /** een mens heeft het bericht goedgekeurd; alleen goedgekeurde berichten gaan automatisch weg */
  goedgekeurd: boolean;
  bron: PostBron;
  doelgroep: Doelgroep;
  campagne: string | null;
  uitslag: Partial<Record<KanaalId, KanaalUitslag>>;
  gemaakt: string;
  gemaaktDoor: string | null;
}

export const kanaalIdSchema = z.enum(KANAAL_IDS);

const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((u) => u === "" || /^https:\/\/[^\s]+$/i.test(u), "Gebruik een adres dat met https:// begint.");

export const postInvoerSchema = z.object({
  tekst: z.string().trim().min(3, "Schrijf eerst een tekst.").max(5000),
  hashtags: z.array(z.string().trim().max(40)).max(20).default([]),
  kanalen: z.array(kanaalIdSchema).min(1, "Kies minstens één kanaal.").max(KANAAL_IDS.length),
  beeldUrl: httpsUrl.default(""),
  beeldIdee: z.string().trim().max(400).default(""),
  link: httpsUrl.default(""),
  plan: z.string().trim().max(40).nullable().default(null),
  doelgroep: z.enum(["werkgever", "freelancer", "algemeen"]).default("algemeen"),
});
export type PostInvoer = z.infer<typeof postInvoerSchema>;

// --- status ---------------------------------------------------------------

/** Eén status voor het hele bericht, afgeleid van wat er per kanaal gebeurde. */
export function postStatus(p: Pick<SocialPost, "kanalen" | "uitslag" | "plan" | "goedgekeurd">): PostStatus {
  const u = p.kanalen.map((k) => p.uitslag[k]?.status ?? "wacht");
  if (u.length === 0) return "concept";
  if (u.every((s) => s === "gepost")) return "gepost";
  if (u.every((s) => s === "gepost" || s === "handmatig") && u.some((s) => s === "handmatig")) return u.some((s) => s === "gepost") ? "deels" : "handmatig";
  if (u.some((s) => s === "mislukt")) return "mislukt";
  if (u.some((s) => s === "gepost")) return "deels";
  return p.goedgekeurd && p.plan ? "gepland" : "concept";
}

export const STATUS_NAAM: Record<PostStatus, string> = {
  concept: "Concept",
  gepland: "Gepland",
  gepost: "Geplaatst",
  deels: "Deels geplaatst",
  handmatig: "Jij plaatst",
  mislukt: "Mislukt",
};

/** Is dit bericht nu aan de beurt om te verwerken? */
export function isAanDeBeurt(p: SocialPost, nu: Date): boolean {
  if (!p.goedgekeurd || !p.plan) return false;
  if (new Date(p.plan).getTime() > nu.getTime()) return false;
  return p.kanalen.some((k) => (p.uitslag[k]?.status ?? "wacht") === "wacht");
}

// --- instellingen ------------------------------------------------------------

export interface KanaalConfig {
  profielUrl: string;
  /** de eigenaar heeft gecontroleerd dat dit echt ons account is */
  bevestigd: boolean;
  notitie: string;
}

export interface AutopilotInstelling {
  aan: boolean;
  perWeek: number;
  doelgroep: Doelgroep;
  kanalen: KanaalId[];
  /** opt-in: de berichten van de autopilot gaan zonder tweede controle weg (standaard uit: een mens keurt goed) */
  zelfPlaatsen: boolean;
  laatsteRun: string | null;
}

export const STANDAARD_AUTOPILOT: AutopilotInstelling = {
  aan: false,
  perWeek: 3,
  doelgroep: "algemeen",
  kanalen: ["instagram", "facebook", "linkedin"],
  zelfPlaatsen: false,
  laatsteRun: null,
};

// --- slots voor een week ------------------------------------------------------

/** Vaste tijden (Amsterdam) waarop een bericht goed valt: ochtend, lunch, begin van de avond. */
export const SLOT_UREN: readonly { uur: number; minuut: number }[] = [
  { uur: 8, minuut: 30 },
  { uur: 12, minuut: 15 },
  { uur: 17, minuut: 30 },
];

/**
 * Werkdagen (ma-vr) als jaar/maand/dag, beginnend bij de eerstvolgende werkdag ná `vanaf`
 * (dagen worden opgeteld met Date.UTC, niet met setDate op een tijdstip).
 */
export function komendeWerkdagen(vanaf: { year: number; month: number; day: number }, aantal: number): { year: number; month: number; day: number }[] {
  const uit: { year: number; month: number; day: number }[] = [];
  for (let n = 1; uit.length < aantal && n < 60; n += 1) {
    const d = new Date(Date.UTC(vanaf.year, vanaf.month - 1, vanaf.day + n));
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    uit.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
  }
  return uit;
}
