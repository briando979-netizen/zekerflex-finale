// ---------------------------------------------------------------------------
// Gezichten vinden met YuNet (OpenCV Zoo, MIT-licentie, face_detection_yunet_2023mar.onnx).
// Puur bestand: alleen rekenwerk op getallen, zonder ONNX of beeldbibliotheek, zodat het te testen is.
//
// Het model krijgt een vast vierkant van 640 × 640 (BGR, waarden 0–255) en geeft per afstand
// (stride 8, 16 en 32) drie lijsten terug: cls (is het een gezicht), obj (hoe zeker), bbox (kader)
// en kps (vijf punten: oog links, oog rechts, neus, mondhoek links, mondhoek rechts). Dit is
// dezelfde ontleding als in OpenCV (modules/objdetect/src/face_detect.cpp).
// ---------------------------------------------------------------------------

export const DETECTOR_GROOTTE = 640;
export const STRIDES = [8, 16, 32] as const;

export interface Punt {
  x: number;
  y: number;
}

export interface Gezicht {
  /** linksboven + breedte/hoogte, in pixels van het beeld dat je aanleverde */
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  /** oog links, oog rechts, neus, mondhoek links, mondhoek rechts (zoals het beeld, niet zoals de persoon) */
  punten: [Punt, Punt, Punt, Punt, Punt];
  /** 0–1 */
  score: number;
}

/** De twaalf uitvoerlijsten van het model, op naam. */
export interface DetectorUitvoer {
  cls: Float32Array[];
  obj: Float32Array[];
  bbox: Float32Array[];
  kps: Float32Array[];
}

const klem01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Zet de uitvoer om naar gezichten in de 640 × 640-ruimte. `drempel` is de minimale score.
 * Daarna haalt `nms` dubbele kaders weg.
 */
export function leesDetectorUitvoer(uit: DetectorUitvoer, drempel = 0.6): Gezicht[] {
  const gevonden: Gezicht[] = [];
  STRIDES.forEach((stride, i) => {
    const cls = uit.cls[i];
    const obj = uit.obj[i];
    const bbox = uit.bbox[i];
    const kps = uit.kps[i];
    if (!cls || !obj || !bbox || !kps) return;
    const kolommen = DETECTOR_GROOTTE / stride;
    const rijen = DETECTOR_GROOTTE / stride;
    for (let r = 0; r < rijen; r++) {
      for (let c = 0; c < kolommen; c++) {
        const idx = r * kolommen + c;
        const score = Math.sqrt(klem01(cls[idx] ?? 0) * klem01(obj[idx] ?? 0));
        if (score < drempel) continue;
        const b = idx * 4;
        const cx = (c + (bbox[b] ?? 0)) * stride;
        const cy = (r + (bbox[b + 1] ?? 0)) * stride;
        const w = Math.exp(bbox[b + 2] ?? 0) * stride;
        const h = Math.exp(bbox[b + 3] ?? 0) * stride;
        const k = idx * 10;
        const punt = (n: number): Punt => ({ x: ((kps[k + 2 * n] ?? 0) + c) * stride, y: ((kps[k + 2 * n + 1] ?? 0) + r) * stride });
        gevonden.push({ x: cx - w / 2, y: cy - h / 2, breedte: w, hoogte: h, punten: [punt(0), punt(1), punt(2), punt(3), punt(4)], score });
      }
    }
  });
  return nms(gevonden, 0.3);
}

const overlap = (a: Gezicht, b: Gezicht): number => {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.breedte, b.x + b.breedte);
  const y2 = Math.min(a.y + a.hoogte, b.y + b.hoogte);
  const snijding = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const unie = a.breedte * a.hoogte + b.breedte * b.hoogte - snijding;
  return unie > 0 ? snijding / unie : 0;
};

/** Houdt van elke groep overlappende kaders het beste over. */
export function nms(gezichten: Gezicht[], maxOverlap: number): Gezicht[] {
  const op = [...gezichten].sort((a, b) => b.score - a.score);
  const over: Gezicht[] = [];
  for (const g of op) {
    if (over.every((o) => overlap(o, g) <= maxOverlap)) over.push(g);
  }
  return over;
}

/** Hoe het beeld in het vierkant van 640 past: zijkant gelijk, de rest zwart (linksboven uitgelijnd). */
export function pasInVierkant(breedte: number, hoogte: number): { schaal: number; w: number; h: number } {
  const schaal = Math.min(DETECTOR_GROOTTE / breedte, DETECTOR_GROOTTE / hoogte);
  return { schaal, w: Math.max(1, Math.round(breedte * schaal)), h: Math.max(1, Math.round(hoogte * schaal)) };
}

/** Zet gezichten uit de 640-ruimte terug naar de pixels van het originele beeld. */
export function terugNaarBeeld(gezichten: Gezicht[], schaal: number): Gezicht[] {
  return gezichten.map((g) => ({
    x: g.x / schaal,
    y: g.y / schaal,
    breedte: g.breedte / schaal,
    hoogte: g.hoogte / schaal,
    punten: g.punten.map((p) => ({ x: p.x / schaal, y: p.y / schaal })) as Gezicht["punten"],
    score: g.score,
  }));
}

/** Het grootste gezicht (op oppervlak). */
export function grootste(gezichten: Gezicht[]): Gezicht | null {
  let best: Gezicht | null = null;
  for (const g of gezichten) if (!best || g.breedte * g.hoogte > best.breedte * best.hoogte) best = g;
  return best;
}
