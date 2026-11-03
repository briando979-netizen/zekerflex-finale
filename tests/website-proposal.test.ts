import { describe, expect, it } from "vitest";
import { clipSentences, extractBusiness, extraScores, improvementPlan, proposalFindings } from "@/lib/website-check/proposal";

// Uitgebreide beoordeling voor een websitevoorstel: bedrijfsgegevens uit de
// pagina halen (voor de nieuwe site), vertrouwen/uitstraling/contact
// beoordelen, en per probleem zeggen wat ZekerFlex beter doet.

const OUD = `<!doctype html><html><head><title>Home | Schildersbedrijf De Vries - Rijssen</title></head><body>
<img src="/img/logo.gif" alt="Logo De Vries" width="200" height="60">
<h2>Binnenschilderwerk</h2><p>Strak en netjes.</p><h2>Buitenschilderwerk</h2><h3>Contact</h3>
<font color="red">Bel ons!</font> <a href="tel:0548-123456">0548-123456</a> <a href="mailto:info@devries-schilders.nl?subject=Vraag">mail</a>
<p>Dorpsstraat 12, 7461 AB Rijssen</p><p>KvK-nummer: 12345678</p><p>© 2019 Schildersbedrijf De Vries</p>
</body></html>`;

const NIEUW = `<!doctype html><html lang="nl"><head><title>Bakkerij Modern</title>
<meta property="og:site_name" content="Bakkerij Modern"><meta name="theme-color" content="#3b2a1e">
<meta property="og:image" content="https://bakkerijmodern.nl/og.jpg"><link rel="icon" href="/favicon.png"></head><body>
<header><img src="/logo.svg" alt="Bakkerij Modern"></header>
<h2>Desembrood</h2><h2>Taarten op bestelling</h2><h2>Volg ons</h2>
<img src="/foto/brood.jpg" width="1200" height="800"><img src="/foto/taart.webp"><img src="/icons/star.png" width="16" height="16">
<p>Openingstijden: ma t/m vr 08:00 - 17:00</p><p>★★★★★ "Heerlijk brood" — onze reviews</p>
<a href="https://wa.me/31612345678">WhatsApp</a> <a href="/privacy">Privacyverklaring</a> <a href="/reserveren">Reserveer een taart</a>
<a href="https://www.instagram.com/bakkerijmodern">Instagram</a><p>© ${new Date().getUTCFullYear()} Bakkerij Modern</p>
</body></html>`;

describe("bedrijfsgegevens uit een pagina", () => {
  it("haalt naam, telefoon, mail, adres, KVK, koppen en jaartal uit een oudere site", () => {
    const b = extractBusiness(OUD, "https://devries-schilders.nl/");
    expect(b.naam).toBe("Schildersbedrijf De Vries"); // from the copyright line, not the town in the title
    expect(b.telefoon).toBe("0548123456");
    expect(b.email).toBe("info@devries-schilders.nl");
    expect(b).toMatchObject({ straat: "Dorpsstraat 12", postcode: "7461 AB", plaats: "Rijssen", kvk: "12345678", jaar: 2019 });
    expect(b.koppen).toEqual(["Binnenschilderwerk", "Buitenschilderwerk"]);
    expect(b.logo).toBe("https://devries-schilders.nl/img/logo.gif");
    expect(b.verouderd).toEqual(["font-tags"]);
    expect(b).toMatchObject({ privacy: false, whatsapp: false, openingstijden: false, favicon: false });
  });

  it("zonder copyright of site-naam: het stuk uit de titel dat niet de plaats is", () => {
    const html = `<html><head><title>Kapsalon Knip | Haarden</title></head><body><p>Kerkstraat 3</p><p>7771 AB Haarden</p></body></html>`;
    expect(extractBusiness(html, "https://knip.nl/").naam).toBe("Kapsalon Knip");
  });

  it("haalt diensten met hun eigen tekst, een introductie en een 06-nummer", () => {
    const html = `<html><head><title>Hoveniersbedrijf Groen</title></head><body>
      <p>Hoveniersbedrijf Groen ontwerpt, legt aan en onderhoudt tuinen in de hele regio. Al twintig jaar met vakmensen die van hun werk houden en netjes opleveren.</p>
      <h2>Tuinontwerp</h2><p>We tekenen samen met je een tuin die past bij je huis en je manier van leven.</p>
      <h2>Onderhoud</h2><p>Snoeien, maaien en bemesten.</p>
      <h2>Openingstijden</h2><p>Maandag tot en met vrijdag van 08:00 tot 17:00 uur.</p>
      <a href="tel:06-12345678">Bel</a></body></html>`;
    const b = extractBusiness(html, "https://groen.nl/");
    expect(b.secties).toEqual([
      { kop: "Tuinontwerp", tekst: "We tekenen samen met je een tuin die past bij je huis en je manier van leven." },
      { kop: "Onderhoud", tekst: "Snoeien, maaien en bemesten." },
    ]);
    expect(b.intro).toMatch(/^Hoveniersbedrijf Groen ontwerpt/);
    expect(b.mobiel).toBe(true);
    expect(extractBusiness(OUD, "https://devries-schilders.nl/").mobiel).toBe(false);
    expect(clipSentences("Dit is zin een. Dit is zin twee die lang is.", 30)).toBe("Dit is zin een.");
    expect(clipSentences("woord ".repeat(20).trim(), 20)).toBe("woord woord woord…");
  });

  it("en uit een moderne site: merkkleur, foto's (geen iconen), WhatsApp, reviews, reserveren", () => {
    const b = extractBusiness(NIEUW, "https://bakkerijmodern.nl/");
    expect(b.naam).toBe("Bakkerij Modern");
    expect(b.kleur).toBe("#3B2A1E");
    expect(b.fotos).toEqual(["https://bakkerijmodern.nl/og.jpg", "https://bakkerijmodern.nl/foto/brood.jpg", "https://bakkerijmodern.nl/foto/taart.webp"]);
    expect(b.koppen).toEqual(["Desembrood", "Taarten op bestelling"]);
    expect(b.socials).toEqual(["https://www.instagram.com/bakkerijmodern"]);
    expect(b).toMatchObject({ whatsapp: true, openingstijden: true, reviews: true, privacy: true, boeken: true, favicon: true, verouderd: [] });
  });
});

describe("beoordeling en verbeterplan", () => {
  const now = new Date("2026-11-03T10:00:00Z");

  it("de oudere site krijgt problemen bij vertrouwen, uitstraling en contact", () => {
    const f = proposalFindings(extractBusiness(OUD, "https://devries-schilders.nl/"), 1, now);
    const status = Object.fromEntries(f.map((x) => [x.id, x.status]));
    expect(status).toMatchObject({ kvk: "goed", adres: "goed", privacy: "probleem", reviews: "let-op", jaar: "let-op", verouderd: "probleem", beeld: "let-op", favicon: "let-op", openingstijden: "let-op", whatsapp: "let-op", boeken: "let-op" });
    const scores = Object.fromEntries(extraScores(f).map((s) => [s.id, s.score]));
    expect(scores.uitstraling).toBeLessThan(50);
    const plan = improvementPlan(f);
    expect(plan.every((p) => p.finding.status !== "goed" && p.wij.length > 20)).toBe(true);
    expect(plan.find((p) => p.finding.id === "privacy")?.wij).toMatch(/privacyverklaring/);
  });

  it("de moderne site scoort goed, op KVK en adres na", () => {
    const f = proposalFindings(extractBusiness(NIEUW, "https://bakkerijmodern.nl/"), 3, now);
    expect(f.filter((x) => x.status !== "goed").map((x) => x.id).sort()).toEqual(["adres", "kvk"]);
    expect(extraScores(f).find((s) => s.id === "contact")?.score).toBe(100);
  });
});
