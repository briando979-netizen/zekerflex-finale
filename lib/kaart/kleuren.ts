import type { Flavor } from "@protomaps/basemaps";

// ---------------------------------------------------------------------------
// De kleuren van ZekerFlex Kaart, licht en donker. Puur (alleen gegevens), zodat
// lib/kaart/stijl.ts ze in de Protomaps-lagen kan zetten en een test ze kan
// nalopen. Rustig blauw water, warm gebroken wit land, duidelijk groen voor parken
// en bos, en een wegenhiërarchie: snelweg (zacht geel), autoweg (lichtgeel),
// hoofdweg en provinciale weg (wit met een donkerder rand), straat (wit).
// Oranje staat bewust nergens in de ondergrond: dat is van onze eigen stippen
// en routes, die moeten er altijd bovenuit springen.
// ---------------------------------------------------------------------------

/** De enige lettertypes die op de server staan (deploy/kaart/haal-kaart.sh, app/kaart-data). */
export const KAART_LETTERTYPES = ["Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic"] as const;
export type KaartLettertype = (typeof KAART_LETTERTYPES)[number];

export const LETTER: { gewoon: KaartLettertype; vet: KaartLettertype; schuin: KaartLettertype } = {
  gewoon: "Noto Sans Regular",
  vet: "Noto Sans Medium",
  schuin: "Noto Sans Italic",
};

/** Kleuren die de Protomaps-smaak niet kent: wegklassen, spoor, gebouwranden, landgebruik, plaatsnamen. */
export type KaartKleuren = {
  smaak: Flavor;
  wegen: {
    autoweg: string;
    autowegRand: string;
    hoofdweg: string;
    hoofdwegRand: string;
    provinciaal: string;
    provinciaalRand: string;
    gebiedsweg: string;
    gebiedswegRand: string;
  };
  spoorStreep: string;
  tram: string;
  gebouwRand: string;
  gebouw3d: string;
  land: { wei: string; bebouwd: string; sport: string; nat: string };
  plaats: { stad: string; dorp: string; gehucht: string };
};

export const ZF_LICHT: KaartKleuren = {
  smaak: {
    background: "#ECEBE5",
    earth: "#F4F3EE",
    park_a: "#D9EDD9",
    park_b: "#CDE8CF",
    hospital: "#F7E3E1",
    industrial: "#EAE7E2",
    school: "#F3EAD9",
    wood_a: "#D2E7CF",
    wood_b: "#C1DFC0",
    pedestrian: "#EFEDE7",
    scrub_a: "#E0EDD8",
    scrub_b: "#D9EBD3",
    glacier: "#FFFFFF",
    sand: "#F3EBCF",
    beach: "#F5ECCB",
    aerodrome: "#E8E8EC",
    runway: "#D5D7DE",
    water: "#A9CCEA",
    zoo: "#D6EBD3",
    military: "#ECE6E1",

    tunnel_other_casing: "#DAD6CC",
    tunnel_minor_casing: "#DAD6CC",
    tunnel_link_casing: "#DAD6CC",
    tunnel_major_casing: "#D3CDC1",
    tunnel_highway_casing: "#E2C27E",
    tunnel_other: "#ECE9E2",
    tunnel_minor: "#F6F4EF",
    tunnel_link: "#F6F4EF",
    tunnel_major: "#F6F4EF",
    tunnel_highway: "#F8E4BA",

    pier: "#E6E3DB",
    buildings: "#E7E3DB",

    minor_service_casing: "#E3DFD6",
    minor_casing: "#DCD7CC",
    link_casing: "#D3CCBE",
    major_casing_late: "#D0C8B8",
    highway_casing_late: "#D9A441",
    other: "#E0DCD2",
    minor_service: "#FFFFFF",
    minor_a: "#E4E1D9",
    minor_b: "#FFFFFF",
    link: "#FFFFFF",
    major_casing_early: "#D6CFC1",
    major: "#FFFFFF",
    highway_casing_early: "#DFB053",
    highway: "#F6CF7B",

    railway: "#9DA3AB",
    boundaries: "#A9A39A",

    bridges_other_casing: "#D8D3C8",
    bridges_minor_casing: "#D3CDC1",
    bridges_link_casing: "#CFC7B8",
    bridges_major_casing: "#C9C0AE",
    bridges_highway_casing: "#D49C37",
    bridges_other: "#EEEBE4",
    bridges_minor: "#FFFFFF",
    bridges_link: "#FFFFFF",
    bridges_major: "#FFFFFF",
    bridges_highway: "#F6CF7B",

    roads_label_minor: "#5F656D",
    roads_label_minor_halo: "#FFFFFF",
    roads_label_major: "#41474F",
    roads_label_major_halo: "#FFFFFF",
    ocean_label: "#3B6894",
    subplace_label: "#787D85",
    subplace_label_halo: "#F4F3EE",
    city_label: "#262B33",
    city_label_halo: "#F7F6F2",
    state_label: "#A0998F",
    state_label_halo: "#F4F3EE",
    country_label: "#5F5A53",

    address_label: "#8A8780",
    address_label_halo: "#FFFFFF",

    regular: LETTER.gewoon,
    bold: LETTER.vet,
    italic: LETTER.schuin,

    pois: {
      blue: "#2A6F9F",
      green: "#2F7D4E",
      lapis: "#3159B5",
      pink: "#A9437A",
      red: "#BF3F49",
      slategray: "#5D6370",
      tangerine: "#9A520E",
      turquoise: "#14798A",
    },

    landcover: {
      grassland: "#E3EEDA",
      barren: "#F0ECE0",
      urban_area: "#E6E3DC",
      farmland: "#EDF0E3",
      glacier: "#FFFFFF",
      scrub: "#E2EBD6",
      forest: "#CFE4CB",
    },
  },
  wegen: {
    autoweg: "#FBE3A6",
    autowegRand: "#E2BD6D",
    hoofdweg: "#FFFFFF",
    hoofdwegRand: "#C9BFAC",
    provinciaal: "#FFFFFF",
    provinciaalRand: "#D2CABA",
    gebiedsweg: "#FFFFFF",
    gebiedswegRand: "#D9D3C7",
  },
  spoorStreep: "#FFFFFF",
  tram: "#BFC3C9",
  gebouwRand: "#D6D0C6",
  gebouw3d: "#DCD6CC",
  land: { wei: "#EEF1E5", bebouwd: "#ECEAE3", sport: "#D3EAD2", nat: "#D7E9DF" },
  plaats: { stad: "#1F242B", dorp: "#41474F", gehucht: "#5E646C" },
};

export const ZF_DONKER: KaartKleuren = {
  smaak: {
    background: "#12161C",
    earth: "#161B22",
    park_a: "#17251F",
    park_b: "#183026",
    hospital: "#2A1E22",
    industrial: "#1D2128",
    school: "#231F1A",
    wood_a: "#192A22",
    wood_b: "#1A3328",
    pedestrian: "#1B2028",
    scrub_a: "#1A271F",
    scrub_b: "#1B2B22",
    glacier: "#22272F",
    sand: "#26241D",
    beach: "#2A271E",
    aerodrome: "#1C2028",
    runway: "#2C323C",
    water: "#173651",
    zoo: "#1A2A22",
    military: "#211F22",

    tunnel_other_casing: "#12161C",
    tunnel_minor_casing: "#12161C",
    tunnel_link_casing: "#12161C",
    tunnel_major_casing: "#12161C",
    tunnel_highway_casing: "#12161C",
    tunnel_other: "#232931",
    tunnel_minor: "#262C35",
    tunnel_link: "#262C35",
    tunnel_major: "#2C333D",
    tunnel_highway: "#4A3F26",

    pier: "#232932",
    buildings: "#232933",

    minor_service_casing: "#161B22",
    minor_casing: "#141920",
    link_casing: "#12161C",
    major_casing_late: "#0F1318",
    highway_casing_late: "#2B2415",
    other: "#29303A",
    minor_service: "#2B323C",
    minor_a: "#2A313B",
    minor_b: "#38414D",
    link: "#3A434F",
    major_casing_early: "#0F1318",
    major: "#46505E",
    highway_casing_early: "#2B2415",
    highway: "#7A6332",

    railway: "#4E5662",
    boundaries: "#56606E",

    bridges_other_casing: "#0F1318",
    bridges_minor_casing: "#0F1318",
    bridges_link_casing: "#0F1318",
    bridges_major_casing: "#0F1318",
    bridges_highway_casing: "#1E190F",
    bridges_other: "#29303A",
    bridges_minor: "#38414D",
    bridges_link: "#3A434F",
    bridges_major: "#46505E",
    bridges_highway: "#7A6332",

    roads_label_minor: "#98A0AB",
    roads_label_minor_halo: "#12161C",
    roads_label_major: "#B9C0C9",
    roads_label_major_halo: "#12161C",
    ocean_label: "#8DB6DB",
    subplace_label: "#8A929D",
    subplace_label_halo: "#12161C",
    city_label: "#E8EBEF",
    city_label_halo: "#0C0E12",
    state_label: "#6B7380",
    state_label_halo: "#12161C",
    country_label: "#A4ACB6",

    address_label: "#7C8490",
    address_label_halo: "#12161C",

    regular: LETTER.gewoon,
    bold: LETTER.vet,
    italic: LETTER.schuin,

    pois: {
      blue: "#6FB0DE",
      green: "#5CC38A",
      lapis: "#8CA6F2",
      pink: "#E58AC0",
      red: "#F0838F",
      slategray: "#A7AEBA",
      tangerine: "#E2A36E",
      turquoise: "#4FC9D3",
    },

    landcover: {
      grassland: "#18241C",
      barren: "#22211D",
      urban_area: "#1E232A",
      farmland: "#19211C",
      glacier: "#2A2F36",
      scrub: "#1C251D",
      forest: "#172A21",
    },
  },
  wegen: {
    autoweg: "#5E5130",
    autowegRand: "#1E190F",
    hoofdweg: "#56616F",
    hoofdwegRand: "#0F1318",
    provinciaal: "#4C5765",
    provinciaalRand: "#0F1318",
    gebiedsweg: "#424C59",
    gebiedswegRand: "#0F1318",
  },
  spoorStreep: "#161B22",
  tram: "#3E4652",
  gebouwRand: "#2E3540",
  gebouw3d: "#2F3743",
  land: { wei: "#182019", bebouwd: "#1B2027", sport: "#1A2E24", nat: "#162722" },
  plaats: { stad: "#F1F3F5", dorp: "#C9CFD6", gehucht: "#9AA2AD" },
};
