import { describe, expect, it } from "vitest";
import { kiesSubpaginas, leesFaq, leesFotos, leesGetuigenissen, leesOpeningstijden, leesOverTekst, leesSinds, leesUsps, tekstVan, voegSamen } from "@/lib/website-check/inlezen";

// De hele website inlezen voor een nieuwe site: subpagina's kiezen, en hun eigen
// openingstijden, vragen, klantverhalen, sterke punten en "sinds" eruit halen.

const NAV = `<nav><a href="/">Home</a><a href="/over-ons">Over ons</a><a href="/diensten/">Diensten</a><a href="/menukaart">Menu</a>
<a href="/contact#route">Contact</a><a href="/privacyverklaring">Privacy</a><a href="https://facebook.com/x">FB</a><a href="mailto:a@b.nl">mail</a>
<a href="https://anderesite.nl/over">Partner</a><a href="/projecten">Ons werk</a><a href="/veelgestelde-vragen">FAQ</a><a href="/brochure.pdf">Brochure</a></nav>`;

describe("kiesSubpaginas", () => {
  it("kiest de nuttige pagina's van dezelfde site, zonder privacy, pdf of andere sites", () => {
    const k = kiesSubpaginas(NAV, "https://www.bakkerij.nl/");
    expect(k).toEqual([
      { url: "https://www.bakkerij.nl/diensten/", soort: "aanbod" },
      { url: "https://www.bakkerij.nl/menukaart", soort: "aanbod" },
      { url: "https://www.bakkerij.nl/over-ons", soort: "over" },
      { url: "https://www.bakkerij.nl/projecten", soort: "werk" },
      { url: "https://www.bakkerij.nl/contact", soort: "contact" },
      { url: "https://www.bakkerij.nl/veelgestelde-vragen", soort: "faq" },
    ]);
    expect(kiesSubpaginas(NAV, "https://www.bakkerij.nl/", 2)).toHaveLength(2);
  });
});

describe("leesFotos", () => {
  it("vindt foto's achter Next.js-optimalisatie, in srcset, lazy en als achtergrond, zonder logo's en dubbele maten", () => {
    const html = `<head><meta property="og:image" content="https://marktzicht.nl/og.jpg"></head><body>
      <img alt="Proost!" srcSet="/_next/image?url=%2Fimages%2Fproost.jpg&amp;w=640&amp;q=75 640w, /_next/image?url=%2Fimages%2Fproost.jpg&amp;w=3840&amp;q=75 3840w" src="/_next/image?url=%2Fimages%2Fproost.jpg&amp;w=3840&amp;q=75">
      <img src="/img/logo.png" alt="Logo Marktzicht"><img src="/icon.svg"><img src="/klein.jpg" width="48" height="48">
      <img data-src="/wp-content/uploads/terras-1024x683.jpg" src="data:image/gif;base64,R0lG"><img src="/wp-content/uploads/terras.jpg">
      <picture><source srcset="/foto/zaal.webp 1x, /foto/zaal@2x.webp 2x"><img src="/foto/zaal.jpg"></picture>
      <div style="background-image: url('/foto/gevel.jpg')"></div></body>`;
    expect(leesFotos(html, "https://marktzicht.nl/")).toEqual([
      "https://marktzicht.nl/og.jpg",
      "https://marktzicht.nl/images/proost.jpg",
      "https://marktzicht.nl/wp-content/uploads/terras-1024x683.jpg",
      "https://marktzicht.nl/foto/zaal@2x.webp",
      "https://marktzicht.nl/foto/zaal.jpg",
      "https://marktzicht.nl/foto/gevel.jpg",
    ]);
  });
});

describe("leesOpeningstijden", () => {
  it("leest regels met dagen en tijden, ook als tijd op de volgende regel staat", () => {
    const html = `<h3>Openingstijden</h3><table><tr><td>Maandag</td><td>Gesloten</td></tr><tr><td>Di t/m vr</td><td>9.00 - 17.30 uur</td></tr>
      <tr><td>Zaterdag</td><td>08:30 tot 16:00</td></tr><tr><td>Zondag</td><td>12:00-17:00</td></tr></table>`;
    expect(leesOpeningstijden(tekstVan(html))).toEqual([
      { dag: "Maandag", tijd: "Gesloten" },
      { dag: "Dinsdag t/m vrijdag", tijd: "09:00 – 17:30" },
      { dag: "Zaterdag", tijd: "08:30 – 16:00" },
      { dag: "Zondag", tijd: "12:00 – 17:00" },
    ]);
  });

  it("leest de vorm van Google, met een pauze", () => {
    expect(leesOpeningstijden("maandag: 09:00–12:00, 13:00–17:00\ndinsdag: 09:00–17:00\nzondag: Gesloten")).toEqual([
      { dag: "Maandag", tijd: "09:00 – 12:00 en 13:00 – 17:00" },
      { dag: "Dinsdag", tijd: "09:00 – 17:00" },
      { dag: "Zondag", tijd: "Gesloten" },
    ]);
  });

  it("verzint niets: losse tekst of één losse dag is geen rooster", () => {
    expect(leesOpeningstijden("Zo snel mogelijk geholpen\nDo it yourself")).toEqual([]);
    expect(leesOpeningstijden("Zaterdag 10:00 - 16:00")).toEqual([]);
    expect(leesOpeningstijden("Ma t/m vr 8:00 - 17:00")).toEqual([{ dag: "Maandag t/m vrijdag", tijd: "08:00 – 17:00" }]);
  });
});

describe("leesFaq, leesGetuigenissen, leesUsps, leesSinds, leesOverTekst", () => {
  it("haalt vragen met hun antwoord", () => {
    const html = `<h3>Bezorgen jullie ook?</h3><p>Ja, binnen 10 km rond de winkel bezorgen we gratis vanaf 25 euro.</p><h3>Wat kost een taart?</h3><p>Een taart op maat begint bij 35 euro, afhankelijk van grootte.</p><h3>Leuk?</h3><p>kort</p>`;
    expect(leesFaq(html)).toEqual([
      { vraag: "Bezorgen jullie ook?", antwoord: "Ja, binnen 10 km rond de winkel bezorgen we gratis vanaf 25 euro." },
      { vraag: "Wat kost een taart?", antwoord: "Een taart op maat begint bij 35 euro, afhankelijk van grootte." },
    ]);
  });

  it("haalt klantverhalen van hun eigen site, sterren alleen als ze er staan", () => {
    const html = `<blockquote><p>Super vriendelijk geholpen en de taart was precies zoals we wilden, echt een aanrader!</p><cite>Marieke uit Utrecht</cite></blockquote>
      <div class="testimonial-card"><div class="stars">★★★★★</div><p>“Altijd verse broodjes en een praatje, al jaren onze vaste bakker.”</p><strong>Jan</strong></div>`;
    expect(leesGetuigenissen(html)).toEqual([
      { naam: "Marieke uit Utrecht", tekst: "Super vriendelijk geholpen en de taart was precies zoals we wilden, echt een aanrader!", sterren: null },
      { naam: "Jan", tekst: "Altijd verse broodjes en een praatje, al jaren onze vaste bakker.", sterren: 5 },
    ]);
  });

  it("haalt sterke punten onder een waarom-kop of met vinkjes", () => {
    const html = `<h2>Waarom kiezen voor ons?</h2><ul><li>Elke dag vers gebakken</li><li>Ambachtelijk sinds 1987</li><li>Gratis bezorging in de buurt</li></ul><ul><li>Home</li></ul><ul><li>✓ Glutenvrij mogelijk</li></ul>`;
    expect(leesUsps(html)).toEqual(["Elke dag vers gebakken", "Ambachtelijk sinds 1987", "Gratis bezorging in de buurt", "Glutenvrij mogelijk"]);
  });

  it("leest 'sinds' alleen als het een echt jaar is", () => {
    const nu = new Date("2026-11-04T12:00:00Z");
    expect(leesSinds("Ambachtelijk bakken sinds 1987 in het hart van Utrecht", nu)).toBe(1987);
    expect(leesSinds("Opgericht in 2031", nu)).toBeNull();
    expect(leesSinds("sinds kort ook op zondag open", nu)).toBeNull();
  });

  it("neemt de alinea's van over ons, zonder cookietekst", () => {
    const html = `<p>Bakkerij Jansen is een familiebedrijf dat al drie generaties brood bakt voor de buurt, met liefde voor het vak.</p><p>Wij gebruiken cookies om de site te verbeteren en jouw voorkeuren te onthouden voor later.</p><p>Kort.</p>`;
    expect(leesOverTekst(html)).toBe("Bakkerij Jansen is een familiebedrijf dat al drie generaties brood bakt voor de buurt, met liefde voor het vak.");
  });
});

describe("voegSamen", () => {
  it("neemt de algemene gegevens van de homepage en de rest van de pagina die erover gaat", () => {
    const home = `<html><head><title>Bakkerij Jansen | Utrecht</title><meta property="og:site_name" content="Bakkerij Jansen"></head><body>
      <img src="/logo.png" alt="logo"><img src="/home.jpg" width="1600" height="900">
      <p>Bakkerij Jansen bakt elke ochtend vers brood, banket en taarten op bestelling voor heel Utrecht en omgeving.</p>
      <h2>Brood</h2><p>Desem, volkoren en meergranen, elke ochtend vers uit de oven.</p><a href="tel:0612345678">bel</a>
      <footer><h3>Handige links</h3><p>Algemene voorwaarden, privacy en vacatures bij ons bedrijf.</p></footer></body></html>`;
    const aanbod = `<html><body><h2>Taarten op bestelling</h2><p>Voor verjaardagen, bruiloften en zomaar, met jouw eigen tekst erop.</p><h2>Brood</h2><p>dubbel</p><img src="/taart.jpg"></body></html>`;
    const contact = `<html><body><p>Dorpsstraat 1, 3511 AB Utrecht</p><p>Maandag Gesloten</p><p>Di t/m za 8:00 - 17:00</p><p>Sinds 1987 aan de Dorpsstraat.</p></body></html>`;
    const f = voegSamen(
      [
        { url: "https://bakkerij.nl/", soort: "home", html: home },
        { url: "https://bakkerij.nl/aanbod", soort: "aanbod", html: aanbod },
        { url: "https://bakkerij.nl/contact", soort: "contact", html: contact },
      ],
      new Date("2026-11-04T12:00:00Z"),
    );
    expect(f.naam).toBe("Bakkerij Jansen");
    expect(f.secties.map((s) => s.kop)).toEqual(["Taarten op bestelling", "Brood"]);
    expect(f.secties[1]?.tekst).toContain("Desem");
    expect(f.fotos).toEqual(["https://bakkerij.nl/home.jpg", "https://bakkerij.nl/taart.jpg"]);
    expect(f.uren).toEqual([
      { dag: "Maandag", tijd: "Gesloten" },
      { dag: "Dinsdag t/m zaterdag", tijd: "08:00 – 17:00" },
    ]);
    expect(f).toMatchObject({ plaats: "Utrecht", postcode: "3511 AB", telefoon: "0612345678", mobiel: true, sinds: 1987, openingstijden: true, google: null });
    expect(f.paginas).toHaveLength(3);
  });
});
