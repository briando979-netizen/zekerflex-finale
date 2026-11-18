import { SOORTEN, type GebeurtenisSoort } from "@/lib/ops/gebeurtenis";

// Het dagrapport en de "wacht op jou"-lijst voor de telefoon van de eigenaar (18 nov 2026). Puur bestand: de gegevens komen uit
// lib/ops/dagrapport.ts. Alleen aantallen en soorten, nooit namen (de lijst van wat op een mens wacht staat in Beheer, Te doen).

/** Een groep dingen die op een mens wacht, bijvoorbeeld "3× Uren". */
export interface WachtGroep {
  /** wat het is: "Uren", "KYC", "AI-voorstellen" */
  soort: string;
  aantal: number;
  /** staat er iets bij dat dringend is (hoge ernst) */
  urgent: boolean;
  /** wacht er iets al langer dan 24 uur */
  oud: boolean;
}

export const euro = (cents: number): string => `€ ${(cents / 100).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Is dit moment meer dan `uren` uur geleden? Een kapotte datum telt als niet oud. */
export function ouderDan(atIso: string, nu: Date, uren: number): boolean {
  const t = Date.parse(atIso);
  return Number.isFinite(t) && nu.getTime() - t > uren * 3_600_000;
}

/** Zet losse items (met soort, ernst en tijd) om in groepen per soort, de dringendste eerst. */
export function groepeerWacht(items: { soort: string; urgent: boolean; at: string }[], nu: Date): WachtGroep[] {
  const per = new Map<string, WachtGroep>();
  for (const i of items) {
    const g = per.get(i.soort) ?? { soort: i.soort, aantal: 0, urgent: false, oud: false };
    g.aantal += 1;
    g.urgent ||= i.urgent;
    g.oud ||= ouderDan(i.at, nu, 24);
    per.set(i.soort, g);
  }
  return [...per.values()].sort((a, b) => Number(b.urgent) - Number(a.urgent) || Number(b.oud) - Number(a.oud) || b.aantal - a.aantal || a.soort.localeCompare(b.soort));
}

const regel = (g: WachtGroep): string => `${g.urgent ? "🔴" : g.oud ? "🟠" : "•"} ${g.aantal}× ${g.soort}${g.oud ? " (al langer dan 24 uur)" : ""}`;

export interface DagrapportInvoer {
  /** bijvoorbeeld "woensdag 18 november" */
  datum: string;
  /** aantal gebeurtenissen vandaag per soort (uit het logboek van de melder) */
  telling: Partial<Record<GebeurtenisSoort, number>>;
  bestellingen: { aantal: number; totaalCents: number };
  wacht: WachtGroep[];
  basisUrl: string;
}

/** Het dagrapport van 's avonds. Slaat soorten zonder gebeurtenissen over; een rustige dag krijgt dat als zin. */
export function dagrapportTekst(inv: DagrapportInvoer): string {
  const regels: string[] = [`🌙 ZekerFlex, dagrapport van ${inv.datum}`];
  const volgorde: GebeurtenisSoort[] = ["werker-aangemeld", "bedrijf-aangemeld", "klus", "demo", "marketing", "account-verwijderd", "mail", "assistent", "chat"];
  let iets = false;
  for (const soort of volgorde) {
    const n = inv.telling[soort] ?? 0;
    if (n > 0) {
      regels.push(`${SOORTEN[soort].icoon} ${SOORTEN[soort].label}: ${n}`);
      iets = true;
    }
  }
  if (inv.bestellingen.aantal > 0) {
    regels.push(`🛒 Webshop: ${inv.bestellingen.aantal} betaald, samen ${euro(inv.bestellingen.totaalCents)}`);
    iets = true;
  }
  if (!iets) regels.push("Een rustige dag: er is niets automatisch gedaan wat gemeld hoeft te worden.");
  if (inv.wacht.length > 0) {
    regels.push("⏳ Wacht op jou:");
    for (const g of inv.wacht.slice(0, 6)) regels.push(`  ${regel(g)}`);
  } else {
    regels.push("✅ Er wacht niets op jou.");
  }
  regels.push(`Alles bekijken: ${inv.basisUrl.replace(/\/+$/, "")}/admin/automatisch`);
  return regels.join("\n");
}

/**
 * De ochtendlijst: alleen als er iets dringends is of iets al langer dan 24 uur wacht (de herinnering). Anders null: geen bericht
 * om niets.
 */
export function wachtOpJouTekst(wacht: WachtGroep[], basisUrl: string): string | null {
  const belangrijk = wacht.filter((g) => g.urgent || g.oud);
  if (belangrijk.length === 0) return null;
  const regels = [`⏳ ZekerFlex: dit wacht op jou (${wacht.reduce((s, g) => s + g.aantal, 0)} in totaal)`];
  for (const g of belangrijk.slice(0, 6)) regels.push(regel(g));
  regels.push(`Te doen: ${basisUrl.replace(/\/+$/, "")}/admin/te-doen`);
  return regels.join("\n");
}
