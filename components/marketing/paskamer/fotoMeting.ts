// De meting van "Op mijn foto", in de browser: houding (MediaPipe Pose) en de
// omtrek van de persoon (selfie-segmentatie) uit een foto, daarna de maten, het
// gezicht, de huidskleur en de haarkleur. Het model staat in
// public/paskamer/ml (Apache-2.0) en wordt pas geladen als iemand een foto laat
// meten. De foto verlaat het toestel nooit. Rekenregels: lib/shop/foto-meting.ts.

import { HAARKLEUREN } from "@/lib/shop/paspop3d/kleding";
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
  return (G.__zfMeting ??= (async () => {
    const v = (await import(/* webpackIgnore: true */ `${BASIS}/vision_bundle.mjs`)) as Vision;
    const f = await v.FilesetResolver.forVisionTasks(`${BASIS}/wasm`);
    const [pose, segmenter] = await Promise.all([
      v.PoseLandmarker.createFromOptions(f, { baseOptions: { modelAssetPath: `${BASIS}/pose_landmarker_lite.task`, delegate: "CPU" }, runningMode: "IMAGE", numPoses: 1, minPoseDetectionConfidence: 0.5 }),
      v.ImageSegmenter.createFromOptions(f, { baseOptions: { modelAssetPath: `${BASIS}/selfie_segmenter.tflite`, delegate: "CPU" }, runningMode: "IMAGE", outputConfidenceMasks: true, outputCategoryMask: false }),
    ]);
    return { pose, segmenter };
  })().catch((e) => {
    G.__zfMeting = undefined;
    throw e;
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

async function naarCanvas(bestand: File, max = 1280): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(bestand);
  const f = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * f);
  c.height = Math.round(bmp.height * f);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

function pixels(c: HTMLCanvasElement, x: number, y: number, w: number, h: number): Uint8ClampedArray {
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const w0 = Math.max(1, Math.min(c.width - x0, Math.round(w)));
  const h0 = Math.max(1, Math.min(c.height - y0, Math.round(h)));
  return ctx.getImageData(x0, y0, w0, h0).data;
}

/** Foto meten. `onStap` meldt "laden" (eerste keer) en "meten". */
export async function meetFoto(bestand: File, lengteCm: number, onStap?: (s: "laden" | "meten") => void): Promise<FotoUitkomst> {
  const canvas = await naarCanvas(bestand);
  onStap?.("laden");
  const { pose, segmenter } = await laad();
  onStap?.("meten");
  const w = canvas.width;
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
