import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { explainPayslip, loonstrookKop } from "@/lib/payroll/explain";
import { euro } from "@/lib/payroll/format";
import { isoWeekLabel, isoWeekLabelIn, parseIsoWeekId } from "@/lib/payroll/week";
import { LOONSTROOK_NL } from "@/lib/payroll/loonstrook-teksten";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { VOORBEELDEN } from "./payslip-voorbeelden";

// De loonstrook op het scherm (/dashboard/verloning) en de uitleg "Zo is je loon opgebouwd" in de taal van de werker.
// Bedragen en getallen volgen die taal (Amsterdamse week); het document dat voor de Belastingdienst telt (de pdf) blijft Nederlands.

const ROOT = process.cwd();
const TALEN = ["nl", "en", "pl", "ro", "uk"] as const;
const bron = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
const NL_VASTGELEGD = JSON.parse(readFileSync(path.join(ROOT, "tests/fixtures/payslip-uitleg-nl.json"), "utf8")) as Record<string, string[]>;

describe("zonder teksten blijft alles Nederlands, precies zoals het was", () => {
  it("de uitleg van elke voorbeeldloonstrook is woord voor woord gelijk aan de vastgelegde uitvoer van vóór de vertaling", () => {
    for (const [naam, strook] of Object.entries(VOORBEELDEN)) {
      expect(explainPayslip(strook), naam).toEqual(NL_VASTGELEGD[naam]);
      expect(explainPayslip(strook, LOONSTROOK_NL), naam).toEqual(NL_VASTGELEGD[naam]);
    }
  });

  it("euro() zonder taal is Nederlands en weekLabel uit het sjabloon is gelijk aan isoWeekLabel", () => {
    expect(euro(13500)).toBe(`€ ${(135).toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    for (const id of ["2026-W01", "2026-W45", "2026-W53", "2027-W09"]) {
      const w = parseIsoWeekId(id);
      if (w) expect(isoWeekLabelIn(w, LOONSTROOK_NL.weekLabel), id).toBe(isoWeekLabel(w));
    }
  });

  it("het kopje bij het hoofdbedrag is hetzelfde als het opgeslagen label", () => {
    for (const s of Object.values(VOORBEELDEN)) expect(loonstrookKop(s)).toBe(s.computed.headlineLabel);
  });
});

describe("de uitleg in vijf talen", () => {
  for (const taal of TALEN) {
    it(`${taal}: geen plaatshouder blijft staan en de bedragen staan er in de taal van de werker in`, () => {
      const t = FREELANCER_DICTS[taal].loonstrook;
      for (const [naam, strook] of Object.entries(VOORBEELDEN)) {
        const regels = explainPayslip(strook, t);
        expect(regels.length, `${taal} ${naam}`).toBe(NL_VASTGELEGD[naam]!.length);
        for (const r of regels) {
          expect(r, `${taal} ${naam}: ${r}`).not.toMatch(/\{\w+\}|undefined|NaN/);
        }
      }
      // het brutoloon en de naam van de opdrachtgever staan in de zin
      const vol = explainPayslip(VOORBEELDEN.PAYROLL_VOL, t).join("\n");
      expect(vol, taal).toContain(euro(75000, t.intl));
      expect(vol, taal).toContain(euro(53034, t.intl));
      const enkel = explainPayslip(VOORBEELDEN.PAYROLL_WML, t).join("\n");
      expect(enkel, taal).toContain("Acme");
      expect(enkel, taal).toContain(euro(31000, t.intl));
    });
  }

  it("een andere taal is echt vertaald: elke regel verschilt van het Nederlands", () => {
    for (const taal of ["en", "pl", "ro", "uk"] as const) {
      const t = FREELANCER_DICTS[taal].loonstrook;
      for (const [naam, strook] of Object.entries(VOORBEELDEN)) {
        explainPayslip(strook, t).forEach((r, i) => expect(r, `${taal} ${naam} #${i}`).not.toBe(NL_VASTGELEGD[naam]![i]));
      }
    }
  });

  it("bedragen volgen de taal: 1.234,50 in het Nederlands, 1,234.50 in het Engels", () => {
    expect(euro(123450, "nl-NL")).toContain("1.234,50");
    expect(euro(123450, "en-GB")).toContain("1,234.50");
  });

  it("het hoofdbedrag krijgt het kopje in de taal van de werker", () => {
    for (const taal of ["en", "pl", "ro", "uk"] as const) {
      const t = FREELANCER_DICTS[taal].loonstrook;
      expect(loonstrookKop(VOORBEELDEN.PAYROLL_VOL, t)).toBe(t.headline.netto);
      expect(loonstrookKop(VOORBEELDEN.FACTUUR_BTW, t)).toBe(t.headline.inclBtw);
      expect(loonstrookKop(VOORBEELDEN.FACTUUR_ZONDER_BTW, t)).toBe(t.headline.uitTeBetalen);
      expect(t.headline.netto, taal).not.toBe(LOONSTROOK_NL.headline.netto);
    }
  });

  it("het weeklabel komt uit het sjabloon van de taal, met dezelfde data", () => {
    const w = parseIsoWeekId("2026-W45")!;
    expect(isoWeekLabelIn(w, FREELANCER_DICTS.en.loonstrook.weekLabel)).toBe("week 45 · 02-11 to 08-11 2026");
    expect(isoWeekLabelIn(w, FREELANCER_DICTS.pl.loonstrook.weekLabel)).toContain("02-11");
    expect(isoWeekLabelIn(w, FREELANCER_DICTS.uk.loonstrook.weekLabel)).toContain("08-11");
  });
});

describe("de woordenlijst loonstrook: elke sleutel in elke taal", () => {
  function blaadjes(waarde: unknown, pad: string, uit: Map<string, string>): void {
    if (typeof waarde === "string") uit.set(pad, waarde);
    else if (waarde && typeof waarde === "object") for (const [k, v] of Object.entries(waarde)) blaadjes(v, pad ? `${pad}.${k}` : k, uit);
  }
  const per = Object.fromEntries(
    TALEN.map((t) => {
      const m = new Map<string, string>();
      blaadjes(FREELANCER_DICTS[t].loonstrook, "", m);
      return [t, m];
    }),
  ) as Record<(typeof TALEN)[number], Map<string, string>>;
  const plaatshouders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort().join(",");

  it("dezelfde sleutels en dezelfde plaatshouders, niets leeg", () => {
    expect(per.nl.size).toBeGreaterThan(100);
    for (const taal of TALEN) {
      expect([...per[taal].keys()].sort(), taal).toEqual([...per.nl.keys()].sort());
      for (const [pad, nl] of per.nl) {
        const x = per[taal].get(pad) ?? "";
        expect(x.length, `${taal} ${pad}`).toBeGreaterThan(0);
        expect(plaatshouders(x), `${taal} ${pad}`).toBe(plaatshouders(nl));
      }
    }
  });
});

describe("het scherm gebruikt de woordenlijst, de pdf blijft Nederlands", () => {
  it("pagina en lijst hebben de oude losse Nederlandse zinnen niet meer", () => {
    const pagina = bron("app/dashboard/verloning/page.tsx");
    const lijst = bron("components/app/PayslipList.tsx");
    for (const zin of ["Je wekelijkse loonstrook", "Overzicht per week", "Reservering vakantie (dit jaar)", "Loonheffingskorting\"", "Nog geen verloning"]) {
      expect(pagina + lijst, zin).not.toContain(zin);
    }
    expect(pagina).toContain("getFreelancerDict");
    expect(pagina).toContain("<PayslipList payslips={payslips} t={t} />");
  });

  it("de pdf-route en de pdf-bouw gebruiken de vertaalde teksten niet", () => {
    const route = bron("app/api/me/payroll/[isoWeek]/pdf/route.ts");
    expect(route).not.toContain("loonstrook-teksten");
    expect(route).not.toContain("i18n/freelancer");
    expect(bron("lib/payroll/loonstrook-teksten.ts")).not.toMatch(/^import /m);
  });
});
