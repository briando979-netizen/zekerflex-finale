import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { whitepaperBySlug, whitepaperPlainText } from "@/lib/kennis/whitepapers";
import { TARIEF_TIPS, TARIEVEN_PDF, TARIEVEN_TEKST, euro, staffelRijen, tariefGroepen } from "@/lib/kennis/tarieven-overzicht";
import { renderWhitepaperPdf } from "@/lib/pdf/whitepaper";
import { BASE_FEE_PER_HOUR_CENTS, VOLUME_TIERS, tierRateCents } from "@/lib/pricing/tiers";
import { SHIFT_TEMPLATES } from "@/lib/shifts/catalogus";

// Het tarievenoverzicht (/tarieven-overzicht + de pdf) leest zijn bedragen uit de catalogus en de staffel.
// Bewaakt ook wat er niet in mag staan: de uitzendopslag is niet openbaar en er is geen verzekeraar.

const ROOT = process.cwd();
const lees = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
const pagina = lees("app/(marketing)/tarieven-overzicht/page.tsx");
const bron = lees("lib/kennis/tarieven-overzicht.ts");

describe("tarievenoverzicht", () => {
  const wp = whitepaperBySlug("tarieven-overzicht");
  const tekst = wp ? whitepaperPlainText(wp) : "";

  it("de whitepaper bestaat en noemt elke functie met haar richttarief uit de catalogus", () => {
    expect(wp).toBeDefined();
    expect(SHIFT_TEMPLATES.length).toBeGreaterThan(40);
    for (const t of SHIFT_TEMPLATES) {
      expect(tekst, t.key).toContain(`${t.label}: ${euro(t.hourlyRateCents)} per uur`);
      expect(tekst, t.key).toContain(euro(t.hourlyRateCents + BASE_FEE_PER_HOUR_CENTS));
    }
  });

  it("elke functie staat precies één keer in de tabellen, met richttarief plus basis-platformkosten", () => {
    const rijen = tariefGroepen().flatMap((g) => g.rijen);
    expect(rijen.map((r) => r.key).sort()).toEqual(SHIFT_TEMPLATES.map((t) => t.key).sort());
    for (const r of rijen) {
      expect(r.platformCents).toBe(BASE_FEE_PER_HOUR_CENTS);
      expect(r.samenCents).toBe(r.richtCents + BASE_FEE_PER_HOUR_CENTS);
    }
  });

  it("de staffelbedragen komen uit VOLUME_TIERS", () => {
    const staffel = staffelRijen();
    expect(staffel.map((s) => s.centsPerUur)).toEqual(VOLUME_TIERS.map((t) => tierRateCents(t)));
    for (const s of staffel) expect(tekst).toContain(`${s.uren}: ${euro(s.centsPerUur)} per uur`);
    expect(staffel[0]?.uren).toBe("Tot 500 uur per maand");
    expect(staffel[2]?.uren).toBe("Vanaf 2.000 uur per maand");
    expect(euro(BASE_FEE_PER_HOUR_CENTS)).toBe("€ 3,50");
  });

  it("geen opslag of factor voor uitzenden en geen verzekering, op de pagina noch in de pdf", () => {
    const alles = [pagina, bron, tekst, ...Object.values(TARIEVEN_TEKST), ...TARIEF_TIPS.flatMap((t) => [t.titel, t.tekst])];
    for (const t of alles) {
      expect(t).not.toMatch(/opslag van \d|omrekenfactor \d/i);
      expect(t).not.toMatch(/verzekerd|verzekering/i);
    }
    // geen percentage in de zichtbare tekst (de uitzendopslag is niet openbaar)
    expect(tekst).not.toContain("%");
    expect(tekst).toContain("offerte");
  });

  it("de pagina linkt naar de pdf, de klus, de prijzen, het uitzendbureau en contact", () => {
    expect(TARIEVEN_PDF).toBe("/api/kennis/whitepaper/tarieven-overzicht");
    expect(pagina).toContain("href={TARIEVEN_PDF}");
    for (const href of ["/klus-plaatsen", "/prijzen", "/uitzendbureau", "/contact"]) expect(pagina, href).toContain(`href="${href}"`);
    expect(pagina).toContain('canonical("/tarieven-overzicht")');
    // bewust geen formulier: direct downloaden
    expect(pagina).not.toMatch(/<form|<input/);
  });

  it("de pdf wordt gemaakt", () => {
    if (!wp) throw new Error("whitepaper ontbreekt");
    const pdf = renderWhitepaperPdf(wp);
    expect(pdf.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");
    expect(pdf.length).toBeGreaterThan(5_000);
    expect(pdf.toString("latin1")).toContain("Vakkenvuller: \u0080 16,20 per uur");
  });
});
