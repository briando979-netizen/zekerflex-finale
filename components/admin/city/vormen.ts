import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Echtere vormen voor de realistische weergave (13 nov, eigenaar: "echte modellen" van mensen, auto's en bomen).
// Zelf getekend uit een paar profielen: gratis 3D-modellen waren niet automatisch te halen of veel te zwaar (één
// boom van 46 tot 100 MB). Elke vorm wordt één keer gemaakt en gedeeld (kit.geo) of als instancing getekend, dus
// het blijft licht. De eenvoudige weergave gebruikt deze vormen niet.

export type Carrosserie = "car" | "van" | "bus";

/** Het midden van elk wiel staat op deze hoogte boven de weg (de straal van het wiel). */
export const WIEL_R = 0.26;
/** Hoe ver de wielkast boven het wiel uitkomt. */
const KAST = 0.05;

/** Zijaanzicht (vlak x = lengte, y = hoogte) uitgerekt over de breedte, met afgeronde randen en gecentreerd. */
function uitrekken(shape: THREE.Shape, breedte: number, rond: number): THREE.BufferGeometry {
  const diepte = Math.max(0.04, breedte - 2 * rond);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: diepte,
    bevelEnabled: rond > 0,
    bevelThickness: rond,
    bevelSize: rond,
    // naar binnen afronden: de vorm blijft precies zo lang en hoog als het profiel
    bevelOffset: -rond,
    bevelSegments: 2,
    curveSegments: 8,
  });
  g.translate(0, 0, -diepte / 2);
  // profiel-x wordt de lengte (voorkant = +z, zoals alle voertuigen), de uitrekking de breedte
  g.rotateY(-Math.PI / 2);
  return g;
}

/** Onderkant van rechts naar voren, met een wielkast boven elk wiel. */
function onderkant(s: THREE.Shape, len: number, onder: number, as: number) {
  const r = WIEL_R + KAST;
  s.moveTo(-len / 2, onder);
  for (const z of [-as, as]) {
    s.lineTo(z - r, onder);
    s.lineTo(z - r, WIEL_R);
    s.absarc(z, WIEL_R, r, Math.PI, 0, true);
    s.lineTo(z + r, onder);
  }
  s.lineTo(len / 2, onder);
}

/** Afstand van het midden tot elke as. */
export const asAfstand = (soort: Carrosserie, len: number) => len * (soort === "van" ? 0.32 : 0.34);

export interface AutoMaten {
  /** Bovenkant van de carrosserie (gordellijn bij een auto, het dak bij een busje of bus). */
  boven: number;
  /** Hoogste punt (het dak). */
  dak: number;
  /** Hoogte van de koplampen en achterlichten. */
  lamp: number;
  achterlamp: number;
}

/** Hoogtes die bij de vorm horen, zodat lampen en zwaailicht op de carrosserie zitten in plaats van erin. */
export function autoMaten(soort: Carrosserie, hgt: number): AutoMaten {
  const boven = 0.32 + hgt;
  if (soort === "car") return { boven, dak: boven + 0.47, lamp: 0.47, achterlamp: 0.45 };
  return { boven, dak: boven, lamp: 0.72, achterlamp: 0.62 };
}

/** De carrosserie: lage neus en kofferbak bij een auto, een korte motorkap bij een busje, een strakke bus. */
export function rompVorm(soort: Carrosserie, len: number, wid: number, hgt: number): THREE.BufferGeometry {
  const { boven } = autoMaten(soort, hgt);
  const L = len;
  const s = new THREE.Shape();
  if (soort === "car") {
    onderkant(s, L, 0.16, asAfstand(soort, L));
    s.lineTo(L / 2, boven * 0.62);
    s.lineTo(L / 2 - 0.06, boven * 0.86);
    s.lineTo(L * 0.2, boven);
    s.lineTo(-L * 0.38, boven);
    s.lineTo(-L / 2 + 0.02, boven * 0.95);
    s.lineTo(-L / 2, boven * 0.6);
  } else if (soort === "van") {
    onderkant(s, L, 0.18, asAfstand(soort, L));
    s.lineTo(L / 2, 0.62);
    s.lineTo(L / 2 - 0.04, 0.92);
    s.lineTo(L * 0.36, 1.02);
    s.lineTo(L * 0.2, boven - 0.04);
    s.lineTo(L * 0.16, boven);
    s.lineTo(-L / 2 + 0.04, boven);
    s.lineTo(-L / 2, boven - 0.06);
  } else {
    onderkant(s, L, 0.2, asAfstand(soort, L));
    s.lineTo(L / 2, 0.4);
    s.lineTo(L / 2, boven - 0.25);
    s.lineTo(L / 2 - 0.12, boven);
    s.lineTo(-L / 2 + 0.06, boven);
    s.lineTo(-L / 2, boven - 0.08);
  }
  s.closePath();
  return uitrekken(s, wid, soort === "bus" ? 0.05 : 0.04);
}

/**
 * De ramen. Bij een auto een glazen kap op de gordellijn (iets smaller, het dak en de stijl komen er los op); bij een
 * busje de voorruit en de zijruiten van de cabine, net buiten de carrosserie zodat ze niet door elkaar flikkeren.
 * Een bus heeft geen eigen glasvorm (die krijgt een ruitenband).
 */
export function glasVorm(soort: Carrosserie, len: number, wid: number, hgt: number): THREE.BufferGeometry | null {
  const { boven } = autoMaten(soort, hgt);
  const L = len;
  const s = new THREE.Shape();
  if (soort === "car") {
    s.moveTo(-L * 0.37, boven - 0.02);
    s.lineTo(L * 0.19, boven - 0.02);
    s.lineTo(0, boven + 0.42);
    s.lineTo(-L * 0.25, boven + 0.42);
    s.closePath();
    return uitrekken(s, wid * 0.84, 0.03);
  }
  if (soort === "van") {
    // de voorruit volgt de schuine lijn van (0,36 L; 1,02) naar (0,2 L; dak − 0,04), 2 cm ervoor
    const helling = (y: number) => L * 0.36 - ((y - 1.02) / (boven - 0.04 - 1.02)) * L * 0.16 + 0.02;
    s.moveTo(L * 0.1, 1.1);
    s.lineTo(helling(1.1), 1.1);
    s.lineTo(helling(boven - 0.09), boven - 0.09);
    s.lineTo(L * 0.1, boven - 0.09);
    s.closePath();
    return uitrekken(s, wid + 0.02, 0);
  }
  return null;
}

/** Velg in het wiel: iets breder dan de band, zodat hij aan beide kanten te zien is. */
export const velgVorm = (r = WIEL_R) => new THREE.CylinderGeometry(r * 0.56, r * 0.56, 0.2, 12).rotateZ(Math.PI / 2);

// --- bomen ------------------------------------------------------------------

/** Vaste ruis per punt: dezelfde hoek van twee vlakjes krijgt dezelfde duw, dus er ontstaan geen kieren. */
function ruis(x: number, y: number, z: number): number {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

function bobbelig(g: THREE.BufferGeometry, mate: number): THREE.BufferGeometry {
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = 1 + (ruis(Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000, Math.round(z * 1000) / 1000) - 0.5) * mate;
    p.setXYZ(i, x * k, y * k, z * k);
  }
  return g;
}

const losseVlakken = (g: THREE.BufferGeometry, x: number, y: number, z: number) => {
  const los = g.index ? g.toNonIndexed() : g;
  if (los !== g) g.dispose();
  // alleen positie en normaal: dan passen alle stukken op elkaar (sommige vormen hebben geen uv)
  los.deleteAttribute("uv");
  return los.translate(x, y, z);
};

function samen(delen: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(delen);
  delen.forEach((d) => d.dispose());
  if (!g) throw new Error("vormen passen niet op elkaar");
  g.computeVertexNormals();
  return g;
}

/**
 * Loofboom: een bobbelige hoofdkruin met twee kleinere bollen ertegenaan, zoals een echte boom die niet rond is.
 * Ongeveer even groot als de eenvoudige kruin (straal 0,95), dus hij past op dezelfde plek op dezelfde stam.
 */
export function kruinVorm(): THREE.BufferGeometry {
  return samen([
    losseVlakken(bobbelig(new THREE.IcosahedronGeometry(0.88, 1), 0.22), 0, 0.05, 0),
    losseVlakken(bobbelig(new THREE.IcosahedronGeometry(0.62, 0), 0.25), 0.5, -0.22, 0.12),
    losseVlakken(bobbelig(new THREE.IcosahedronGeometry(0.6, 0), 0.25), -0.38, -0.16, -0.34),
  ]);
}

/** Den of spar: drie kegels op elkaar. Onderkant op y = −0,45, punt op 1,95. */
export function naaldboomVorm(): THREE.BufferGeometry {
  return samen([
    losseVlakken(new THREE.ConeGeometry(0.9, 1.3, 8), 0, 0.2, 0),
    losseVlakken(new THREE.ConeGeometry(0.68, 1.1, 8), 0, 0.9, 0),
    losseVlakken(new THREE.ConeGeometry(0.44, 0.9, 8), 0, 1.5, 0),
  ]);
}

// --- mensen -----------------------------------------------------------------

/** Ronde ledematen in plaats van blokjes; het draaipunt zit bovenaan (heup of schouder), net als de blokjes. */
export const beenVorm = (lengte = 0.8, r = 0.078) => new THREE.CapsuleGeometry(r, lengte - 2 * r, 3, 8).translate(0, -lengte / 2, 0);
export const armVorm = (lengte = 0.62, r = 0.058) => new THREE.CapsuleGeometry(r, lengte - 2 * r, 3, 8).translate(0, -lengte / 2, 0);
/** Romp met ronde schouders, platter van voren naar achteren; even hoog als het blokje (0,62). */
export const rompMensVorm = () => new THREE.CapsuleGeometry(0.19, 0.24, 4, 10).scale(1.05, 1, 0.64);

/**
 * Winterjas tot over de knie (draaivorm, platter van voren naar achteren) met de mouwen erlangs. Staat op de grond
 * van het figuur: de zoom op 0,4, de schouders op 1,2; de benen komen eronder uit.
 */
export function jasVorm(): THREE.BufferGeometry {
  const profiel = [
    [0.25, 0],
    [0.23, 0.34],
    [0.21, 0.6],
    [0.19, 0.71],
    [0.12, 0.79],
    [0.06, 0.82],
    [0, 0.82],
  ].map(([r, y]) => new THREE.Vector2(r ?? 0, y ?? 0));
  const jas = losseVlakken(new THREE.LatheGeometry(profiel, 12), 0, 0.4, 0);
  const mouw = (kant: number) => {
    const m = new THREE.CapsuleGeometry(0.065, 0.42, 3, 8);
    m.rotateZ(kant * 0.08);
    return losseVlakken(m, kant * 0.25, 0.92, 0);
  };
  return samen([jas, mouw(-1), mouw(1)]).scale(1, 1, 0.72);
}
