// De meting van "Op mijn foto", in de browser: houding (MediaPipe Pose) en de
// omtrek van de persoon (selfie-segmentatie) uit een foto, daarna de maten, het
// gezicht, de huidskleur en de haarkleur. Het model staat in
// public/paskamer/ml (Apache-2.0) en wordt pas geladen als iemand een foto laat
// meten. De foto verlaat het toestel nooit. Rekenregels: lib/shop/foto-meting.ts.

import { HAARKLEUREN } from "@/lib/shop/paspop3d/kleding";
import { FotoFoutError, bundelAdres, isHeic, metHerhaling, metStap, metTijdslimiet } from "@/lib/shop/foto-fout";
import { POSE, beoordeelFoto, dichtstbij, gemiddeldeKleur, gezichtsKader, huidVoorPaspop, meetLichaam, type Meting, type Probleem, type Punt } from "@/lib/shop/foto-meting";

const BASIS = "/paskamer/ml";

type Vision = {
  FilesetResolver: { forVisionTasks(pad: string): Promise<unknown> };
  PoseLandmarker: { createFromOptions(f: unknown, o: unknown): Promise<{ detect(i: HTMLCanvasElement): { landmarks: Punt[][] }; close(): void }> };
  ImageSegmenter: { createFromOptions(f: unknown, o: unknown): Promise<{ segment(i: HTMLCanvasElement): { confidenceMasks?: { getAsFloat32Array(): Float32Array; close(): void }[] }; close(): void }> };
};

type Modellen = { pose: Awaited<ReturnType<Vision["PoseLandmarker"]["createFromOptions"]>>; segmenter: Awaited<ReturnType<Vision["ImageSegmenter"]["createFromOptions"]>> };
const G = globalThis as unknown as { __zfMeting?: Promise<Modellen> | undefined };

/** De modellen één keer per tabblad laden. */
function laad(): Promise<Modellen> {
  // Bij een laadfout (bv. HTML in plaats van JavaScript tijdens een uitrol) één keer opnieuw na 3 s, met een andere adres-suffix (?v=1).
  return (G.__zfMeting ??= metHerhaling(async (nr) => {
    const v = await import(/* webpackIgnore: true */ bundelAdres(BASIS, nr)).then(
      (m) => m as Vision,
      (e) => {
        throw metStap(e, "bundel", "model");
      },
    );
    const f = await v.FilesetResolver.forVisionTasks(`${BASIS}/wasm`).catch((e) => {
      throw metStap(e, "wasm", "model");
    });
    const [pose, segmenter] = await Promise.all([
      v.PoseLandmarker.createFromOptions(f, { baseOptions: { modelAssetPath: `${BASIS}/pose_landmarker_lite.task`, delegate: "CPU" }, runningMode: "IMAGE", numPoses: 1, minPoseDetectionConfidence: 0.5 }),
      v.ImageSegmenter.createFromOptions(f, { baseOptions: { modelAssetPath: `${BASIS}/selfie_segmenter.tflite`, delegate: "CPU" }, runningMode: "IMAGE", outputConfidenceMasks: true, outputCategoryMask: false }),
    ]);
    return { pose, segmenter };
  }).catch((e) => {
    // wasm/model starten mislukt (geen SIMD, geheugen, beveiligingsinstelling): stap erbij
    G.__zfMeting = undefined;
    throw metStap(e, "wasm", "model");
  }));
}

export type FotoUitkomst = {
  problemen: Probleem[];
  meting: Meting | null;
  /** het gezicht als 320 × 400 jpeg (data-URL), klaar voor de paspop */
  gezicht: string | null;
  huid: string | null;
  haarKleur: string | null;
  /** de foto (verkleind) en de punten, om er de meting overheen te tekenen */
  beeld: string;
  punten: Punt[] | null;
};

function tekenOp(bron: CanvasImageSource, breed: number, hoog: number, max: number): HTMLCanvasElement {
  const f = Math.min(1, max / Math.max(breed, hoog));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(breed * f));
  c.height = Math.max(1, Math.round(hoog * f));
  const ctx = c.getContext("2d");
  if (!ctx) throw new FotoFoutError("niet-leesbaar");
  ctx.drawImage(bron, 0, 0, c.width, c.height);
  return c;
}

// Eerst createImageBitmap (snel). Ontbreekt die (oudere Safari) of kan hij het bestand niet lezen,
// dan via een gewone <img> met een tijdelijke object-URL. Kan de browser het bestand echt niet
// lezen (HEIC buiten Safari), dan weten we de oorzaak en zegt de melding dat eerlijk.
async function naarCanvas(bestand: File, max = 1280): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(bestand);
      try {
        return tekenOp(bmp, bmp.width, bmp.height, max);
      } finally {
        bmp.close();
      }
    } catch (e) {
      if (e instanceof FotoFoutError) throw e;
    }
  }
  const url = URL.createObjectURL(bestand);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fout) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = () => fout(new FotoFoutError(isHeic(bestand.name, bestand.type) ? "heic" : "niet-leesbaar"));
      im.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) throw new FotoFoutError(isHeic(bestand.name, bestand.type) ? "heic" : "niet-leesbaar");
    return tekenOp(img, img.naturalWidth, img.naturalHeight, max);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function pixels(c: HTMLCanvasElement, x: number, y: number, w: number, h: number): Uint8ClampedArray {
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const w0 = Math.max(1, Math.min(c.width - x0, Math.round(w)));
  const h0 = Math.max(1, Math.min(c.height - y0, Math.round(h)));
  return ctx.getImageData(x0, y0, w0, h0).data;
}

/** Foto meten. `onStap` meldt "laden" (eerste keer) en "meten". Fouten dragen de stap waarin het misging. */
export async function meetFoto(bestand: File, lengteCm: number, onStap?: (s: "laden" | "meten") => void): Promise<FotoUitkomst> {
  const canvas = await naarCanvas(bestand).catch((e) => {
    throw metStap(e, "inlezen");
  });
  onStap?.("laden");
  // Traag laden (20 MB wasm en model) krijgt een eigen melding in plaats van eindeloos draaien.
  const modellen = await metTijdslimiet(laad(), LAAD_LIMIET_MS, () => {
    G.__zfMeting = undefined;
  });
  onStap?.("meten");
  try {
    return meetCanvas(canvas, modellen, lengteCm);
  } catch (e) {
    throw metStap(e, "meten");
  }
}

const LAAD_LIMIET_MS = 60_000;

function meetCanvas(canvas: HTMLCanvasElement, { pose, segmenter }: Modellen, lengteCm: number): FotoUitkomst {  const w = canvas.width;
  const h = canvas.height;
  const beeld = canvas.toDataURL("image/jpeg", 0.85);
  const punten = pose.detect(canvas).landmarks[0] ?? null;
  const problemen = beoordeelFoto(punten, w, h);
  if (!punten || problemen.includes("geen-mens")) return { problemen, meting: null, gezicht: null, huid: null, haarKleur: null, beeld, punten };

  // masker van de persoon; welke kant "persoon" is bepalen we aan de heupen
  const seg = segmenter.segment(canvas);
  const m = seg.confidenceMasks?.[0];
  let masker: Float32Array | null = null;
  if (m) {
    const ruw = m.getAsFloat32Array();
    const hl = punten[POSE.heupL];
    const hr = punten[POSE.heupR];
    const px = Math.round((((hl?.x ?? 0.5) + (hr?.x ?? 0.5)) / 2) * w);
    const py = Math.round((((hl?.y ?? 0.6) + (hr?.y ?? 0.6)) / 2) * h);
    const hoog = (ruw[Math.min(ruw.length - 1, py * w + px)] ?? 0) > 0.5;
    masker = hoog ? ruw : ruw.map((v) => 1 - v);
    m.close();
  }
  const bruikbaar = problemen.filter((p) => p !== "niet-voor" && p !== "klein").length === 0;
  const meting = masker && bruikbaar ? meetLichaam(masker, w, h, punten, lengteCm) : null;

  // gezicht (ogen op 45 %), huid van de wangen, haar boven het voorhoofd
  const oogL = punten[POSE.oogL];
  const oogR = punten[POSE.oogR];
  let gezicht: string | null = null;
  let huid: string | null = null;
  let haarKleur: string | null = null;
  if (oogL && oogR) {
    const k = gezichtsKader(oogL, oogR, w, h);
    const uit = document.createElement("canvas");
    uit.width = 320;
    uit.height = 400;
    const ctx = uit.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#d9cfc4";
      ctx.fillRect(0, 0, 320, 400);
      ctx.drawImage(canvas, k.x, k.y, k.w, k.h, 0, 0, 320, 400);
      gezicht = uit.toDataURL("image/jpeg", 0.88);
    }
    const oog = Math.hypot((oogR.x - oogL.x) * w, (oogR.y - oogL.y) * h);
    const cx = ((oogL.x + oogR.x) / 2) * w;
    const cy = ((oogL.y + oogR.y) / 2) * h;
    // wangen: onder de ogen, naast de neus; haar: boven de ogen aan de haarlijn
    const wang = [pixels(canvas, cx - oog * 0.85, cy + oog * 0.55, oog * 0.5, oog * 0.4), pixels(canvas, cx + oog * 0.35, cy + oog * 0.55, oog * 0.5, oog * 0.4)];
    huid = gemiddeldeKleur(Uint8ClampedArray.from(wang.flatMap((d) => [...d])), 1);
    const haar = gemiddeldeKleur(pixels(canvas, cx - oog * 0.7, cy - oog * 1.85, oog * 1.4, oog * 0.45), 1);
    haarKleur = haar ? dichtstbij(haar, HAARKLEUREN) : null;
    if (huid) huid = huidVoorPaspop(huid);
  }
  return { problemen, meting, gezicht, huid, haarKleur, beeld, punten };
}
