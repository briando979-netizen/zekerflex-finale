import { layers } from "@protomaps/basemaps";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { LETTER, ZF_DONKER, ZF_LICHT, type KaartKleuren } from "@/lib/kaart/kleuren";

// ---------------------------------------------------------------------------
// De kaartstijl van ZekerFlex Kaart: OpenStreetMap-vectortegels van Nederland
// (zelf gehost, app/kaart-data), met Nederlandse namen. Licht, donker of
// luchtfoto (PDOK) met namen erover, plus 3D-gebouwen (aan/uit). Alle adressen
// zijn same-origin: de CSP hoeft niets toe te laten.
//
// De lagen komen van Protomaps (layers(), met onze eigen kleuren uit
// lib/kaart/kleuren.ts). Daarbovenop een handvol verfijningen per laag-id:
// wegklassen met eigen kleur en breedte, spoor met witte streep, gebouwranden,
// meer landgebruik (weiland, woonwijk, sportveld) en duidelijkere plaatsnamen.
// Er verdwijnt geen enkele Protomaps-laag; eigen lagen beginnen met "zf-".
// ---------------------------------------------------------------------------

export type KaartStijl = "licht" | "donker" | "luchtfoto";

export const KAART_STIJLEN: { id: KaartStijl; label: string }[] = [
  { id: "licht", label: "Licht" },
  { id: "donker", label: "Donker" },
  { id: "luchtfoto", label: "Luchtfoto" },
];

/** Welke symbolenset (sprites v4) bij een stijl hoort; luchtfoto gebruikt de donkere namen. */
const SMAAK = { licht: "light", donker: "dark", luchtfoto: "dark" } as const;
const KLEUREN: Record<KaartStijl, KaartKleuren> = { licht: ZF_LICHT, donker: ZF_DONKER, luchtfoto: ZF_DONKER };

/** Nederland plus grensstreek: zo ver gaan de tegels. */
export const NL_GRENZEN: [[number, number], [number, number]] = [
  [2.6, 50.4],
  [7.8, 53.9],
];

export const GEBOUWEN_3D = "gebouwen-3d";

/** De symbolen in sprites v4 (light én dark) die bij een plek horen; andere soorten krijgen geen icoon. */
export const KAART_SYMBOLEN = [
  "aerodrome", "animal", "artwork", "attraction", "bar", "beach", "beauty", "bench", "books", "building",
  "bus_stop", "cafe", "clothes", "convenience", "drinking_water", "electronics", "fast_food", "ferry_terminal",
  "forest", "garden", "library", "marina", "museum", "park", "peak", "post_office", "restaurant", "school",
  "stadium", "supermarket", "theatre", "toilets", "train_station", "university", "zoo",
] as const;

const OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers · <a href="https://protomaps.com">Protomaps</a>';

// --- verfijningen ----------------------------------------------------------

type Laag = { id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown>; [sleutel: string]: unknown };
type Verfijning = (laag: Laag, k: KaartKleuren) => Laag;

const ZOOM = ["zoom"];
const GROEI = ["exponential", 1.6];

/** Eén waarde per wegklasse van een "major_road": autoweg (trunk), hoofdweg (primary), provinciale weg (secondary), rest (tertiary). */
function perKlasse(autoweg: unknown, hoofdweg: unknown, provinciaal: unknown, rest: unknown): unknown[] {
  return [
    "match",
    ["get", "kind_detail"],
    ["trunk", "trunk_link"],
    autoweg,
    ["primary", "primary_link"],
    hoofdweg,
    ["secondary", "secondary_link"],
    provinciaal,
    rest,
  ];
}

const BREED_SNELWEG = ["interpolate", GROEI, ZOOM, 4, 0, 6, 1, 9, 1.8, 12, 3.2, 15, 7, 18, 20];
const BREED_HOOFDWEG = [
  "interpolate", GROEI, ZOOM,
  6, 0,
  8, perKlasse(1.2, 0.7, 0.3, 0),
  10, perKlasse(1.8, 1.3, 0.9, 0.5),
  12, perKlasse(2.8, 2.3, 1.7, 1.2),
  15, perKlasse(6.5, 5.5, 4.5, 3.6),
  18, perKlasse(19, 17, 15, 13),
];
const BREED_AFRIT = ["interpolate", GROEI, ZOOM, 12, 0, 13, 1, 15, 2.6, 18, 9];
const BREED_STRAAT = ["interpolate", GROEI, ZOOM, 11, 0, 12.5, 0.5, 15, 2.6, 18, 12];
const RAND = ["interpolate", ["linear"], ZOOM, 7, 0, 7.5, 0.8, 14, 1, 17, 1.6];

function wegKleur(k: KaartKleuren): unknown[] {
  return perKlasse(k.wegen.autoweg, k.wegen.hoofdweg, k.wegen.provinciaal, k.wegen.gebiedsweg);
}
function wegRand(k: KaartKleuren): unknown[] {
  return perKlasse(k.wegen.autowegRand, k.wegen.hoofdwegRand, k.wegen.provinciaalRand, k.wegen.gebiedswegRand);
}
const verf = (laag: Laag, paint: Record<string, unknown>): Laag => ({ ...laag, paint: { ...laag.paint, ...paint } });
const vorm = (laag: Laag, layout: Record<string, unknown>): Laag => ({ ...laag, layout: { ...laag.layout, ...layout } });

/** Per Protomaps-laag-id wat we anders doen. De test controleert dat al deze lagen echt bestaan. */
export const VERFIJNINGEN: Record<string, Verfijning> = {
  // landschap: het groen blijft zichtbaar op het hele land (Protomaps liet het bij zoom 7 al wegvallen)
  landcover: (l) => verf(l, { "fill-opacity": ["interpolate", ["linear"], ZOOM, 7, 1, 8, 0] }),
  landuse_park: (l) => verf(l, { "fill-opacity": ["interpolate", ["linear"], ZOOM, 6, 0.55, 10, 1] }),
  buildings: (l, k) =>
    verf(l, {
      "fill-color": k.smaak.buildings,
      "fill-outline-color": k.gebouwRand,
      "fill-opacity": ["interpolate", ["linear"], ZOOM, 13, 0, 14.5, 1],
    }),

  // wegen: snelweg > autoweg > hoofdweg > provinciale weg > straat, elk met een rand
  roads_minor_casing: (l) => verf(l, { "line-gap-width": BREED_STRAAT }),
  roads_minor: (l) => verf(l, { "line-width": BREED_STRAAT }),
  roads_link_casing: (l, k) =>
    verf(l, {
      "line-color": ["match", ["get", "kind"], "highway", k.smaak.highway_casing_late, k.smaak.link_casing],
      "line-gap-width": BREED_AFRIT,
    }),
  roads_link: (l, k) =>
    verf(l, {
      "line-color": ["match", ["get", "kind"], "highway", k.smaak.highway, ["match", ["get", "kind_detail"], "trunk_link", k.wegen.autoweg, k.smaak.link]],
      "line-width": BREED_AFRIT,
    }),
  roads_major_casing_late: (l, k) => verf(l, { "line-color": wegRand(k), "line-gap-width": BREED_HOOFDWEG, "line-width": RAND }),
  roads_major_casing_early: (l, k) => verf(l, { "line-color": wegRand(k), "line-gap-width": BREED_HOOFDWEG, "line-width": RAND }),
  roads_major: (l, k) => verf(l, { "line-color": wegKleur(k), "line-width": BREED_HOOFDWEG }),
  roads_highway_casing_late: (l) => verf(l, { "line-gap-width": BREED_SNELWEG, "line-width": RAND }),
  roads_highway_casing_early: (l) => verf(l, { "line-gap-width": BREED_SNELWEG, "line-width": RAND }),
  roads_highway: (l) => verf(l, { "line-width": BREED_SNELWEG }),
  roads_bridges_major_casing: (l, k) => verf(l, { "line-color": wegRand(k), "line-gap-width": BREED_HOOFDWEG, "line-width": RAND }),
  roads_bridges_major: (l, k) => verf(l, { "line-color": wegKleur(k), "line-width": BREED_HOOFDWEG }),
  roads_bridges_highway_casing: (l) => verf(l, { "line-gap-width": BREED_SNELWEG, "line-width": RAND }),
  roads_bridges_highway: (l) => verf(l, { "line-width": BREED_SNELWEG }),
  roads_tunnels_major: (l) => verf(l, { "line-width": BREED_HOOFDWEG }),
  roads_tunnels_major_casing: (l) => verf(l, { "line-gap-width": BREED_HOOFDWEG }),
  roads_tunnels_highway: (l) => verf(l, { "line-width": BREED_SNELWEG }),
  roads_tunnels_highway_casing: (l) => verf(l, { "line-gap-width": BREED_SNELWEG, "line-width": RAND }),

  // spoor: een doorgetrokken grijze lijn (de witte streep ligt erboven, zf-spoor-streep); tram en metro
  // dun en licht, anders lijkt elke tramlijn in de binnenstad een hoofdweg
  roads_rail: (l, k) => ({
    ...l,
    paint: {
      "line-color": ["match", ["get", "kind_detail"], ["tram", "light_rail", "subway"], k.tram, k.smaak.railway],
      "line-width": [
        "interpolate", GROEI, ZOOM,
        7, 0.4,
        10, 0.8,
        13, ["match", ["get", "kind_detail"], ["tram", "light_rail", "subway"], 0.5, 1.6],
        16, ["match", ["get", "kind_detail"], ["tram", "light_rail", "subway"], 1, 3],
        18, ["match", ["get", "kind_detail"], ["tram", "light_rail", "subway"], 1.6, 4.5],
      ],
    },
  }),

  // grenzen: land en provincie; gemeentegrenzen maken de kaart alleen onrustig
  boundaries_country: (l) => verf(l, { "line-width": ["interpolate", ["linear"], ZOOM, 5, 0.8, 10, 1.8] }),
  boundaries: (l) => ({ ...verf(l, { "line-width": 0.8 }), filter: ["all", [">", "kind_detail", 2], ["<=", "kind_detail", 4]] }),

  // namen
  roads_labels_minor: (l) =>
    verf(vorm(l, { "text-size": ["interpolate", ["linear"], ZOOM, 15, 11, 18, 13] }), { "text-halo-width": 1.5 }),
  roads_labels_major: (l) =>
    verf(vorm(l, { "text-font": [LETTER.vet], "text-size": ["interpolate", ["linear"], ZOOM, 11, 11, 15, 12.5, 18, 14] }), { "text-halo-width": 1.5 }),
  water_waterway_label: (l) => verf(vorm(l, { "text-size": ["interpolate", ["linear"], ZOOM, 13, 11, 17, 13] }), { "text-halo-width": 1.2 }),
  water_label_lakes: (l) => verf(l, { "text-halo-width": 1.2 }),
  water_label_ocean: (l) => verf(l, { "text-halo-width": 1.2 }),
  pois: (l) =>
    verf(
      vorm(l, {
        // alleen symbolen die echt in de set staan (bv. geen "townhall": dan het gebouwtje)
        "icon-image": ["match", ["get", "kind"], [...KAART_SYMBOLEN], ["get", "kind"], "station", "train_station", "townhall", "building", ""],
        "text-size": ["interpolate", ["linear"], ZOOM, 15, 11, 17, 11.5, 19, 14],
      }),
      { "text-halo-width": 1.5 },
    ),
  places_subplace: (l) => verf(l, { "text-halo-width": 1.5 }),
  places_region: (l) => verf(vorm(l, { "text-letter-spacing": 0.15 }), { "text-halo-width": 1.5 }),
  places_locality: (l, k) =>
    verf(
      vorm(l, {
        "text-font": ["case", ["any", ["==", ["get", "kind_detail"], "city"], ["<=", ["get", "min_zoom"], 5]], ["literal", [LETTER.vet]], ["literal", [LETTER.gewoon]]],
        // stad > plaats > dorp > gehucht; op straatniveau weer kleiner, dan gaat het om de straten
        "text-size": [
          "interpolate", ["linear"], ZOOM,
          5, ["match", ["get", "kind_detail"], "city", 12, "town", 10, 9],
          8, ["match", ["get", "kind_detail"], "city", 15, "town", 12, 10.5],
          11, ["match", ["get", "kind_detail"], "city", 18, "town", 15, "village", 13, 11.5],
          13, ["match", ["get", "kind_detail"], "city", 19, "town", 16, "village", 14, 12.5],
          16, ["match", ["get", "kind_detail"], "city", 16, "town", 15, "village", 14, 13],
        ],
      }),
      {
        "text-color": ["match", ["get", "kind_detail"], ["city", "town"], k.plaats.stad, "village", k.plaats.dorp, k.plaats.gehucht],
        "text-halo-width": 1.6,
      },
    ),
  places_country: (l) => verf(vorm(l, { "text-letter-spacing": 0.12 }), { "text-halo-width": 1.5 }),
};

/** Eigen lagen, telkens direct ná de genoemde Protomaps-laag. */
function extraLagen(k: KaartKleuren): { na: string; laag: Laag }[] {
  return [
    {
      // weiland, akkers, woonwijken, sportvelden en natte natuur: Protomaps tekent die niet
      na: "landcover",
      laag: {
        id: "zf-landgebruik",
        type: "fill",
        source: "protomaps",
        "source-layer": "landuse",
        filter: ["in", ["get", "kind"], ["literal", ["meadow", "farmland", "residential", "commercial", "retail", "pitch", "recreation_ground", "garden", "wetland", "marsh"]]],
        paint: {
          "fill-color": [
            "match",
            ["get", "kind"],
            ["meadow", "farmland"],
            k.land.wei,
            ["residential", "commercial", "retail"],
            k.land.bebouwd,
            ["wetland", "marsh"],
            k.land.nat,
            k.land.sport,
          ],
        },
      },
    },
    {
      na: "roads_rail",
      laag: {
        id: "zf-spoor-streep",
        type: "line",
        source: "protomaps",
        "source-layer": "roads",
        minzoom: 12,
        filter: ["all", ["==", ["get", "kind"], "rail"], ["==", ["get", "kind_detail"], "rail"], ["!", ["has", "is_tunnel"]]],
        paint: {
          "line-color": k.spoorStreep,
          "line-dasharray": [3, 3],
          "line-width": ["interpolate", GROEI, ZOOM, 12, 0.4, 15, 1, 18, 2],
        },
      },
    },
  ];
}

/** Zet een lettertype dat niet op de server staat (Protomaps noemt Devanagari) om naar gewone Noto Sans. */
function alleenEigenLetters(waarde: unknown): unknown {
  if (waarde === "Noto Sans Devanagari Regular v1") return LETTER.gewoon;
  if (Array.isArray(waarde)) return waarde.map(alleenEigenLetters);
  if (waarde && typeof waarde === "object") return Object.fromEntries(Object.entries(waarde).map(([s, w]) => [s, alleenEigenLetters(w)]));
  return waarde;
}

function verfijn(lagen: LayerSpecification[], k: KaartKleuren): LayerSpecification[] {
  const extra = extraLagen(k);
  const uit: LayerSpecification[] = [];
  for (const origineel of lagen) {
    const laag = origineel as unknown as Laag;
    const aanpassing = Object.hasOwn(VERFIJNINGEN, laag.id) ? VERFIJNINGEN[laag.id] : undefined;
    uit.push(alleenEigenLetters(aanpassing ? aanpassing(laag, k) : laag) as LayerSpecification);
    for (const e of extra) if (e.na === laag.id) uit.push(e.laag as unknown as LayerSpecification);
  }
  return uit;
}

export function kaartStijl(origin: string, stijl: KaartStijl, drie: boolean): StyleSpecification {
  const k = KLEUREN[stijl];
  const basis = verfijn(layers("protomaps", k.smaak, { lang: "nl" }) as LayerSpecification[], k);
  const namen = verfijn(layers("protomaps", k.smaak, { lang: "nl", labelsOnly: true }) as LayerSpecification[], k);
  const gebouwen: LayerSpecification = {
    id: GEBOUWEN_3D,
    type: "fill-extrusion",
    source: "protomaps",
    "source-layer": "buildings",
    minzoom: 14,
    filter: ["in", ["get", "kind"], ["literal", ["building", "building_part"]]],
    layout: { visibility: drie ? "visible" : "none" },
    paint: {
      "fill-extrusion-color": k.gebouw3d,
      // de hoogte uit OpenStreetMap; zonder hoogte een gewoon huis (±8 m)
      "fill-extrusion-height": ["coalesce", ["get", "height"], 8],
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
      // op de luchtfoto doorzichtiger, zodat de foto eronder zichtbaar blijft
      "fill-extrusion-opacity": stijl === "luchtfoto" ? 0.55 : 0.9,
    },
  };

  let lagen: LayerSpecification[];
  if (stijl === "luchtfoto") {
    lagen = [{ id: "luchtfoto", type: "raster", source: "luchtfoto" }, gebouwen, ...namen];
  } else {
    // gebouwen in 3D vóór de eerste namenlaag, zodat namen erboven blijven
    const eersteNaam = basis.findIndex((l) => l.type === "symbol");
    lagen = eersteNaam < 0 ? [...basis, gebouwen] : [...basis.slice(0, eersteNaam), gebouwen, ...basis.slice(eersteNaam)];
  }

  return {
    version: 8,
    glyphs: `${origin}/kaart-data/fonts/{fontstack}/{range}.pbf`,
    sprite: `${origin}/kaart-data/sprites/${SMAAK[stijl]}`,
    sources: {
      protomaps: { type: "vector", url: `pmtiles://${origin}/kaart-data/nl.pmtiles`, attribution: OSM },
      ...(stijl === "luchtfoto"
        ? {
            luchtfoto: {
              type: "raster" as const,
              tiles: [`${origin}/api/kaart/luchtfoto/{z}/{x}/{y}`],
              tileSize: 256,
              minzoom: 6,
              maxzoom: 19,
              bounds: [3.0, 50.6, 7.4, 53.7] as [number, number, number, number],
              attribution: 'Luchtfoto © <a href="https://www.beeldmateriaal.nl">Beeldmateriaal Nederland</a> (PDOK)',
            },
          }
        : {}),
    },
    layers: lagen,
  };
}
