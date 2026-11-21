import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { verwijderdePaden } from "@/lib/seo/verwijderd";
import { SEO_STANDAARD } from "@/lib/ontwerp/seo";
import { PUBLIEK_SYSTEEM } from "@/lib/chat/publiek-systeem";
import { topicAnswer } from "@/lib/chat/public-intents";

// 21 nov 2026 (eigenaar, met Google op de telefoon): "op Google staat nog webshop openen, reviews bekijken, website …
// verwijder alles, alleen de regio's". De oude pagina's staan al op noindex; deze lijst laat Google en Bing ze snel opnieuw
// ophalen (sitemap-verwijderd.xml + IndexNow), en wat er nog wél in Google mag, praat alleen over flexwerk.

describe("Google: alleen flexwerk en de regio's", () => {
  it("de verwijderlijst bevat de oude pagina's en geen flexwerk", () => {
    const weg = verwijderdePaden();
    for (const p of ["/aanbod", "/aanbod/webshop", "/online", "/website-maken", "/review-check", "/shop", "/abonnementen", "/voorbeeldsites"]) expect(weg, p).toContain(p);
    for (const p of ["/", "/voor-freelancers", "/voor-bedrijven", "/bedrijven", "/prijzen", "/horeca-vacatures", "/freelance-werk", "/starten-als-uitzendkracht"]) expect(weg, p).not.toContain(p);
    expect(new Set(weg).size).toBe(weg.length);
  });

  it("robots.txt noemt ook de opruim-sitemap", () => {
    expect(robots().sitemap).toEqual(expect.arrayContaining([expect.stringMatching(/\/sitemap\.xml$/), expect.stringMatching(/\/sitemap-verwijderd\.xml$/)]));
  });

  it("de titel voor bedrijven noemt geen website of software meer", () => {
    const b = SEO_STANDAARD["/bedrijven"];
    expect(`${b.titel} ${b.omschrijving}`).not.toMatch(/website|software/i);
  });

  it("de assistent belooft geen websites, webshop of kastjes", () => {
    expect(PUBLIEK_SYSTEEM).not.toMatch(/bouwt ZekerFlex ook websites/);
    expect(PUBLIEK_SYSTEEM).toContain("geen kastjes, tablets of NFC-tags");
    expect(topicAnswer("heeft zekerflex een webshop?")?.reply).toContain("geen webshop meer");
    expect(topicAnswer("hoe moet ik inchecken")?.reply).toContain("QR-code");
  });
});
