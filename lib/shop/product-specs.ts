// Extra productinformatie voor de detailpagina: specificatie-opsomming en
// (optioneel) een maattabel. Gekoppeld op slug. Producten zonder entry vallen
// terug op de losse zinnen uit `description`.

export type SizeTable = {
  note: string;
  columns: string[]; // koptekst per kolom, eerste = maatnaam
  rows: (string | number)[][];
  legend?: string[];
};

export type ProductSpec = {
  bullets: string[];
  fit?: string;
  sizeTable?: SizeTable;
};

export const PRODUCT_SPECS: Record<string, ProductSpec> = {
  "slim-fit-contrast-tshirt-heren": {
    fit: "Slim fit — valt normaal",
    bullets: [
      "Slim fit voor een nauwsluitende pasvorm",
      "Contrastboorden bij hals en mouwen",
      "Comfortabel dankzij het elastische materiaal",
      "Grammage: 160 g/m²",
      "Materiaal: 95% biologisch katoen, 5% elastaan",
    ],
    sizeTable: {
      note: "Vergelijk de afmetingen met een T-shirt dat je al hebt. Leg het kledingstuk plat neer om te meten.",
      legend: ["A — Lengte (cm)", "B — Breedte (cm)", "C — Mouwlengte (cm)"],
      columns: ["Maat", "A", "B", "C"],
      rows: [
        ["XS", 62.5, 44.5, 19.5],
        ["S", 63.5, 46.5, 19.9],
        ["M", 65.0, 49.0, 20.5],
        ["L", 66.5, 51.5, 21.1],
        ["XL", 68.0, 54.0, 21.7],
        ["XXL", 69.5, 57.0, 22.5],
      ],
    },
  },
  "biologische-mesh-boodschappentas": {
    fit: "Eén maat",
    bullets: [
      "Lichte mesh boodschappentas, ideaal voor boodschappen en dagelijks gebruik",
      "Te gebruiken als schoudertas of draagtas",
      "Katoenen paneel voor personalisatie",
      "Draagvermogen tot 6 kg",
      "Afmetingen: 38 × 41 cm — inhoud 10 l",
      "Lengte van de hengsels: 61 cm",
      "Materiaal: 100% biologisch katoen",
    ],
    sizeTable: {
      note: "Afmetingen van de tas.",
      legend: ["A — Hoogte (cm)", "B — Breedte (cm)", "C — Hengsellengte (cm)"],
      columns: ["Maat", "A", "B", "C"],
      rows: [["Eén maat", 41.0, 38.0, 61.0]],
    },
  },
};

export function specFor(slug: string, description: string): ProductSpec {
  const hit = PRODUCT_SPECS[slug];
  if (hit) return hit;
  const bullets = description
    .split(/(?<=\.)\s+|\s+·\s+/)
    .map((s) => s.replace(/\.$/, "").trim())
    .filter(Boolean);
  return { bullets };
}
