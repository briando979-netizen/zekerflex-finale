// Gebruik: node scripts/uitleg-videos/maak.cjs <slug>  -> .werk/<slug>.mp4 en <slug>.jpg. Alleen openbare pagina's en eigen testgegevens.
const { W, wacht, glij, maakVideo, poster } = require("./lib.cjs");

/** Rustig naar beneden over de seconden van de scene. */
const scroll = (naar, deel = 0.85) => async (p, s) => {
  await wacht(500);
  const hoog = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await glij(p, Math.min(hoog, naar), (s - 1) * 1000 * deel);
};
/** Haalt de opbouwbalk en (op de incheckterminal) de apparaatmeldingen uit beeld; alleen uiterlijk, geen gegevens. */
const schoon = (p) => p.evaluate(() => {
  for (const el of document.querySelectorAll("div,section,aside")) {
    const t = el.textContent || "";
    if (t.startsWith("ZekerFlex is nog in de opbouwfase") && t.length < 600) { el.style.display = "none"; break; }
  }
  for (const el of document.querySelectorAll("div")) {
    const t = el.textContent || "";
    if ((t.startsWith("Sleutelhanger") || t.startsWith("Werkpaspoort")) && t.length < 200) el.style.display = "none";
  }
  // een stickerlink is een toegangslink: nooit in beeld
  for (const el of document.querySelectorAll("*")) {
    if (el.children.length === 0 && /Stickerlink|zekerflex\.com\/i\//.test(el.textContent || "")) el.style.visibility = "hidden";
  }
}).catch(() => {});
const klok = () => { const t0 = Date.now(); return async (sec) => wacht(Math.max(0, sec * 1000 - (Date.now() - t0))); };
/** Glijdt zo dat het element ruim in beeld staat (bovenkant op 130 px). */
async function glijNaar(p, loc, ms = 1200, boven = 130) {
  const y = await loc.evaluate((e, b) => e.getBoundingClientRect().top + window.scrollY - b, boven);
  await glij(p, Math.max(0, y), ms);
}
async function muisNaar(p, loc, ms = 800) {
  const bb = await loc.boundingBox();
  await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: Math.max(10, Math.round(ms / 25)) });
}

const fs = require("fs");
const TERMINAL = process.env.UITLEG_TERMINAL || ""; // de schermlink van een tijdelijke terminal (nooit in git of in een log)
const VIDEOS = {
  "wat-is-zekerflex": [
    { url: "/", tekst: "ZekerFlex is het Nederlandse platform voor flexwerk. Flexwerkers, zelfstandigen en uitzendkrachten vinden klussen in de buurt, en bedrijven vinden zonder bureau ertussen betrouwbare krachten.", actie: scroll(700) },
    { url: "/aanbod", tekst: "Je regelt personeel, je website en klanten, software voor je branche en je administratie op één plek, met één account.", actie: scroll(900) },
    { url: "/voor-bedrijven", tekst: "Een bedrijf plaatst een klus en krijgt geverifieerde krachten in de buurt voorgesteld. Jij kiest wie je inroostert.", actie: scroll(800) },
    { url: "/prijzen", tekst: "Voor personeel betaal je het uurtarief van de kracht plus drie euro vijftig platformkosten per gewerkt uur, en alleen als er echt gewerkt is.", actie: scroll(600) },
  ],
  "klus-plaatsen": [
    {
      url: "/klus-plaatsen",
      tekst: [
        "Ga naar klus plaatsen. Je hoeft geen account te maken om te beginnen.",
        "Kies een functie voor je klus, bijvoorbeeld bediening in de horeca.",
        "Vul in waar en wanneer je iemand nodig hebt.",
        "Rechts zie je meteen hoe je klus eruitziet en wat hij kost: het loon van de kracht, de platformkosten en het totaal.",
        "Pas als je de klus echt plaatst, maak je een gratis account. Je betaalt pas als er gewerkt is.",
      ],
      actie: async (p, s, m) => {
        const tot = klok();
        await tot(m[0]);
        await glij(p, 380, 1500);
        await tot(m[1]);
        const tegel = p.getByRole("button", { name: /Bediening \/ horeca/ }).first();
        await glijNaar(p, tegel, 1300, 200);
        await muisNaar(p, tegel, 900);
        await wacht(300);
        await tegel.click();
        await tot(m[2]);
        const plaats = p.locator('input[placeholder="Bijv. Utrecht"]');
        await glijNaar(p, plaats, 1300, 220);
        await plaats.click();
        await plaats.pressSequentially("Utrecht", { delay: 140 });
        const d = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
        await p.locator('input[type="date"]').fill(d);
        const tijden = p.locator('input[type="time"]');
        await tijden.nth(0).fill("17:00");
        await tijden.nth(1).fill("23:00");
        await tot(m[3]);
        const kosten = p.getByText("Totaal excl. btw").first();
        await glijNaar(p, kosten, 1300, 420);
        await tot(m[4]);
        const knop = p.getByRole("link", { name: /Plaats deze klus/ }).or(p.getByRole("button", { name: /Plaats deze klus/ })).first();
        await muisNaar(p, knop, 900);
      },
    },
  ],
  "uitzenden-of-freelance": [
    { url: "/uitzendbureau", tekst: "Bij ZekerFlex werk je als zelfstandige, of als uitzendkracht via een aangesloten uitzendbureau.", actie: scroll(500) },
    { url: "/uitzendbureau", tekst: "Bij een uitzendkracht is het uitzendbureau de werkgever. Het regelt contract, loon en pensioen volgens zijn cao.", actie: async (p, s) => { await wacht(400); await glij(p, 1100, (s - 1) * 900); } },
    { url: "/voor-bedrijven", tekst: "Een zelfstandige werkt met een eigen factuur. Jij betaalt het uurtarief van de kracht en de platformkosten per gewerkt uur.", actie: scroll(800) },
    { url: "/personeel-inhuren", tekst: "Jij kiest per klus wat het beste past, en je plaatst hem in een paar minuten.", actie: scroll(500) },
  ],
  "uren-goedkeuren": [
    { url: "/aanbod/automatisch-inchecken", tekst: "Je kracht checkt in op de werkplek: automatisch via de geofence van je vestiging, met een QR-code of met een Bluetooth-baken.", actie: scroll(600) },
    { url: TERMINAL, tekst: "Bij de ingang staat een tablet met een QR-code die elke minuut wisselt. De kracht scant hem met de telefoon.", actie: async (p, s) => { await schoon(p); await wacht((s - 0.5) * 1000); } },
    { url: "/werkgever/inchecken", sessie: true, tekst: "In je beheer maak je per vestiging een terminal en print je een sticker.", actie: async (p, s) => { await schoon(p); await scroll(500)(p, s); } },
    { url: "/werkgever/uren", sessie: true, tekst: "De uren staan daarna klaar om goed te keuren, met het bewijs erbij. Met één tik keur je ze goed, en daarna loopt de facturatie automatisch.", actie: async (p, s) => { await schoon(p); await scroll(300)(p, s); } },
  ],
  "kosten-en-facturen": [
    { url: "/prijzen", tekst: "Je betaalt het uurtarief van de kracht plus drie euro vijftig platformkosten per gewerkt uur. Zonder abonnement of opstartkosten.", actie: scroll(700) },
    {
      url: "/rekentools/kosten-uitzendkracht-berekenen",
      tekst: ["Wil je het uitrekenen? Met de gratis rekentool zie je wat een uitzendkracht of een flexkracht je kost.", "Vul het aantal krachten, de uren en de weken in, en je ziet het verschil meteen."],
      actie: async (p, s, m) => {
        const tot = klok();
        await tot(m[0]);
        await glij(p, 250, 1200);
        await tot(m[1]);
        for (const [naam, waarde] of [["kf-workers", "5"], ["kf-hours", "40"], ["kf-weeks", "8"]]) {
          const veld = p.locator(`input[name="${naam}"], #${naam}`).first();
          await muisNaar(p, veld, 500);
          await veld.click();
          await veld.fill("");
          await veld.pressSequentially(waarde, { delay: 160 });
          await wacht(350);
        }
      },
    },
    { url: "/aanbod/facturen-en-betalen", tekst: "Facturen komen vanzelf uit goedgekeurde uren, en betaalverzoeken gaan met een QR-code. Alles in dezelfde omgeving.", actie: scroll(500) },
    { url: "/uitzendbureau", tekst: "Bij uitzenden regelt het aangesloten uitzendbureau de cao beloning en de loonadministratie.", actie: scroll(700) },
  ],
};

(async () => {
  const slug = process.argv[2];
  if (!Object.hasOwn(VIDEOS, slug)) throw new Error("onbekende video " + slug);
  const mp4 = await maakVideo(slug, VIDEOS[slug]);
  poster(mp4, 4, `${W}/${slug}.jpg`);
  console.log("klaar", mp4);
})().catch((e) => { console.error("FOUT", e.message); process.exit(1); });
