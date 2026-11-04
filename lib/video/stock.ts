// ---------------------------------------------------------------------------
// Eigen, vrij te gebruiken foto's die al op de site staan (Pexels/Unsplash/
// publiek domein, zie public/shifts/CREDITS.md en public/marketing/README.md),
// met trefwoorden zodat de AI-video bij elke scène een passende foto vindt.
// Twee marketingfoto's met ingebakken tekst ("SNEL GEREGELD") staan er bewust
// niet in. Puur bestand: ook bruikbaar in de editor.
// ---------------------------------------------------------------------------

export interface StockFoto {
  adres: string;
  naam: string;
  woorden: string[];
}

export const STOCK_FOTOS: StockFoto[] = [
  { adres: "/marketing/hero-freelancer.jpg", naam: "Freelancer onderweg", woorden: ["freelancer", "zzp", "flexwerker", "werk", "telefoon", "app", "stad", "onderweg", "vrijheid", "baan", "vacature"] },
  { adres: "/marketing/freelancer-at-work.jpg", naam: "Aan het werk", woorden: ["werk", "magazijn", "logistiek", "freelancer", "aanpakken", "dienst", "klus"] },
  { adres: "/marketing/employer-branch.jpg", naam: "Bedrijf en team", woorden: ["bedrijf", "werkgever", "manager", "team", "personeel", "planning", "ondernemer"] },
  { adres: "/marketing/team-shift.jpg", naam: "Team op de vloer", woorden: ["team", "samen", "collega", "dienst", "personeel", "rooster", "shift"] },
  { adres: "/shifts/horeca.jpg", naam: "Horeca", woorden: ["horeca", "restaurant", "cafe", "bar", "bediening", "keuken", "kok", "terras", "hotel"] },
  { adres: "/shifts/logistiek.jpg", naam: "Logistiek", woorden: ["logistiek", "magazijn", "orderpicker", "heftruck", "pakket", "distributie", "transport"] },
  { adres: "/shifts/retail.jpg", naam: "Winkel", woorden: ["winkel", "retail", "supermarkt", "kassa", "verkoop", "vakkenvuller"] },
  { adres: "/shifts/bouw.jpg", naam: "Bouw", woorden: ["bouw", "bouwvakker", "aannemer", "techniek", "installatie", "klussen"] },
  { adres: "/shifts/zorg.jpg", naam: "Zorg", woorden: ["zorg", "verpleging", "thuiszorg", "ouderen", "gezondheid", "verzorgende"] },
  { adres: "/shifts/schoonmaak.jpg", naam: "Schoonmaak", woorden: ["schoonmaak", "schoonmaker", "hygiëne", "kantoor", "poetsen"] },
  { adres: "/shifts/evenement.jpg", naam: "Evenement", woorden: ["evenement", "festival", "concert", "beurs", "feest", "crew"] },
  { adres: "/shifts/kantoor.jpg", naam: "Kantoor", woorden: ["kantoor", "administratie", "receptie", "laptop", "boekhouding", "financiën", "factuur"] },
  { adres: "/shifts/productie.jpg", naam: "Productie", woorden: ["productie", "fabriek", "operator", "inpak", "lopende band"] },
  { adres: "/shifts/beveiliging.jpg", naam: "Beveiliging", woorden: ["beveiliging", "beveiliger", "veiligheid", "toezicht", "verkeersregelaar"] },
  { adres: "/shifts/auto.jpg", naam: "Auto", woorden: ["auto", "chauffeur", "rijden", "rijschool", "garage", "wassen", "monteur"] },
  { adres: "/shifts/kinderopvang.jpg", naam: "Kinderopvang", woorden: ["kinderopvang", "kinderen", "onderwijs", "school", "bso", "leidster"] },
  { adres: "/shifts/promotie.jpg", naam: "Promotie", woorden: ["promotie", "flyer", "marketing", "reclame", "sales", "klanten"] },
  { adres: "/shifts/agrarisch.jpg", naam: "Agrarisch", woorden: ["agrarisch", "oogst", "tuinbouw", "kas", "boer", "seizoenswerk"] },
  { adres: "/shifts/algemeen.jpg", naam: "Algemeen", woorden: ["algemeen", "werk", "mensen", "baan"] },
];

const normaal = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** De best passende foto bij een paar trefwoorden; `gebruikt` liever niet nog eens. */
export function kiesStockFoto(trefwoorden: string[], gebruikt: Set<string> = new Set()): StockFoto {
  const woorden = trefwoorden.flatMap((w) => normaal(w).split(/[\s,/-]+/)).filter((w) => w.length > 2);
  let beste: StockFoto = STOCK_FOTOS[0]!;
  let score = -Infinity;
  for (const f of STOCK_FOTOS) {
    let s = 0;
    for (const w of woorden) {
      for (const fw of f.woorden.map(normaal)) {
        if (fw === w) s += 3;
        else if (fw.startsWith(w) || w.startsWith(fw)) s += 1.5;
      }
    }
    // Afwisseling telt zwaar: een video met vijf keer dezelfde foto verveelt.
    if (gebruikt.has(f.adres)) s -= 4;
    if (s > score) {
      score = s;
      beste = f;
    }
  }
  return beste;
}
