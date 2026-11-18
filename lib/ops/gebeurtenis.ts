import { amsterdamParts } from "@/lib/time/amsterdam";

// De melder voor de eigenaar (18 nov 2026): van elke automatische actie (aanmelding, bestelling, klus, demo, verkoopmail,
// uitgaande mail, assistent, chat) komt een regel in het logboek (Admin, Automatisch gedaan) en, naar belang, een bericht
// op de telefoon: direct, of gebundeld in één uurbericht. Puur bestand (geen kv, geen prisma, geen tijd van buiten):
// de opslag en het versturen staan in lib/ops/melder.ts.
//
// Privacy (AVG): een gebeurtenis bevat nooit een naam, e-mailadres, telefoonnummer, gebruikers-id of chatinhoud. De titels
// worden uit onze eigen sjablonen gemaakt, en elke vrije tekst gaat door `zonderContactgegevens`. 30 dagen bewaren.

export type GebeurtenisSoort =
  | "werker-aangemeld"
  | "bedrijf-aangemeld"
  | "account-verwijderd"
  | "bestelling"
  | "klus"
  | "demo"
  | "marketing"
  | "assistent"
  | "chat"
  | "mail"
  | "overig";

export const SOORTEN: Record<GebeurtenisSoort, { label: string; icoon: string }> = {
  "werker-aangemeld": { label: "Nieuwe werkers", icoon: "🧑" },
  "bedrijf-aangemeld": { label: "Nieuwe bedrijven", icoon: "🏢" },
  "account-verwijderd": { label: "Accounts verwijderd", icoon: "🗑️" },
  bestelling: { label: "Webshopbestellingen", icoon: "🛒" },
  klus: { label: "Klussen geplaatst", icoon: "🛠️" },
  demo: { label: "Demo's en afspraken", icoon: "📅" },
  marketing: { label: "Marketing en verkoopmails", icoon: "📣" },
  assistent: { label: "Berichten via de assistent", icoon: "🤖" },
  chat: { label: "Chatberichten", icoon: "💬" },
  mail: { label: "Verstuurde e-mails", icoon: "✉️" },
  overig: { label: "Overig", icoon: "•" },
};

export type Belang = "direct" | "samenvatting";
/** wacht = nog niet gemeld (komt in de eerstvolgende uursamenvatting); direct/samenvatting = zo gemeld */
export type GemeldAls = "wacht" | "direct" | "samenvatting";

export interface NieuweGebeurtenis {
  soort: GebeurtenisSoort;
  /** één regel, zonder contactgegevens (komt ook op de telefoon) */
  titel: string;
  /** alleen voor het logboek in Beheer */
  detail?: string | null;
  /** waar de eigenaar het kan bekijken, bijvoorbeeld /admin/shop */
  url?: string | null;
  belang?: Belang;
}

export interface Gebeurtenis {
  id: string;
  /** ISO-tijd (UTC) */
  at: string;
  soort: GebeurtenisSoort;
  belang: Belang;
  titel: string;
  detail: string | null;
  url: string | null;
  gemeld: GemeldAls;
}

export const BEWAAR_DAGEN = 30;
/** Algemene grens op directe berichten per uur: een golf aanmeldingen of een bug mag de telefoon niet laten ontploffen. */
export const DIRECT_PER_UUR = 30;
export const DIRECT_WERKERS_PER_UUR = 10;
/** Direct alleen overdag (Amsterdam, van 07:00 tot 23:00); 's nachts gaat alles in de eerste samenvatting van de ochtend. */
export const MELD_VANAF_UUR = 7;
export const MELD_TOT_UUR = 23;

export const gebeurtenisSleutel = (g: Pick<Gebeurtenis, "at" | "id">): string => `gebeurtenis:${g.at}-${g.id}`;
export const GEBEURTENIS_VOORVOEGSEL = "gebeurtenis:";

/**
 * Haalt e-mailadressen, telefoonnummers en alles achter een vraagteken in een link weg (een link kan een geheim token zijn)
 * en kapt af. Vangnet voor vrije tekst; de titels zelf komen uit eigen sjablonen.
 */
export function zonderContactgegevens(tekst: string, max = 140): string {
  const schoon = tekst
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[e-mail]")
    .replace(/https?:\/\/[^\s)]+/g, (u) => {
      try {
        return new URL(u).host;
      } catch {
        return "[link]";
      }
    })
    .replace(/\+?\d[\d ()-]{7,}\d/g, (m) => (m.replace(/\D/g, "").length >= 9 && !/^\d{4}-\d{2}-\d{2}/.test(m) ? "[nummer]" : m))
    .replace(/\s+/g, " ")
    .trim();
  return schoon.length > max ? `${schoon.slice(0, max - 1).trimEnd()}…` : schoon;
}

export function maakGebeurtenis(n: NieuweGebeurtenis, now: Date, id: string): Gebeurtenis {
  return {
    id,
    at: now.toISOString(),
    soort: n.soort,
    belang: n.belang ?? "direct",
    titel: zonderContactgegevens(n.titel, 140),
    detail: n.detail ? zonderContactgegevens(n.detail, 400) : null,
    url: n.url && n.url.startsWith("/") ? n.url : null,
    gemeld: "wacht",
  };
}

/** Is het nu tijd om direct te melden (07:00 tot 23:00 Amsterdam)? */
export function binnenMeldtijd(now: Date): boolean {
  const uur = amsterdamParts(now).hour;
  return uur >= MELD_VANAF_UUR && uur < MELD_TOT_UUR;
}

/**
 * Komt deze gebeurtenis in aanmerking voor een direct bericht: belangrijk genoeg en overdag. De grenzen per uur (DIRECT_PER_UUR en
 * DIRECT_WERKERS_PER_UUR) staan in lib/ops/melder.ts als atomaire tellers in Redis (fixedWindow), niet hier: tellen in het logboek
 * ging mis (de 500 nieuwste rijen, eerst kijken en dan doen).
 */
export function magDirect(g: Pick<Gebeurtenis, "belang">, now: Date): boolean {
  return g.belang === "direct" && binnenMeldtijd(now);
}

export const telefoonTekst = (g: Pick<Gebeurtenis, "soort" | "titel">): string => `${SOORTEN[g.soort].icoon} ${g.titel}`;

/**
 * Het uurbericht: per soort het aantal, met per soort de drie meest voorkomende titels. Null als er niets te melden is.
 * `basisUrl` is het adres van het logboek in Beheer.
 */
export function samenvattingTekst(lijst: Pick<Gebeurtenis, "soort" | "titel">[], basisUrl: string): string | null {
  if (lijst.length === 0) return null;
  const perSoort = new Map<GebeurtenisSoort, Map<string, number>>();
  for (const g of lijst) {
    const titels = perSoort.get(g.soort) ?? new Map<string, number>();
    titels.set(g.titel, (titels.get(g.titel) ?? 0) + 1);
    perSoort.set(g.soort, titels);
  }
  const regels: string[] = [`📋 ZekerFlex, automatisch gedaan: ${lijst.length} ${lijst.length === 1 ? "gebeurtenis" : "gebeurtenissen"}`];
  for (const soort of Object.keys(SOORTEN) as GebeurtenisSoort[]) {
    const titels = perSoort.get(soort);
    if (!titels) continue;
    const totaal = [...titels.values()].reduce((s, n) => s + n, 0);
    regels.push(`${SOORTEN[soort].icoon} ${SOORTEN[soort].label}: ${totaal}`);
    const top = [...titels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    for (const [titel, n] of top) regels.push(`  ${n > 1 ? `${n}× ` : ""}${titel}`);
  }
  regels.push(`Alles bekijken: ${basisUrl.replace(/\/+$/, "")}/admin/automatisch`);
  return regels.join("\n");
}

/**
 * Een telefoonnummer zoals de eigenaar het typt (06 12 34 56 78, +31 6 12345678, 0031612345678) naar cijfers met landcode
 * (31612345678), of null als het geen nummer lijkt. Alleen Nederlandse nummers zonder landcode krijgen 31 erbij.
 */
export function normaliseerNummer(invoer: string): string | null {
  let n = invoer.replace(/[\s().-]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  else if (n.startsWith("0")) n = `31${n.slice(1)}`;
  if (!/^\d{9,15}$/.test(n)) return null;
  return n;
}

export const whatsappJid = (nummer: string): string => `${nummer}@s.whatsapp.net`;

/** Telefoonnummer voor in het scherm: +31 6 1234 5678. */
export function toonNummer(nummer: string | null): string {
  if (!nummer) return "niet ingesteld";
  return nummer.startsWith("31") && nummer.length === 11 ? `+31 ${nummer.slice(2, 3)} ${nummer.slice(3, 7)} ${nummer.slice(7)}` : `+${nummer}`;
}

// ---------------------------------------------------------------------------
// AuditLog -> gebeurtenis. recordAudit (lib/audit.ts) roept dit na de commit aan; alleen bekende acties worden gemeld.
// Titels komen uit eigen sjablonen en uit niet-persoonlijke velden van de metadata, nooit uit `summary` (daar staat een
// e-mailadres in).

const veld = (metadata: unknown, sleutel: string): string | null => {
  if (!metadata || typeof metadata !== "object") return null;
  const v = (metadata as Record<string, unknown>)[sleutel];
  return typeof v === "string" && v.length > 0 && v.length <= 40 && /^[\w .-]+$/.test(v) ? v : null;
};

type Gemaakt = NieuweGebeurtenis | null;

const AUDIT: Record<string, (metadata: unknown) => Gemaakt> = {
  "auth.register": (m) =>
    veld(m, "type") === "freelancer"
      ? { soort: "werker-aangemeld", titel: "Nieuwe werker aangemeld", url: "/admin/gebruikers" }
      : { soort: "bedrijf-aangemeld", titel: `Nieuw bedrijf aangemeld${veld(m, "dashboard") ? ` (${veld(m, "dashboard")})` : ""}`, url: "/admin/bedrijven" },
  // aanmelding via Google of Apple: altijd een werker (lib/auth/nextauth.ts)
  "auth.register.oauth": () => ({ soort: "werker-aangemeld", titel: "Nieuwe werker aangemeld", url: "/admin/gebruikers" }),
  "company.verified": () => ({ soort: "bedrijf-aangemeld", titel: "Een bedrijf is geverifieerd", url: "/admin/bedrijven" }),
  "privacy.user.erased": () => ({ soort: "account-verwijderd", titel: "Een account is gewist (AVG)", url: "/admin/gebruikers" }),
  "privacy.deletion.requested": () => ({ soort: "account-verwijderd", titel: "Iemand vroeg om verwijdering van het account", url: "/admin/gebruikers" }),
  "privacy.data_deletion_requested": () => ({ soort: "account-verwijderd", titel: "Iemand vroeg om verwijdering van de gegevens", url: "/admin/gebruikers" }),
  // een aangemaakte bestelling is nog niet betaald (veel afhakers): alleen in het uurbericht; betaald gaat direct
  "shop.order.created": () => ({ soort: "bestelling", titel: "Nieuwe webshopbestelling (nog niet betaald)", url: "/admin/shop", belang: "samenvatting" }),
  "shop.order.paid": () => ({ soort: "bestelling", titel: "Webshopbestelling betaald", url: "/admin/shop" }),
  // de stappen bij de leverancier (CJ) melden beheerders al direct met een push en mail (meldBeheer in lib/shop/cj/bestelling.ts):
  // hier alleen vastleggen en in het uurbericht, anders komt elke stap twee keer binnen
  "shop.order.cj-geplaatst": () => ({ soort: "bestelling", titel: "Bestelling bij de leverancier geplaatst", url: "/admin/shop", belang: "samenvatting" }),
  "shop.order.cj-betaald": () => ({ soort: "bestelling", titel: "Leverancier betaald voor een bestelling", url: "/admin/shop", belang: "samenvatting" }),
  "shop.order.cj-verzonden": () => ({ soort: "bestelling", titel: "Bestelling is verzonden", url: "/admin/shop", belang: "samenvatting" }),
  "shop.order.cj-mislukt": () => ({ soort: "bestelling", titel: "Let op: bestelling bij de leverancier mislukt", url: "/admin/shop", belang: "samenvatting" }),
  "shop.order.cj-betaling-geweigerd": () => ({ soort: "bestelling", titel: "Let op: betaling aan de leverancier geweigerd", url: "/admin/shop", belang: "samenvatting" }),
  "shop.order.oversold": () => ({ soort: "bestelling", titel: "Let op: een product bleek uitverkocht na betaling", url: "/admin/shop" }),
  "shop.order_refunded": () => ({ soort: "bestelling", titel: "Webshopbestelling terugbetaald", url: "/admin/shop" }),
  "shop.order.status_changed": () => ({ soort: "bestelling", titel: "Status van een webshopbestelling gewijzigd", url: "/admin/shop", belang: "samenvatting" }),
  "shift.created": () => ({ soort: "klus", titel: "Nieuwe klus geplaatst", url: "/admin/cockpit" }),
  "api.shift.created": () => ({ soort: "klus", titel: "Nieuwe klus geplaatst via de koppeling (API)", url: "/admin/cockpit" }),
  "newsletter.sent": () => ({ soort: "marketing", titel: "Nieuwsbrief verstuurd", url: "/admin/nieuwsbrief" }),
  "sales.outreach.sent": () => ({ soort: "marketing", titel: "Verkoopmail verstuurd", url: "/admin/sales", belang: "samenvatting" }),
  "sales.outreach.drafted": () => ({ soort: "marketing", titel: "Verkoopmail klaargezet als concept", url: "/admin/sales", belang: "samenvatting" }),
  "sales.lead.replied": () => ({ soort: "marketing", titel: "Een bedrijf reageerde op een verkoopmail", url: "/admin/sales" }),
  "sales.campaign.activated": () => ({ soort: "marketing", titel: "Een verkoopcampagne is actief gezet", url: "/admin/sales" }),
  "sales.campaign.paused": () => ({ soort: "marketing", titel: "Een verkoopcampagne is gepauzeerd", url: "/admin/sales" }),
  "sales.campaign.mode": () => ({ soort: "marketing", titel: "De stand van een verkoopcampagne is gewijzigd", url: "/admin/sales" }),
  "sales.engine.paused": () => ({ soort: "marketing", titel: "De verkoopmotor is gepauzeerd", url: "/admin/sales" }),
  "sales.engine.resumed": () => ({ soort: "marketing", titel: "De verkoopmotor draait weer", url: "/admin/sales" }),
};

/**
 * De gebeurtenis bij een audit-actie, of null als die niet gemeld wordt. Een actie met `metadata.test === true` (een testaccount
 * met een .test-adres, zoals het voorbeeldaccount en de livetests) wordt nooit gemeld.
 */
export function auditNaarGebeurtenis(action: string, metadata: unknown): Gemaakt {
  if (!Object.hasOwn(AUDIT, action)) return null;
  if (metadata && typeof metadata === "object" && (metadata as Record<string, unknown>).test === true) return null;
  return (AUDIT[action] as (m: unknown) => Gemaakt)(metadata);
}

export const GEMELDE_AUDIT_ACTIES: string[] = Object.keys(AUDIT);
