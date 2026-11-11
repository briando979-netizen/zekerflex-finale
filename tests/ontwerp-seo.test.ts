import { beforeEach, describe, expect, it, vi } from "vitest";

const opslag = new Map<string, unknown>();
vi.mock("@/lib/storage/kv", () => ({
  kvGet: vi.fn(async (k: string) => opslag.get(k) ?? null),
  kvSet: vi.fn(async (k: string, v: unknown) => {
    opslag.set(k, v);
  }),
}));

import { canonical } from "@/lib/seo";
import { normalizeSeoEigen, volledigeTitel } from "@/lib/ontwerp/seo";
import { seoMetadata, zetSeoEigen } from "@/lib/ontwerp/seo-store";

describe("SEO van de vaste pagina's (Site-ontwerper)", () => {
  beforeEach(() => opslag.clear());

  it("zonder eigen versie precies de metadata van vóór de ontwerper", async () => {
    const TITLE = "ZekerFlex — freelance werk & klussen in heel Nederland | flexwerk, zzp en uitzendwerk";
    // sinds 11 nov 2026 is de homepagina voor werkzoekenden; de omschrijving noemt geen bedrijfsprijs meer (die staat bij /bedrijven)
    const DESCRIPTION =
      "Vind flexwerk en klussen bij jou in de buurt. Je ziet vooraf wat je verdient, checkt in met je telefoon en krijgt je geld op je eigen rekening. Zzp'er of zonder KVK via ons uitzendbureau. Meedoen is gratis.";
    expect(await seoMetadata("/", { keywords: ["a"] })).toEqual({ title: { absolute: TITLE }, description: DESCRIPTION, keywords: ["a"], ...canonical("/", { title: TITLE, description: DESCRIPTION }) });
    expect(await seoMetadata("/prijzen", { keywords: ["b"] })).toEqual({
      title: "Prijzen — € 3,50 per gewerkt uur, gratis voor freelancers",
      description:
        "Wat kost ZekerFlex? Gratis voor freelancers en flexkrachten. Bedrijven betalen € 3,50 platformkosten per gewerkt uur, alleen bij gebruik. Geen abonnement, geen opstartkosten, geen verrassingen.",
      keywords: ["b"],
      ...canonical("/prijzen"),
    });
    // de vorige homepagina, nu voor bedrijven
    const bv = await seoMetadata("/bedrijven");
    expect(bv.title).toBe("Personeel, website en software voor je bedrijf");
    expect(bv.description).toContain("€ 3,50 per gewerkt uur");
  });

  it("met een eigen versie de nieuwe titel en omschrijving, ook voor OpenGraph; leeg veld = standaard", async () => {
    await zetSeoEigen("/over-ons", { titel: "  Wie   wij zijn ", omschrijving: "" });
    const m = await seoMetadata("/over-ons");
    expect(m.title).toBe("Wie wij zijn");
    expect(m.description).toMatch(/^ZekerFlex is opgebouwd/);
    expect((m.openGraph as Record<string, unknown>).title).toBe("Wie wij zijn · ZekerFlex");
    expect(volledigeTitel("/over-ons", "Wie wij zijn")).toBe("Wie wij zijn · ZekerFlex");
    expect(volledigeTitel("/", "Home")).toBe("Home");
    await zetSeoEigen("/over-ons", null);
    expect((await seoMetadata("/over-ons")).title).toBe("Over ZekerFlex");
  });

  it("beide velden leeg is geen eigen versie", () => {
    expect(normalizeSeoEigen({ titel: " ", omschrijving: "" })).toBeNull();
    expect(normalizeSeoEigen({ titel: "x".repeat(300), omschrijving: "y" })?.titel.length).toBe(120);
  });
});
