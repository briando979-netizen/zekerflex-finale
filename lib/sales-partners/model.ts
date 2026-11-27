import { amsterdamDayKey, amsterdamToUtc } from "@/lib/time/amsterdam";

// ---------------------------------------------------------------------------
// Sales partners (recruiters op commissie, 27 nov 2026, opdracht van de eigenaar). Puur: geen database, geen KV, zodat
// de tests en de schermen dezelfde rekenregels gebruiken. Een sales partner registreert bedrijven; per bedrijf kiest hij
// verplicht één model:
//   Model A: € 1,00 per gewerkt uur, de eerste 6 maanden (vanaf de eerste gewerkte dienst van dat bedrijf)
//   Model B: € 100,00 eenmalig, zodra dat bedrijf 40 betaalde uren heeft
// "Gewerkt" = goedgekeurde uren (Timesheet APPROVED of PAID). "Betaald" = de platformfactuur van die dienst is betaald, of
// was € 0 (de gratis eerste maand). Alleen diensten vanaf de dag dat de partner het bedrijf registreerde tellen mee.
// Bedragen zijn excl. btw; de partner stuurt zelf zijn zzp-factuur. Opslag: lib/sales-partners/store.ts (KV, geen migratie).
// ---------------------------------------------------------------------------

export type PartnerModel = "A" | "B";

export const MODEL_A = { centsPerUur: 100, maanden: 6 } as const;
export const MODEL_B = { bonusCents: 10_000, naBetaaldeUren: 40 } as const;

export const MODEL_LABEL: Record<PartnerModel, string> = {
  A: "Model A: € 1,00 per gewerkt uur (eerste 6 maanden)",
  B: "Model B: € 100,00 eenmalige bonus (na 40 betaalde uren)",
};
export const MODEL_KORT: Record<PartnerModel, string> = { A: "A: € 1,00 per uur", B: "B: € 100 bonus" };

/** zoveel bedrijven per partner (een rem op een volgelopen sleutel, ruim boven wat een mens registreert) */
export const MAX_BEDRIJVEN = 500;

export interface PartnerBedrijf {
  id: string;
  bedrijfsnaam: string;
  kvk: string | null;
  contactnaam: string;
  email: string;
  telefoon: string;
  model: PartnerModel;
  /** ISO; vanaf deze dag tellen de uren van dit bedrijf mee */
  aangemaaktOp: string;
  /** het bedrijfsaccount op ZekerFlex waaraan het beheer deze registratie koppelde */
  tenantId: string | null;
  tenantNaam: string | null;
  gekoppeldOp: string | null;
  afgewezenOp: string | null;
  afwijsReden: string | null;
}

export type BedrijfStatus = "geregistreerd" | "aangemeld" | "actief" | "afgewezen";
export const STATUS_LABEL: Record<BedrijfStatus, string> = {
  geregistreerd: "Geregistreerd",
  aangemeld: "Aangemeld",
  actief: "Actief",
  afgewezen: "Afgewezen",
};
export const STATUS_UITLEG: Record<BedrijfStatus, string> = {
  geregistreerd: "Door jou ingevoerd. ZekerFlex koppelt het aan een bedrijfsaccount zodra het bedrijf zich aanmeldt.",
  aangemeld: "Het bedrijf heeft een account op ZekerFlex. Nog geen gewerkte uren.",
  actief: "Er zijn uren gewerkt bij dit bedrijf.",
  afgewezen: "Niet goedgekeurd door ZekerFlex.",
};

/** Eén goedgekeurde dienst van een bedrijf. */
export interface Dienst {
  tenantId: string;
  /** ISO, het geplande begin (de dag waarop gewerkt is) */
  start: string;
  minuten: number;
  betaald: boolean;
}

export interface MaandRegel {
  minuten: number;
  betaaldeMinuten: number;
  verdiendCents: number;
  uitbetaalbaarCents: number;
}

export interface BedrijfUitkomst {
  status: BedrijfStatus;
  minuten: number;
  betaaldeMinuten: number;
  verdiendCents: number;
  uitbetaalbaarCents: number;
  eersteDienst: string | null;
  /** model A: het einde (exclusief) van de zes maanden; anders null */
  modelAEinde: string | null;
  /** per maand ("2026-11", Amsterdamse tijd) */
  perMaand: Record<string, MaandRegel>;
}

/** "2026-11" voor een tijdstip, in Amsterdamse tijd (de server draait in UTC). */
export const maandVan = (iso: string | Date): string => amsterdamDayKey(iso).slice(0, 7);

/** Het einde (exclusief) van de zes maanden van model A: dezelfde kalenderdag zes maanden later, 00:00 in Amsterdam. */
export function modelAEinde(eersteDienst: string): string {
  const [y = 1970, m = 1, d = 1] = amsterdamDayKey(eersteDienst).split("-").map(Number);
  // amsterdamToUtc vangt een maand voorbij december en een dag voorbij het maandeinde zelf op (Date.UTC)
  return amsterdamToUtc(y, m + MODEL_A.maanden, d).toISOString();
}

/** Model A: centen voor zoveel minuten (€ 1,00 per uur), per maand afgerond. */
export const centenModelA = (minuten: number): number => Math.round((minuten * MODEL_A.centsPerUur) / 60);

const leegUitkomst = (status: BedrijfStatus): BedrijfUitkomst => ({
  status,
  minuten: 0,
  betaaldeMinuten: 0,
  verdiendCents: 0,
  uitbetaalbaarCents: 0,
  eersteDienst: null,
  modelAEinde: null,
  perMaand: {},
});

/** Status, uren en commissie van één geregistreerd bedrijf. `diensten` mag diensten van andere bedrijven bevatten. */
export function berekenBedrijf(b: PartnerBedrijf, diensten: readonly Dienst[]): BedrijfUitkomst {
  if (b.afgewezenOp) return leegUitkomst("afgewezen");
  if (!b.tenantId) return leegUitkomst("geregistreerd");
  const vanaf = Date.parse(b.aangemaaktOp);
  const eigen = diensten
    .filter((d) => d.tenantId === b.tenantId && d.minuten > 0 && Date.parse(d.start) >= vanaf)
    .sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
  const eerste = eigen[0];
  if (!eerste) return leegUitkomst("aangemeld");

  const perMaand: Record<string, MaandRegel> = {};
  const regel = (k: string): MaandRegel => (perMaand[k] ??= { minuten: 0, betaaldeMinuten: 0, verdiendCents: 0, uitbetaalbaarCents: 0 });
  for (const d of eigen) {
    const r = regel(maandVan(d.start));
    r.minuten += d.minuten;
    if (d.betaald) r.betaaldeMinuten += d.minuten;
  }

  let einde: string | null = null;
  if (b.model === "A") {
    einde = modelAEinde(eerste.start);
    const eindeMs = Date.parse(einde);
    const binnen: Record<string, { minuten: number; betaald: number }> = {};
    for (const d of eigen) {
      if (Date.parse(d.start) >= eindeMs) continue;
      const x = (binnen[maandVan(d.start)] ??= { minuten: 0, betaald: 0 });
      x.minuten += d.minuten;
      if (d.betaald) x.betaald += d.minuten;
    }
    for (const [k, x] of Object.entries(binnen)) {
      const r = regel(k);
      r.verdiendCents = centenModelA(x.minuten);
      r.uitbetaalbaarCents = centenModelA(x.betaald);
    }
  } else {
    // model B: de bonus valt in de maand van de dienst waarmee het bedrijf 40 betaalde uren haalt (in volgorde van werken)
    let betaald = 0;
    for (const d of eigen) {
      if (!d.betaald) continue;
      betaald += d.minuten;
      if (betaald >= MODEL_B.naBetaaldeUren * 60) {
        const r = regel(maandVan(d.start));
        r.verdiendCents = MODEL_B.bonusCents;
        r.uitbetaalbaarCents = MODEL_B.bonusCents;
        break;
      }
    }
  }

  const regels = Object.values(perMaand);
  const som = (f: (r: MaandRegel) => number) => regels.reduce((s, r) => s + f(r), 0);
  return {
    status: "actief",
    minuten: som((r) => r.minuten),
    betaaldeMinuten: som((r) => r.betaaldeMinuten),
    verdiendCents: som((r) => r.verdiendCents),
    uitbetaalbaarCents: som((r) => r.uitbetaalbaarCents),
    eersteDienst: eerste.start,
    modelAEinde: einde,
    perMaand,
  };
}

export interface PartnerKpi {
  bedrijven: number;
  actief: number;
  minuten: number;
  verdiendCents: number;
  uitbetaalbaarCents: number;
}

/** De vier tellers bovenaan het partnerdashboard (afgewezen bedrijven tellen niet mee). */
export function partnerKpi(uitkomsten: readonly BedrijfUitkomst[]): PartnerKpi {
  const meetellen = uitkomsten.filter((u) => u.status !== "afgewezen");
  return {
    bedrijven: meetellen.length,
    actief: meetellen.filter((u) => u.status === "actief").length,
    minuten: meetellen.reduce((s, u) => s + u.minuten, 0),
    verdiendCents: meetellen.reduce((s, u) => s + u.verdiendCents, 0),
    uitbetaalbaarCents: meetellen.reduce((s, u) => s + u.uitbetaalbaarCents, 0),
  };
}

export const euro = (cents: number): string => `€ ${(cents / 100).toFixed(2).replace(".", ",")}`;
export const uren = (minuten: number): string => (minuten / 60).toFixed(1).replace(".", ",");

/** "2026-11" → "november 2026" */
export function maandLabel(maand: string): string {
  const [y = 1970, m = 1] = maand.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("nl-NL", { timeZone: "Europe/Amsterdam", month: "long", year: "numeric" });
}

/** De laatste `n` maanden tot en met die van `nu` ("2026-11", "2026-10", …). */
export function laatsteMaanden(nu: Date, n = 12): string[] {
  const [y = 1970, m = 1] = maandVan(nu).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 15));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export const isMaand = (s: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

// ---- invoer en opslag lezen (soepel: een kapotte regel valt weg, de rest blijft) ----

/** Een KVK-nummer: alleen de 8 cijfers; leeg of iets anders → null. */
export function normaliseerKvk(s: string | null | undefined): string | null {
  const cijfers = (s ?? "").replace(/\D/g, "");
  return cijfers.length === 8 ? cijfers : null;
}

/** De set partners (userId → sinds, ISO) uit KV. */
export function leesPartnerSet(v: unknown): Record<string, string> {
  const uit: Record<string, string> = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return uit;
  for (const [k, w] of Object.entries(v as Record<string, unknown>)) if (typeof k === "string" && k && typeof w === "string") uit[k] = w;
  return uit;
}

const tekst = (v: unknown): string => (typeof v === "string" ? v : "");
const ofNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** De geregistreerde bedrijven van één partner uit KV. */
export function leesBedrijven(v: unknown): PartnerBedrijf[] {
  const lijst = v && typeof v === "object" && Array.isArray((v as { bedrijven?: unknown }).bedrijven) ? (v as { bedrijven: unknown[] }).bedrijven : [];
  const uit: PartnerBedrijf[] = [];
  for (const r of lijst) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    const model = x.model === "A" || x.model === "B" ? x.model : null;
    if (!tekst(x.id) || !tekst(x.bedrijfsnaam) || !model || !tekst(x.aangemaaktOp)) continue;
    uit.push({
      id: tekst(x.id),
      bedrijfsnaam: tekst(x.bedrijfsnaam),
      kvk: ofNull(x.kvk),
      contactnaam: tekst(x.contactnaam),
      email: tekst(x.email),
      telefoon: tekst(x.telefoon),
      model,
      aangemaaktOp: tekst(x.aangemaaktOp),
      tenantId: ofNull(x.tenantId),
      tenantNaam: ofNull(x.tenantNaam),
      gekoppeldOp: ofNull(x.gekoppeldOp),
      afgewezenOp: ofNull(x.afgewezenOp),
      afwijsReden: ofNull(x.afwijsReden),
    });
  }
  return uit;
}

/** Is dit bedrijf al geregistreerd (door wie dan ook)? Op KVK-nummer of e-mailadres; afgewezen registraties tellen niet. */
export function isAlGeregistreerd(alle: readonly PartnerBedrijf[], nieuw: { kvk: string | null; email: string }): boolean {
  const email = nieuw.email.trim().toLowerCase();
  return alle.some((b) => !b.afgewezenOp && ((nieuw.kvk !== null && b.kvk === nieuw.kvk) || (email !== "" && b.email.toLowerCase() === email)));
}

// ---- maandoverzicht (CSV) voor de zzp-factuur van de partner ----

export interface ExportRegel {
  bedrijf: PartnerBedrijf;
  uitkomst: BedrijfUitkomst;
}

const csvVeld = (v: string): string => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Het maandoverzicht van één partner als CSV (puntkomma's en komma-decimalen, zoals Excel in het Nederlands verwacht). */
export function maandCsv(partner: { naam: string; email: string }, maand: string, regels: readonly ExportRegel[]): string {
  const kop = ["Bedrijf", "KvK", "Model", "Status", "Gewerkte uren", "Betaalde uren", "Commissie verdiend (excl. btw)", "Uitbetaalbaar: klant heeft betaald (excl. btw)"];
  const rijen = regels.map(({ bedrijf, uitkomst }) => {
    const r = uitkomst.perMaand[maand] ?? { minuten: 0, betaaldeMinuten: 0, verdiendCents: 0, uitbetaalbaarCents: 0 };
    return [
      bedrijf.bedrijfsnaam,
      bedrijf.kvk ?? "",
      MODEL_KORT[bedrijf.model],
      STATUS_LABEL[uitkomst.status],
      uren(r.minuten),
      uren(r.betaaldeMinuten),
      euro(r.verdiendCents),
      euro(r.uitbetaalbaarCents),
    ];
  });
  const totaal = regels.reduce(
    (s, { uitkomst }) => {
      const r = uitkomst.perMaand[maand];
      return r ? { v: s.v + r.verdiendCents, u: s.u + r.uitbetaalbaarCents } : s;
    },
    { v: 0, u: 0 },
  );
  const regelsTekst = [
    [`Maandoverzicht sales partner ${maandLabel(maand)}`],
    [`Partner: ${partner.naam} (${partner.email})`],
    [],
    kop,
    ...rijen,
    [],
    ["Totaal", "", "", "", "", "", euro(totaal.v), euro(totaal.u)],
    [],
    ["Factureer alleen het uitbetaalbare bedrag: dat is de commissie over uren waarvan de klant de factuur al betaalde."],
  ];
  // BOM vooraan: dan leest Excel de letters met accenten goed
  return "﻿" + regelsTekst.map((r) => r.map((v) => csvVeld(String(v))).join(";")).join("\r\n") + "\r\n";
}
