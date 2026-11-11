// ---------------------------------------------------------------------------
// De gezichtsmodellen draaien in de app zelf (onnxruntime-node), zonder externe dienst en zonder
// kosten. Gezichtsfoto's verlaten de server dus nooit.
//
//  - YuNet (MIT) vindt gezichten en vijf punten; 232 KB.
//  - SFace (Apache 2.0) maakt van een uitgelijnd gezicht 128 getallen; 39 MB.
//
// Beide bestanden komen van OpenCV Zoo en worden bij het eerste gebruik één keer opgehaald naar het
// opslagvolume (storage/gezicht), met een controle op de hash: een bestand dat niet exact klopt
// wordt nooit geladen. Daarna werkt alles zonder netwerk. Eén sessie per proces (globalThis, want
// Next bundelt routes apart). Een storing blokkeert nooit: de aanroeper krijgt een fout en laat de
// beslissing aan een mens (zie lib/kyc/vision.ts).
// ---------------------------------------------------------------------------

import { createHash } from "node:crypto";
import path from "node:path";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import sharp from "sharp";
import type * as Ort from "onnxruntime-node";
import { AppError } from "@/lib/errors";
import { DETECTOR_GROOTTE, leesDetectorUitvoer, pasInVierkant, terugNaarBeeld, type DetectorUitvoer, type Gezicht } from "@/lib/kyc/gezicht/detector";
import { lijnUit, naarGrijs, UITGELIJND } from "@/lib/kyc/gezicht/uitlijnen";

export const GEZICHT_DATA_DIR = process.env.GEZICHT_DATA_DIR || path.join(process.cwd(), "storage", "gezicht");

const BRON = "https://github.com/opencv/opencv_zoo/raw/main/models";
export const MODELLEN = {
  yunet: {
    bestand: "face_detection_yunet_2023mar.onnx",
    url: `${BRON}/face_detection_yunet/face_detection_yunet_2023mar.onnx`,
    sha256: "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    bytes: 232_589,
  },
  sface: {
    bestand: "face_recognition_sface_2021dec.onnx",
    url: `${BRON}/face_recognition_sface/face_recognition_sface_2021dec.onnx`,
    sha256: "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79",
    bytes: 38_696_353,
  },
} as const;

/** Een beeld dat groter is dan dit (in pixels) wordt niet gelezen: bescherming tegen een bom. */
const MAX_PIXELS = 40_000_000;
/** Voor het zoeken van gezichten: de lange zijde wordt hooguit zo groot (alleen verkleinen). */
const MAX_ZIJDE = 2400;

interface Sessies {
  /** de runtime zelf: pas bij het eerste gebruik geladen, zodat het zware pakket niet bij elke opstart of test meekomt */
  ort: typeof Ort;
  detector: Ort.InferenceSession;
  herkenner: Ort.InferenceSession;
}

interface Staat {
  sessies: Promise<Sessies> | null;
  /** opdrachten na elkaar: de modellen delen één rekenthread en de server heeft niet veel geheugen */
  keten: Promise<unknown>;
}
const g = globalThis as unknown as { __zfGezicht?: Staat };
const staat = (): Staat => (g.__zfGezicht ??= { sessies: null, keten: Promise.resolve() });

const bestaat = (p: string) =>
  access(p).then(
    () => true,
    () => false,
  );

const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/** Zorgt dat één modelbestand op schijf staat en klopt. */
async function zorgVoorModel(m: (typeof MODELLEN)[keyof typeof MODELLEN]): Promise<string> {
  const doel = path.join(GEZICHT_DATA_DIR, m.bestand);
  if (await bestaat(doel)) {
    const bytes = await readFile(doel);
    if (bytes.length === m.bytes && sha256(bytes) === m.sha256) return doel;
  }
  await mkdir(GEZICHT_DATA_DIR, { recursive: true });
  const res = await fetch(m.url, { signal: AbortSignal.timeout(180_000), redirect: "follow" });
  if (!res.ok) throw new Error(`gezichtsmodel ${m.bestand}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length !== m.bytes || sha256(bytes) !== m.sha256) throw new Error(`gezichtsmodel ${m.bestand}: het bestand klopt niet met de verwachte hash`);
  const tijdelijk = `${doel}.${process.pid}.tmp`;
  await writeFile(tijdelijk, bytes);
  await rename(tijdelijk, doel);
  return doel;
}

function sessies(): Promise<Sessies> {
  const s = staat();
  if (!s.sessies) {
    s.sessies = (async () => {
      const [yunet, sface, ort] = await Promise.all([zorgVoorModel(MODELLEN.yunet), zorgVoorModel(MODELLEN.sface), import("onnxruntime-node")]);
      // logSeverityLevel 3 = alleen fouten: de modellen melden bij elke start tientallen waarschuwingen
      const opties: Ort.InferenceSession.SessionOptions = { executionProviders: ["cpu"], intraOpNumThreads: 2, graphOptimizationLevel: "all", logSeverityLevel: 3 };
      const [detector, herkenner] = await Promise.all([ort.InferenceSession.create(yunet, opties), ort.InferenceSession.create(sface, opties)]);
      return { ort, detector, herkenner };
    })().catch((err) => {
      // een mislukte start mag de volgende keer opnieuw proberen
      s.sessies = null;
      throw err;
    });
  }
  return s.sessies;
}

/** Zet opdrachten achter elkaar. */
function inRij<T>(werk: () => Promise<T>): Promise<T> {
  const s = staat();
  const volgende = s.keten.then(werk, werk);
  s.keten = volgende.catch(() => undefined);
  return volgende;
}

export interface Beeld {
  rgb: Uint8Array;
  breedte: number;
  hoogte: number;
}

/** Leest een foto (jpeg, png, webp, heic wordt door sharp afgewezen) als RGB, gedraaid volgens EXIF, begrensd in grootte. */
export async function leesBeeld(bytes: Uint8Array): Promise<Beeld> {
  const basis = sharp(bytes, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate();
  const meta = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
  if (!meta.width || !meta.height) throw AppError.validation("De foto is niet te lezen.");
  const lang = Math.max(meta.width, meta.height);
  const ingepast = lang > MAX_ZIJDE ? basis.resize({ width: meta.width >= meta.height ? MAX_ZIJDE : undefined, height: meta.height > meta.width ? MAX_ZIJDE : undefined, fit: "inside" }) : basis;
  const { data, info } = await ingepast.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgb: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), breedte: info.width, hoogte: info.height };
}

/** Draait een beeld 90, 180 of 270 graden (een document dat op zijn kant is gefotografeerd). */
export async function draaiBeeld(beeld: Beeld, graden: 90 | 180 | 270): Promise<Beeld> {
  const { data, info } = await sharp(Buffer.from(beeld.rgb.buffer, beeld.rgb.byteOffset, beeld.rgb.byteLength), { raw: { width: beeld.breedte, height: beeld.hoogte, channels: 3 } })
    .rotate(graden)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgb: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), breedte: info.width, hoogte: info.height };
}

/** Vindt alle gezichten in een foto, in pixels van het (eventueel verkleinde) beeld. Het beeld gaat in een vierkant van 640 × 640 (zwart eromheen, linksboven uitgelijnd), BGR, waarden 0–255. */
export async function vindGezichten(beeld: Beeld): Promise<Gezicht[]> {
  return inRij(async () => {
    const { ort, detector } = await sessies();
    const { schaal, w, h } = pasInVierkant(beeld.breedte, beeld.hoogte);
    const klein = await sharp(Buffer.from(beeld.rgb.buffer, beeld.rgb.byteOffset, beeld.rgb.byteLength), { raw: { width: beeld.breedte, height: beeld.hoogte, channels: 3 } })
      .resize(w, h, { fit: "fill", kernel: "lanczos3" })
      .raw()
      .toBuffer();
    const vlak = DETECTOR_GROOTTE * DETECTOR_GROOTTE;
    const tensor = new Float32Array(3 * vlak);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const bron = (y * w + x) * 3;
        const doel = y * DETECTOR_GROOTTE + x;
        // BGR: blauw eerst
        tensor[doel] = klein[bron + 2] ?? 0;
        tensor[vlak + doel] = klein[bron + 1] ?? 0;
        tensor[2 * vlak + doel] = klein[bron] ?? 0;
      }
    }
    const uit = await detector.run({ [detector.inputNames[0] as string]: new ort.Tensor("float32", tensor, [1, 3, DETECTOR_GROOTTE, DETECTOR_GROOTTE]) });
    const pak = (voorvoegsel: string): Float32Array[] =>
      [8, 16, 32].map((s) => (uit[`${voorvoegsel}_${s}`]?.data as Float32Array | undefined) ?? new Float32Array(0));
    const gevonden: DetectorUitvoer = { cls: pak("cls"), obj: pak("obj"), bbox: pak("bbox"), kps: pak("kps") };
    return terugNaarBeeld(leesDetectorUitvoer(gevonden, 0.5), schaal);
  });
}

/**
 * De 128 kenmerken van één gezicht (SFace), of `null` als het gezicht niet uit te lijnen was. Het gezicht wordt
 * eerst grijs gemaakt (naarGrijs): de pasfoto op een document is meestal grijs, de selfie in kleur.
 */
export async function gezichtsKenmerk(beeld: Beeld, gezicht: Gezicht): Promise<Float32Array | null> {
  const kleur = lijnUit(beeld.rgb, beeld.breedte, beeld.hoogte, gezicht.punten);
  if (!kleur) return null;
  const uitgelijnd = naarGrijs(kleur);
  return inRij(async () => {
    const { ort, herkenner } = await sessies();
    const vlak = UITGELIJND * UITGELIJND;
    // RGB, waarden 0–255, geen gemiddelde of schaal (zoals OpenCV FaceRecognizerSF)
    const tensor = new Float32Array(3 * vlak);
    for (let i = 0; i < vlak; i++) {
      tensor[i] = uitgelijnd[i * 3] ?? 0;
      tensor[vlak + i] = uitgelijnd[i * 3 + 1] ?? 0;
      tensor[2 * vlak + i] = uitgelijnd[i * 3 + 2] ?? 0;
    }
    const uit = await herkenner.run({ [herkenner.inputNames[0] as string]: new ort.Tensor("float32", tensor, [1, 3, UITGELIJND, UITGELIJND]) });
    const eerste = uit[herkenner.outputNames[0] as string];
    return eerste ? Float32Array.from(eerste.data as Float32Array) : null;
  });
}
