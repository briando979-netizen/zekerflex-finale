import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FREELANCER_DICTS } from "@/lib/i18n/freelancer";
import { toontEigenTarief, type TariefGegevens } from "@/lib/werker/eigen-tarief";

// Een uitzendkracht stelt geen uurtarief in (loon volgt uit cao en klus), 20 nov 2026: het scherm Beschikbaarheid
// (/dashboard/beschikbaarheid) toont voor hem geen minimum- en richttarief. De bewaarde waarden blijven staan:
// opslaan stuurt de twee sleutels dan niet mee. Zzp'ers, flexwerkers en wie beide is houden de velden.

const lees = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
const basis: TariefGegevens = { workerKind: null, invoiceMode: null, kvkNumber: null, vatNumber: null };

describe("toontEigenTarief", () => {
  it("uitzendkracht zonder eigen bedrijf: geen tariefvelden", () => {
    expect(toontEigenTarief({ ...basis, workerKind: "uitzendkracht" })).toBe(false);
    expect(toontEigenTarief({ ...basis, workerKind: "uitzendkracht", invoiceMode: "payroll" })).toBe(false);
    expect(toontEigenTarief({ ...basis, workerKind: "uitzendkracht", kvkNumber: "  " })).toBe(false);
  });

  it("zzp'er en flexwerker houden de velden", () => {
    expect(toontEigenTarief({ ...basis, workerKind: "zzp", kvkNumber: "12345678" })).toBe(true);
    expect(toontEigenTarief({ ...basis, workerKind: "flexwerker" })).toBe(true);
    expect(toontEigenTarief({ ...basis, workerKind: "flexwerker", invoiceMode: "self-invoice" })).toBe(true);
  });

  it("wie beide is (verloning én een eigen KVK- of btw-nummer) houdt de velden", () => {
    expect(toontEigenTarief({ ...basis, workerKind: "uitzendkracht", kvkNumber: "12345678" })).toBe(true);
    expect(toontEigenTarief({ ...basis, workerKind: "uitzendkracht", vatNumber: "NL001234567B01" })).toBe(true);
    // een uitzendkracht die uitdrukkelijk op factuur staat, werkt als zelfstandige
    expect(toontEigenTarief({ ...basis, workerKind: "uitzendkracht", invoiceMode: "reverse-billing" })).toBe(true);
  });

  it("onbekend of nog niets gekozen: de velden blijven", () => {
    expect(toontEigenTarief(null)).toBe(true);
    expect(toontEigenTarief(undefined)).toBe(true);
    expect(toontEigenTarief(basis)).toBe(true);
  });
});

describe("scherm Beschikbaarheid", () => {
  const pagina = lees("app/dashboard/beschikbaarheid/page.tsx");
  const form = lees("components/app/AvailabilityForm.tsx");

  it("de pagina beslist op de server en valt bij een storing terug op tonen", () => {
    expect(pagina).toContain("getFiscal(principal.userId).catch(() => null)");
    expect(pagina).toContain("const toonTarief = toontEigenTarief(fiscal);");
    expect(pagina).toContain("<AvailabilityForm initial={prefs} toonTarief={toonTarief} />");
    expect(pagina).toContain("ft.avail.titleUitzend");
  });

  it("het formulier toont de twee tariefvelden alleen met toonTarief (standaard aan)", () => {
    expect(form).toContain("toonTarief = true");
    const start = form.indexOf("{toonTarief && (");
    expect(start).toBeGreaterThan(-1);
    for (const stuk of ["{t.minRate}", "{t.desiredRate}"]) {
      expect(form.indexOf(stuk), stuk).toBeGreaterThan(start);
      expect(form.indexOf(stuk), stuk).toBeLessThan(form.indexOf("{t.maxTravel(maxTravel)}"));
    }
    // reistijd en oproepbaar blijven voor iedereen
    expect(form.indexOf("{t.maxTravel(maxTravel)}")).toBeGreaterThan(form.indexOf(")}", start));
    expect(form).toContain("{toonTarief ? t.rateTitle : t.travelTitle}");
  });

  it("zonder de velden stuurt opslaan de tarieven niet mee, zodat de bewaarde waarden blijven staan", () => {
    expect(form).toMatch(/\.\.\.\(toonTarief\s*\?\s*\{\s*minHourlyRateCents:[^}]*desiredHourlyRateCents:[^}]*\}\s*:\s*\{\}\)/);
    // de route raakt een sleutel alleen aan als hij is meegestuurd
    const route = lees("app/api/me/preferences/route.ts");
    expect(route).toContain("if (parsed.minHourlyRateCents !== undefined) patch.minHourlyRateCents = parsed.minHourlyRateCents;");
    expect(route).toContain("if (parsed.desiredHourlyRateCents !== undefined) patch.desiredHourlyRateCents = parsed.desiredHourlyRateCents;");
  });

  it("de teksten zonder tarief staan in alle vijf talen", () => {
    for (const [taal, d] of Object.entries(FREELANCER_DICTS)) {
      for (const tekst of [d.avail.travelTitle, d.avail.titleUitzend, d.avail.subtitleUitzend]) {
        expect(tekst.length, taal).toBeGreaterThan(3);
      }
    }
    expect(FREELANCER_DICTS.nl.avail.titleUitzend).toBe("Beschikbaarheid");
    expect(FREELANCER_DICTS.nl.avail.subtitleUitzend).not.toMatch(/tarief|verdienen/i);
  });
});
