import { layers, namedFlavor } from "@protomaps/basemaps";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

// ---------------------------------------------------------------------------
// De kaartstijl van ZekerFlex Kaart: OpenStreetMap-vectortegels van Nederland
// (zelf gehost, app/kaart-data), met Nederlandse namen. Licht, donker of
// luchtfoto (PDOK) met namen erover, plus 3D-gebouwen (aan/uit). Alle adressen
// zijn same-origin: de CSP hoeft niets toe te laten.
// ---------------------------------------------------------------------------

export type KaartStijl = "licht" | "donker" | "luchtfoto";

export const KAART_STIJLEN: { id: KaartStijl; label: string }[] = [
  { id: "licht", label: "Licht" },
  { id: "donker", label: "Donker" },
  { id: "luchtfoto", label: "Luchtfoto" },
];

const SMAAK = { licht: "light", donker: "dark", luchtfoto: "dark" } as const;

/** Nederland plus grensstreek: zo ver gaan de tegels. */
export const NL_GRENZEN: [[number, number], [number, number]] = [
  [2.6, 50.4],
  [7.8, 53.9],
];

export const GEBOUWEN_3D = "gebouwen-3d";

const OSM = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bijdragers · <a href="https://protomaps.com">Protomaps</a>';

export function kaartStijl(origin: string, stijl: KaartStijl, drie: boolean): StyleSpecification {
  const smaak = namedFlavor(SMAAK[stijl]);
  const basis = layers("protomaps", smaak, { lang: "nl" }) as LayerSpecification[];
  const namen = layers("protomaps", smaak, { lang: "nl", labelsOnly: true }) as LayerSpecification[];
  const gebouwen: LayerSpecification = {
    id: GEBOUWEN_3D,
    type: "fill-extrusion",
    source: "protomaps",
    "source-layer": "buildings",
    minzoom: 14,
    filter: ["in", ["get", "kind"], ["literal", ["building", "building_part"]]],
    layout: { visibility: drie ? "visible" : "none" },
    paint: {
      "fill-extrusion-color": stijl === "licht" ? "#d8d2c8" : "#3a4552",
      // de hoogte uit OpenStreetMap; zonder hoogte een gewoon huis (±8 m)
      "fill-extrusion-height": ["coalesce", ["get", "height"], 8],
      "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
      "fill-extrusion-opacity": 0.9,
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
