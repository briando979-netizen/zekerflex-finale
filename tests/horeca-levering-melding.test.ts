import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/notifications/push", () => ({ sendUserPush: vi.fn() }));

import { leveringPush } from "@/lib/horeca/levering-melding";
import { nieuweLeveringZaak } from "@/lib/horeca/mail";

// Een seintje aan de zaak bij een nieuwe online bestelling (15 nov 2026): push en mail, en op het bord een piepje en
// het aantal in de titel. Elke datum met een zone.

const lees = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const levering = {
  nummer: 12,
  soort: "bezorgen",
  naam: "Sam",
  telefoon: "0699999999",
  adres: "Dam 1",
  postcode: "1012 JS",
  plaats: "Amsterdam",
  gewenstOp: new Date("2026-11-15T18:30:00+01:00"),
  totaalCent: 2345,
  kortingCent: 0,
  bezorgkostenCent: 250,
  opmerking: "",
};

describe("seintje aan de zaak", () => {
  it("push: soort, nummer, tijd en bedrag; geen naam, adres of telefoon op het vergrendelscherm", () => {
    const p = leveringPush(levering);
    expect(p.title).toBe("Nieuwe online bezorging 12");
    expect(p.body).toMatch(/^Om 18:30 · €\s25,95 · bevestig de tijd op het bord$/);
    expect(`${p.title} ${p.body}`).not.toMatch(/Sam|Dam 1|0699999999/);
    expect(leveringPush({ ...levering, soort: "afhalen", gewenstOp: null, bezorgkostenCent: 0 }).body).toMatch(/^Zo snel mogelijk/);
  });

  it("mail alleen als de zaak een e-mailadres heeft, met een link naar het bord", () => {
    const zaak = { naam: "Test", slug: "test", kleur: "#0A120E", telefoon: "", email: "", adres: "", plaats: "" };
    const b = { nummer: 12, soort: "bezorgen", naam: "Sam", telefoon: "0699999999", adres: "Dam 1", postcode: "1012 JS", plaats: "Amsterdam", tijd: "18:30", bedragCent: 2595, opmerking: "" };
    expect(nieuweLeveringZaak(zaak, b)).toBeNull();
    const m = nieuweLeveringZaak({ ...zaak, email: "zaak@zekerflex.test" }, b);
    expect(m?.subject).toBe("Nieuwe online bezorging 12: bevestig de tijd");
    expect(m?.text).toContain("/werkgever/horeca?tab=bestellingen");
  });

  it("de route stuurt het seintje na het antwoord; het bord piept en telt in de titel", () => {
    expect(lees("app/api/horeca/site/[slug]/leveren/route.ts")).toContain("after(() => meldNieuweLevering(zaak, best))");
    const tab = lees("components/horeca/beheer/BestellingenTab.tsx");
    expect(tab).toContain("piep()");
    expect(tab).toMatch(/document\.title = wachtend > 0/);
  });
});
