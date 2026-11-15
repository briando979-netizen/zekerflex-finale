import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { leverSlots, STANDAARD_BEZORGEN } from "@/lib/horeca/bezorgen";
import { STANDAARD_TIJDEN } from "@/lib/horeca/tijden";
import { gastLeverSchema } from "@/lib/horeca/schema";
import { isPublicApiRoute } from "@/lib/auth/public-routes";

// Online bestellen om af te halen of te laten bezorgen (15 nov 2026): alleen op tijden die vandaag echt kunnen,
// de route is beveiligd als bestellen aan tafel, en de gast ziet alleen zijn eigen stand. Elke datum met een zone.

const lees = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const inst = { ...STANDAARD_BEZORGEN, afhaalMinuten: 20, bezorgMinuten: 45 };

describe("tijden van vandaag", () => {
  it("zondag 17:52, open tot 22:00: per kwartier vanaf de vroegste tijd, en zo snel mogelijk kan", () => {
    const nu = new Date("2026-11-15T17:52:00+01:00");
    const afhalen = leverSlots(nu, "afhalen", inst, STANDAARD_TIJDEN);
    expect(afhalen.zsm).toBe(true);
    expect(afhalen.slots[0]).toBe("18:15");
    expect(afhalen.slots.at(-1)).toBe("22:00");
    expect(afhalen.slots).toHaveLength(16);
    const bezorgen = leverSlots(nu, "bezorgen", inst, STANDAARD_TIJDEN);
    expect(bezorgen.slots[0]).toBe("18:45");
    expect(bezorgen.slots).toHaveLength(14);
  });

  it("dicht (maandag) of na sluiten: niets", () => {
    expect(leverSlots(new Date("2026-11-16T15:00:00+01:00"), "afhalen", inst, STANDAARD_TIJDEN)).toEqual({ slots: [], zsm: false });
    expect(leverSlots(new Date("2026-11-15T22:30:00+01:00"), "afhalen", inst, STANDAARD_TIJDEN)).toEqual({ slots: [], zsm: false });
  });

  it("voor de opening: tijden vanaf de opening plus de bereidingstijd, nog niet zo snel mogelijk", () => {
    const r = leverSlots(new Date("2026-11-17T10:00:00+01:00"), "afhalen", inst, STANDAARD_TIJDEN);
    expect(r.zsm).toBe(false);
    expect(r.slots[0]).toBe("12:30");
  });

  it("open tot na middernacht: de tijden lopen door tot 02:00", () => {
    const laat = { ...STANDAARD_TIJDEN, "6": { van: "18:00", tot: "02:00" } };
    const r = leverSlots(new Date("2026-11-14T23:30:00+01:00"), "afhalen", inst, laat);
    expect(r.zsm).toBe(true);
    expect(r.slots[0]).toBe("00:00");
    expect(r.slots.at(-1)).toBe("02:00");
  });
});

describe("de route en de pagina's", () => {
  it("invoer: naam en telefoon verplicht, tijd zsm of UU:MM, een botveld mag bestaan", () => {
    const ok = gastLeverSchema.safeParse({ soort: "bezorgen", mand: [{ itemId: "i1", aantal: 1 }], naam: "Test", telefoon: "0612345678", adres: "Dam 1", postcode: "1012 JS", plaats: "Amsterdam", tijd: "18:30" });
    expect(ok.success).toBe(true);
    expect(gastLeverSchema.safeParse({ soort: "afhalen", mand: [{ itemId: "i1", aantal: 1 }], naam: "T", telefoon: "0612345678", tijd: "zsm" }).success).toBe(false);
    expect(gastLeverSchema.safeParse({ soort: "afhalen", mand: [{ itemId: "i1", aantal: 1 }], naam: "Test", telefoon: "0612345678", tijd: "18.30" }).success).toBe(false);
  });

  it("de route: eigen site, IP-limiet, botveld, alleen tijden van vandaag, statuslink ondertekend", () => {
    const r = lees("app/api/horeca/site/[slug]/leveren/route.ts");
    expect(r).toContain("zelfdeHerkomst(");
    expect(r).toMatch(/enforceRateLimit\(\{ name: "horeca-leveren"/);
    expect(r).toContain("b.bedrijf.trim()");
    expect(r).toContain("onlineTijdFout(");
    expect(r).toContain('plaatsLevering(zaak, { soort, ...inv }, "online")');
    expect(r).toContain('tekenMet(env.AUTH_SECRET, "levering"');
    expect(isPublicApiRoute("/api/horeca/site/x/leveren")).toBe(true);
  });

  it("de gast ziet geen adres, telefoon of e-mail terug", () => {
    const s = lees("lib/horeca/bezorgen-server.ts");
    const blok = s.slice(s.indexOf("export async function leveringVoorGast"), s.indexOf("// --- instellingen en bezorgers"));
    expect(blok).not.toMatch(/adres: true|telefoon: true|email: true|naam: true/);
  });

  it("geen e-mailveld in het formulier (we sturen geen mail), wel de AVG-zin", () => {
    const m = lees("components/horeca/site/LeverMenu.tsx");
    expect(m).not.toMatch(/type="email"/);
    expect(m).toContain("wissen ze na een jaar");
  });
});
