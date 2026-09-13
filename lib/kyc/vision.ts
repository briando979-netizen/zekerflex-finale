import { chatJson, imageDataUrl } from "@/lib/ai/client";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Vision-based KYC review — the part the self-serve checker was missing
// entirely: it never looked at the photo content, only typed metadata
// (lib/onboarding/verify.ts's aiAuthenticityReview still doesn't, and still
// shouldn't need to for that piece). This module feeds the three captured
// photos (front, back, selfie) to a local multimodal model over Ollama's
// OpenAI-compatible endpoint and asks two questions:
//
//   1. Document plausibility — does the front/back look like a real,
//      unaltered photo of a physical ID document (vs. a screenshot, a
//      printed copy, an obviously edited image, or something else entirely)?
//   2. Face match + passive spoof check — does the selfie plausibly show the
//      same person as the document photo, and does the selfie look like a
//      direct photo of a real person rather than a photo-of-a-photo/screen?
//
// Honesty about what this is NOT: with a single static selfie there is no
// active liveness signal (no blink/head-turn/video) — "looksLive" is a
// passive spoof heuristic (screen glare, bezels, moiré, paper texture), not
// certified biometric liveness. Treat it as a weak, best-effort signal, not
// a security boundary. A model that can't be reached, isn't configured, or
// answers unusably degrades to "unavailable" — it NEVER blocks onboarding by
// itself; only a *confident* mismatch feeds into the hard-fail decision in
// lib/onboarding/verify.ts, everything uncertain still falls to "in review".
//
// LLM_VISION_MODEL is unset by default — this stays fully opt-in. Tested here
// against real Ollama on CPU-only hardware with `moondream` (the smallest
// commonly-available vision model, chosen for speed): a single trivial
// single-image query took 45s-150s and the JSON-mode reply was frequently
// unparseable garbage (the model's object-detection head leaking through
// rather than following the chat/JSON template). Two images per call (this
// module's actual workload) will be slower still. Conclusion: don't enable
// this on CPU-only hardware with a model this small. To use it for real,
// either (a) run on a GPU box with a stronger model (llava:13b,
// qwen2.5vl:7b+, llama3.2-vision:11b) and re-verify latency + JSON compliance
// before flipping it on, or (b) replace the face-match half specifically with
// a purpose-built face-embedding model/service — much faster and more
// accurate than asking a general VLM to compare two photos, and keep a vision
// LLM only for the document-plausibility question.
// ---------------------------------------------------------------------------

export interface VisionImage {
  bytes: Buffer;
  mimeType: string;
}

export interface DocumentVisionVerdict {
  plausible: boolean;
  confidence: number; // 0..1
  documentNumber: string | null;
  expiryDate: string | null; // yyyy-mm-dd, best-effort OCR
  concerns: string[];
}

export interface FaceVisionVerdict {
  samePerson: boolean;
  faceMatchConfidence: number; // 0..1
  looksLive: boolean; // passive spoof heuristic — NOT certified liveness
  livenessConfidence: number; // 0..1
  concerns: string[];
}

export interface VisionReview {
  available: boolean;
  document: DocumentVisionVerdict | null;
  face: FaceVisionVerdict | null;
  model: string | null;
  error?: string;
}

export function isVisionReviewEnabled(): boolean {
  return Boolean(env.LLM_VISION_MODEL);
}

const DOC_SYSTEM = `Je bent de beeld-controleur van ZekerFlex. Je krijgt de voorkant en achterkant van
een identiteitsdocument (paspoort, ID-kaart of rijbewijs). Beoordeel ALLEEN wat je op de foto's ziet.

Antwoord uitsluitend met JSON in dit exacte formaat, niets ervoor of erna:
{"plausible": true|false, "confidence": 0.0-1.0, "document_number": string of null, "expiry_date": "YYYY-MM-DD" of null, "concerns": [string, ...]}

Richtlijnen:
- "plausible": false als de foto een foto van een beeldscherm is (glans, schermranden, pixels), een
  duidelijk bewerkte/gemonteerde afbeelding, een lege of onleesbare foto, of duidelijk geen
  identiteitsdocument voorstelt.
- "document_number" en "expiry_date": vul in als je ze duidelijk kunt lezen, anders null. Nooit gokken.
- "concerns": kort en in het Nederlands, leeg als er niets bijzonders is.`;

const FACE_SYSTEM = `Je bent de beeld-controleur van ZekerFlex. Je krijgt twee foto's: de pasfoto op een
identiteitsdocument, en een losse selfie die de gebruiker zojuist heeft gemaakt.

Antwoord uitsluitend met JSON in dit exacte formaat, niets ervoor of erna:
{"same_person": true|false, "face_match_confidence": 0.0-1.0, "looks_live": true|false, "liveness_confidence": 0.0-1.0, "concerns": [string, ...]}

Richtlijnen:
- "same_person": is het aannemelijk dezelfde persoon, ondanks verschil in belichting/hoek/leeftijd van de pasfoto?
- "looks_live": lijkt de selfie een rechtstreekse foto van een echt persoon, dus GEEN foto van een foto,
  een foto van een telefoon-/computerscherm (let op glans, schermranden, moiré-patroon), print, of
  een tekening/AI-gegenereerd gezicht?
- "concerns": kort en in het Nederlands, leeg als er niets bijzonders is.`;

async function reviewDocument(
  model: string,
  front: VisionImage,
  back: VisionImage,
): Promise<DocumentVisionVerdict> {
  const raw = await chatJson<{
    plausible?: boolean;
    confidence?: number;
    document_number?: string | null;
    expiry_date?: string | null;
    concerns?: string[];
  }>({
    purpose: "kyc-vision",
    model,
    temperature: 0.1,
    maxTokens: 300,
    timeoutMs: env.LLM_VISION_TIMEOUT_MS,
    messages: [
      { role: "system", content: DOC_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Voorkant van het document:" },
          { type: "image_url", image_url: { url: imageDataUrl(front.bytes, front.mimeType) } },
          { type: "text", text: "Achterkant van het document:" },
          { type: "image_url", image_url: { url: imageDataUrl(back.bytes, back.mimeType) } },
        ],
      },
    ],
  });
  return {
    plausible: raw.plausible !== false,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
    documentNumber: typeof raw.document_number === "string" ? raw.document_number : null,
    expiryDate:
      typeof raw.expiry_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.expiry_date)
        ? raw.expiry_date
        : null,
    concerns: Array.isArray(raw.concerns) ? raw.concerns.slice(0, 6).map(String) : [],
  };
}

async function reviewFace(
  model: string,
  idPhoto: VisionImage,
  selfie: VisionImage,
): Promise<FaceVisionVerdict> {
  const raw = await chatJson<{
    same_person?: boolean;
    face_match_confidence?: number;
    looks_live?: boolean;
    liveness_confidence?: number;
    concerns?: string[];
  }>({
    purpose: "kyc-vision",
    model,
    temperature: 0.1,
    maxTokens: 300,
    timeoutMs: env.LLM_VISION_TIMEOUT_MS,
    messages: [
      { role: "system", content: FACE_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: "Pasfoto op het document:" },
          { type: "image_url", image_url: { url: imageDataUrl(idPhoto.bytes, idPhoto.mimeType) } },
          { type: "text", text: "Selfie:" },
          { type: "image_url", image_url: { url: imageDataUrl(selfie.bytes, selfie.mimeType) } },
        ],
      },
    ],
  });
  return {
    samePerson: raw.same_person !== false,
    faceMatchConfidence: Math.max(0, Math.min(1, Number(raw.face_match_confidence) || 0)),
    looksLive: raw.looks_live !== false,
    livenessConfidence: Math.max(0, Math.min(1, Number(raw.liveness_confidence) || 0)),
    concerns: Array.isArray(raw.concerns) ? raw.concerns.slice(0, 6).map(String) : [],
  };
}

/**
 * Run both vision checks. Never throws: a missing model, a timeout, or a
 * malformed reply all degrade to `{ available: false }` so onboarding always
 * has a well-defined path forward (the text-only checks + human review).
 */
export async function runVisionReview(input: {
  front: VisionImage;
  back: VisionImage;
  selfie: VisionImage;
}): Promise<VisionReview> {
  const model = env.LLM_VISION_MODEL;
  if (!model) {
    return { available: false, document: null, face: null, model: null };
  }
  try {
    const [document, face] = await Promise.all([
      reviewDocument(model, input.front, input.back),
      reviewFace(model, input.front, input.selfie),
    ]);
    return { available: true, document, face, model };
  } catch (err) {
    logger.warn("kyc vision review unavailable, degrading to text-only checks", {
      error: (err as Error).message,
    });
    return {
      available: false,
      document: null,
      face: null,
      model: env.LLM_VISION_MODEL ?? null,
      error: (err as Error).message,
    };
  }
}
