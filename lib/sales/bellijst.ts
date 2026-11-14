import { amsterdamParts, amsterdamToUtc } from "@/lib/time/amsterdam";
import { PRIJS_ZIN } from "@/lib/sales/prompts";

// ---------------------------------------------------------------------------
// De bellijst in Beheer → Sales (14 nov 2026, taak van 9d). Gemeten: van de 35 OpenStreetMap-leads heeft er 0 een
// e-mailadres maar 6 een telefoon, en 27 scoren 55 of hoger; de motor mailt ze dus nooit. De eigenaar belt ze zelf:
// hier staat wie op de lijst komt, in welke volgorde, wat hij kan zeggen, en wat een uitkomst betekent. Wij bellen
// niemand zelf. Puur (geen prisma of kv): de server en de tests gebruiken hetzelfde.
// ---------------------------------------------------------------------------

export const BEL_MIN_SCORE = 55;

export const BEL_UITKOMSTEN = [
  { id: "geen-gehoor", label: "Geen gehoor" },
  { id: "terugbellen", label: "Terugbellen" },
  { id: "interesse", label: "Interesse" },
  { id: "geen-interesse", label: "Geen interesse" },
] as const;
export type BelUitkomst = (typeof BEL_UITKOMSTEN)[number]["id"];
export const isBelUitkomst = (v: unknown): v is BelUitkomst => typeof v === "string" && BEL_UITKOMSTEN.some((u) => u.id === v);
export const belLabel = (u: BelUitkomst): string => BEL_UITKOMSTEN.find((x) => x.id === u)?.label ?? u;

/** Na een reactie of als de lead af is, hoort hij niet meer op de bellijst. */
export const BEL_KLAAR = ["REPLIED", "WON", "LOST", "DISQUALIFIED", "BOUNCED", "UNSUBSCRIBED"] as const;

/** De belstand van één lead (KV "sales-bel:<leadId>"): hoe vaak gebeld, de laatste uitkomst, en een afgesproken moment. */
export interface BelStand {
  pogingen: number;
  laatste?: { at: string; uitkomst: BelUitkomst } | undefined;
  /** alleen na "terugbellen": tot dan staat de lead niet op de lijst */
  terugbellenOp?: string | undefined;
}

/** Eén regel op de bellijst zoals het scherm hem krijgt (GET /api/admin/sales/bellijst). */
export interface BelRegel {
  id: string;
  companyName: string;
  city: string | null;
  sector: string | null;
  score: number | null;
  waarom: string;
  telefoon: string;
  telHref: string | null;
  heeftMail: boolean;
  status: string;
  pogingen: number;
  laatste: { at: string; uitkomst: BelUitkomst; label: string } | null;
  terugbellenOp: string | null;
  createdAt: string;
}

export interface BelLeadFeiten {
  status: string;
  score: number | null;
  contactPhone: string | null;
  suppressed: boolean;
}

export function heeftTelefoon(phone: string | null | undefined): boolean {
  return (phone ?? "").replace(/\D/g, "").length >= 9;
}

/** Hoort deze lead nu op de bellijst? Een telefoon, score ≥ 55, nog geen reactie, niet onderdrukt en niet op de niet-bellen-lijst. */
export function opBelLijst(l: BelLeadFeiten, stand: BelStand | null, nu: Date, nietBellen = false): boolean {
  if (nietBellen || l.suppressed || (BEL_KLAAR as readonly string[]).includes(l.status)) return false;
  if (!heeftTelefoon(l.contactPhone) || (l.score ?? 0) < BEL_MIN_SCORE) return false;
  return !(stand?.terugbellenOp && Date.parse(stand.terugbellenOp) > nu.getTime());
}

/**
 * De volgorde: eerst een afgesproken terugbelmoment dat nu is (vroegste eerst), dan wie nog nooit gebeld is (oudste lead
 * eerst), dan "geen gehoor" (het langst geleden eerst).
 */
export function belRang(createdAt: Date, stand: BelStand | null): [number, number] {
  if (stand?.terugbellenOp) return [0, Date.parse(stand.terugbellenOp)];
  if (!stand?.laatste) return [1, createdAt.getTime()];
  return [2, Date.parse(stand.laatste.at)];
}
export const vergelijkBelRang = (a: [number, number], b: [number, number]): number => a[0] - b[0] || a[1] - b[1];

/** Terugbellen: de volgende werkdag om 10:00 in Amsterdam (de server draait in UTC). */
export function volgendeWerkdag10(nu: Date): Date {
  const p = amsterdamParts(nu);
  for (let n = 1; n <= 7; n++) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) return amsterdamToUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 10, 0);
  }
  return new Date(nu.getTime() + 86_400_000);
}

/** Een tel:-link (+31…); null als het nummer niet te bellen is. */
export function telHref(phone: string | null | undefined): string | null {
  let n = (phone ?? "").trim().replace(/[^\d+]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  if (n.startsWith("0")) n = `+31${n.slice(1)}`;
  if (n && !n.startsWith("+")) n = `+${n}`;
  return /^\+\d{9,15}$/.test(n) ? `tel:${n}` : null;
}

const BRON: Record<string, string> = {
  manual: "handmatig toegevoegd",
  kvkbase: "KVK-import",
  careers: "vacaturepagina",
  import: "import",
  openstreetmap: "OpenStreetMap",
  "field-visit": "bedrijfsbezoek",
  "demo-request": "demo-aanvraag",
  "offerte-inbound": "offerte-aanvraag",
  "sales-ai": "sales-AI",
};

/** Waarom deze lead past: het vacaturesignaal als dat er is, anders de bron en de reden van de score. */
export function waaromPast(l: { vacancySignal: string | null; source: string; scoreRationale: string | null }): string {
  const signaal = l.vacancySignal?.trim();
  if (signaal) return `Vacature: ${signaal}`.slice(0, 220);
  const bron = Object.hasOwn(BRON, l.source) ? BRON[l.source] : l.source;
  return [`Bron: ${bron}`, l.scoreRationale?.trim()].filter(Boolean).join(" · ").slice(0, 260);
}

const twee = (n: number) => String(n).padStart(2, "0");

/** De regel die bij de notities van de lead komt: "[14-11 13:05] Gebeld: geen gehoor. <notitie>". */
export function belNotitie(uitkomst: BelUitkomst, nu: Date, notitie?: string | undefined): string {
  const p = amsterdamParts(nu);
  const extra = notitie?.trim() ? ` ${notitie.trim().slice(0, 300)}` : "";
  return `[${twee(p.day)}-${twee(p.month)} ${twee(p.hour)}:${twee(p.minute)}] Gebeld: ${belLabel(uitkomst).toLowerCase()}.${extra}`;
}

/** Voeg een regel toe aan de notities; de oudste regels vallen weg boven 4000 tekens. */
export function voegNotitieToe(notes: string | null, regel: string): string {
  const samen = notes?.trim() ? `${notes.trim()}\n${regel}` : regel;
  return samen.length > 4000 ? samen.slice(samen.length - 4000) : samen;
}

/** Wat de beller nooit mag beloven (lib/sales/prompts.ts, AGENTS.md: alleen wat nu echt kan). */
export const NIET_BELOVEN =
  "Niet beloven: een bankrekening of tegoed bij ZekerFlex, een voorschot, snelle of directe uitbetaling, online betalen met een kaart of een verzekering. Noem geen aantallen werkers, klanten of resultaten.";

/** Een kort belscript in gewoon Nederlands (u-vorm). De prijs komt uit lib/pricing/tiers.ts via PRIJS_ZIN. */
export function belScript(): string[] {
  return [
    "Goedendag, u spreekt met [uw naam] van ZekerFlex. Spreek ik met iemand die over personeel gaat?",
    "Ik bel kort omdat [waarom hij past, zie hieronder bij de lead]. Heeft u twee minuten?",
    "ZekerFlex is een Nederlands platform voor flexwerk. U zet een dienst uit en zzp'ers en uitzendkrachten uit de buurt kunnen reageren. Hoeveel reacties u krijgt, hangt af van wie er beschikbaar is.",
    "De uren keurt u goed in ZekerFlex; de factuur volgt vanzelf en u betaalt per bankoverschrijving.",
    `Kosten: ${PRIJS_ZIN}`,
    "Mag ik u een korte uitleg mailen, of zal ik op een ander moment terugbellen? Wilt u liever niet meer gebeld worden, dan noteer ik dat meteen.",
  ];
}
