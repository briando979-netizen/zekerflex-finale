import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { getLlmApiKey } from "@/lib/ai/llm-key";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { pcmNaarWav } from "@/lib/video/wav";

// ---------------------------------------------------------------------------
// Google Gemini voor beeld, stem en video: dezelfde modellen waarmee Claude en
// Gemini zelf foto's maken ("Nano Banana"). Gebruikt de Gemini-sleutel die de
// live AI al heeft (LLM_BASE_URL op generativelanguage.googleapis.com) of een
// eigen IMAGE_API_KEY bij IMAGE_BACKEND=gemini.
//
// Let op: op de GRATIS laag van Google geeft elk beeld- en videomodel 429
// (quotum 0). Dat onthouden we een uur in KV, zodat de schermen het meteen
// melden zonder steeds een verzoek te verspillen. Zodra de eigenaar betalen
// aanzet in Google AI Studio werkt alles direct, zonder uitrol.
// ---------------------------------------------------------------------------

const API = "https://generativelanguage.googleapis.com/v1beta";

export const GEMINI_BEELDMODELLEN = [
  { id: "gemini-3.1-flash-image", label: "Nano Banana 2", uitleg: "snel en scherp, tot 4K" },
  { id: "gemini-3-pro-image", label: "Nano Banana Pro", uitleg: "hoogste kwaliteit, beste tekst in beeld" },
] as const;
export type GeminiBeeldModel = (typeof GEMINI_BEELDMODELLEN)[number]["id"];

export const BEELD_GROOTTES = ["1K", "2K", "4K"] as const;
export type BeeldGrootte = (typeof BEELD_GROOTTES)[number];

export const VERHOUDINGEN = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"] as const;
export type Verhouding = (typeof VERHOUDINGEN)[number];

// Stemmen van Gemini-TTS die goed Nederlands spreken.
export const GEMINI_STEMMEN = [
  { id: "Kore", label: "Kore (vrouw, helder)" },
  { id: "Aoede", label: "Aoede (vrouw, warm)" },
  { id: "Leda", label: "Leda (vrouw, jong)" },
  { id: "Charon", label: "Charon (man, rustig)" },
  { id: "Puck", label: "Puck (man, vrolijk)" },
  { id: "Orus", label: "Orus (man, stevig)" },
] as const;

// Meerdere TTS-modellen: elk heeft op de gratis laag een eigen dagtegoed.
// De eerste twee volgen de instructie; de 3.8-modellen lezen alleen de tekst.
const TTS_MODELLEN = ["gemini-2.5-flash-preview-tts", "gemini-3.1-flash-tts-preview", "gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"];

const SLOT_KEY = (soort: "beeld" | "video") => `ai:gemini:slot:${soort}`;
const SLOT_MS = 60 * 60_000;

export interface GeminiSlot {
  op: string;
  melding: string;
}

function isGeminiHost(url: string): boolean {
  try {
    return new URL(url).host === "generativelanguage.googleapis.com";
  } catch {
    return false;
  }
}

/** De sleutel voor Gemini-media, of null als er geen Gemini aan hangt. */
export async function geminiSleutel(): Promise<string | null> {
  if (env.IMAGE_BACKEND === "gemini" && env.IMAGE_API_KEY) return env.IMAGE_API_KEY;
  if (!isGeminiHost(env.LLM_BASE_URL)) return null;
  if (!env.AI_ALLOW_REMOTE && env.IMAGE_BACKEND !== "gemini") return null;
  return getLlmApiKey();
}

export async function geminiBeschikbaar(): Promise<boolean> {
  return Boolean(await geminiSleutel());
}

/** Wat Google het laatst zei over het tegoed (null = geen bekende blokkade). */
export async function geminiSlot(soort: "beeld" | "video"): Promise<GeminiSlot | null> {
  try {
    const s = await kvGet<GeminiSlot>(SLOT_KEY(soort));
    if (!s || Date.now() - Date.parse(s.op) > SLOT_MS) return null;
    return s;
  } catch {
    return null;
  }
}

const GELUKT_KEY = "ai:gemini:beeld-gelukt";

/** Wanneer Gemini voor het laatst echt een foto maakte (voor Admin → Te doen). */
export async function geminiBeeldGelukt(): Promise<string | null> {
  try {
    return (await kvGet<string>(GELUKT_KEY)) ?? null;
  } catch {
    return null;
  }
}

async function zetSlot(soort: "beeld" | "video", melding: string | null) {
  try {
    await kvSet(SLOT_KEY(soort), melding ? { op: new Date().toISOString(), melding } : null);
  } catch {
    /* KV weg: dan melden we het gewoon bij de volgende poging */
  }
}

const TEGOED_MELDING =
  "Google geeft deze sleutel nog geen tegoed voor beeld en video (gratis laag). Zet betalen aan in Google AI Studio (aistudio.google.com → Get API key → Set up billing). Daarna werkt het meteen, zonder uitrol.";

function isTegoedFout(status: number, body: string): boolean {
  return status === 429 && /quota|billing|free.?tier|exceeded/i.test(body);
}

async function geminiFetch(pad: string, body: unknown, timeoutMs: number): Promise<{ status: number; text: string }> {
  const key = await geminiSleutel();
  if (!key) throw AppError.precondition("Er hangt geen Gemini-sleutel aan ZekerFlex. Zet de live AI op Gemini (Admin → ZekerFlex AI) of zet IMAGE_BACKEND=gemini met IMAGE_API_KEY.");
  const res = await fetch(`${API}/${pad}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: res.status, text: await res.text() };
}

interface InlineDeel {
  inlineData?: { mimeType?: string; data?: string };
  text?: string;
}
interface GenerateAntwoord {
  candidates?: { content?: { parts?: InlineDeel[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

function eersteInline(antwoord: GenerateAntwoord, voorvoegsel: string): { mime: string; data: string } | null {
  for (const c of antwoord.candidates ?? []) {
    for (const p of c.content?.parts ?? []) {
      const mime = p.inlineData?.mimeType ?? "";
      if (p.inlineData?.data && mime.startsWith(voorvoegsel)) return { mime, data: p.inlineData.data };
    }
  }
  return null;
}

export interface GeminiBeeldInput {
  prompt: string;
  /** Bronfoto's om te bewerken of als voorbeeld (base64, met of zonder data:-voorvoegsel). */
  bronnen?: { b64: string; mime: string }[];
  verhouding?: Verhouding;
  grootte?: BeeldGrootte;
  model?: GeminiBeeldModel;
}

export interface GeminiBeeld {
  b64: string;
  mime: string;
  model: string;
}

/** Maak of bewerk een foto met Nano Banana. Gooit een nette AppError bij geen tegoed. */
export async function geminiBeeld(input: GeminiBeeldInput): Promise<GeminiBeeld> {
  const model = input.model ?? env.IMAGE_GEMINI_MODEL ?? "gemini-3.1-flash-image";
  const delen: unknown[] = [
    ...(input.bronnen ?? []).map((b) => ({ inlineData: { mimeType: b.mime, data: b.b64.replace(/^data:[^;]+;base64,/, "") } })),
    { text: input.prompt },
  ];
  const imageConfig: Record<string, string> = {};
  if (input.verhouding) imageConfig.aspectRatio = input.verhouding;
  if (input.grootte) imageConfig.imageSize = input.grootte;
  const verzoek = (cfg: Record<string, string>) => ({
    contents: [{ role: "user", parts: delen }],
    generationConfig: { responseModalities: ["IMAGE"], ...(Object.keys(cfg).length ? { imageConfig: cfg } : {}) },
  });

  let res = await geminiFetch(`models/${model}:generateContent`, verzoek(imageConfig), 180_000);
  // Een model dat imageSize niet kent, krijgt het verzoek nog één keer zonder.
  if (res.status === 400 && /imageSize|image_size/i.test(res.text) && imageConfig.imageSize) {
    const { imageSize: _weg, ...zonder } = imageConfig;
    void _weg;
    res = await geminiFetch(`models/${model}:generateContent`, verzoek(zonder), 180_000);
  }
  if (isTegoedFout(res.status, res.text)) {
    await zetSlot("beeld", TEGOED_MELDING);
    throw AppError.precondition(TEGOED_MELDING);
  }
  if (res.status !== 200) {
    logger.warn("gemini beeld mislukt", { status: res.status, model });
    throw AppError.upstream(`Google gaf een fout (${res.status}) bij het maken van de foto. Probeer het zo nog eens.`);
  }
  const antwoord = JSON.parse(res.text) as GenerateAntwoord;
  const beeld = eersteInline(antwoord, "image/");
  if (!beeld) {
    const reden = antwoord.promptFeedback?.blockReason ?? antwoord.candidates?.[0]?.finishReason;
    throw AppError.upstream(reden ? `Google maakte geen foto (${reden}). Beschrijf het anders.` : "Google gaf geen foto terug. Beschrijf het iets anders.");
  }
  await zetSlot("beeld", null);
  await kvSet(GELUKT_KEY, new Date().toISOString()).catch(() => undefined);
  return { b64: beeld.data, mime: beeld.mime, model };
}

/**
 * Tekst laten schrijven met zoeken op het web (Google Search grounding): actuele
 * antwoorden mét bronnen. Gooit een AppError bij geen sleutel of tegoed; de
 * aanroeper valt dan terug op een gewoon antwoord zonder web.
 */
export async function geminiZoekTekst(prompt: string, model: string): Promise<{ tekst: string; bronnen: { titel: string; url: string }[] }> {
  const res = await geminiFetch(`models/${model}:generateContent`, { contents: [{ role: "user", parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }, 120_000);
  if (res.status !== 200) throw AppError.upstream(`Google gaf een fout (${res.status}) bij het zoeken.`);
  const a = JSON.parse(res.text) as { candidates?: { content?: { parts?: { text?: string }[] }; groundingMetadata?: { groundingChunks?: { web?: { title?: string; uri?: string } }[] } }[] };
  const c = a.candidates?.[0];
  const tekst = (c?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!tekst) throw AppError.upstream("Google gaf geen antwoord.");
  const bronnen = (c?.groundingMetadata?.groundingChunks ?? []).flatMap((g) => (g.web?.uri ? [{ titel: g.web.title ?? g.web.uri, url: g.web.uri }] : [])).slice(0, 8);
  return { tekst, bronnen };
}

/** Voorlezen met Gemini-TTS. Probeert de modellen na elkaar (elk eigen dagtegoed). WAV-bytes of null. */
export async function geminiStem(tekst: string, stem = "Kore", toon = "Lees vlot en enthousiast voor, als een reclamespot"): Promise<Buffer | null> {
  const schoon = tekst.trim().slice(0, 4000);
  if (!schoon || !(await geminiSleutel())) return null;
  for (const model of TTS_MODELLEN) {
    // De 3.8-modellen lezen een instructie hardop voor: die krijgen alleen de tekst.
    const prompt = model.startsWith("gemini-3.8") ? schoon : `${toon}, in het Nederlands:\n\n${schoon}`;
    try {
      const res = await geminiFetch(
        `models/${model}:generateContent`,
        {
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: stem } } } },
        },
        90_000,
      );
      if (res.status === 429 || res.status === 404 || res.status >= 500) continue;
      if (res.status !== 200) {
        logger.warn("gemini stem mislukt", { status: res.status, model });
        continue;
      }
      const audio = eersteInline(JSON.parse(res.text) as GenerateAntwoord, "audio/");
      if (!audio) continue;
      const rate = Number(/rate=(\d+)/.exec(audio.mime)?.[1] ?? 24000);
      const bytes = Buffer.from(audio.data, "base64");
      return /wav/i.test(audio.mime) ? bytes : pcmNaarWav(bytes, rate);
    } catch (err) {
      logger.warn("gemini stem fout", { model, error: (err as Error).message });
    }
  }
  return null;
}

// ---- Veo: echte AI-videoclips -------------------------------------------------

interface ModelLijst {
  models?: { name?: string; supportedGenerationMethods?: string[] }[];
}

let veoCache: { model: string | null; at: number } | null = null;

/** Het beste Veo-model dat deze sleutel mag gebruiken (null = geen toegang). */
export async function veoModel(): Promise<string | null> {
  if (veoCache && Date.now() - veoCache.at < 30 * 60_000) return veoCache.model;
  const key = await geminiSleutel();
  if (!key) return null;
  let model: string | null = null;
  try {
    const res = await fetch(`${API}/models?pageSize=300`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const lijst = ((await res.json()) as ModelLijst).models ?? [];
      const veo = lijst
        .filter((m) => /veo/i.test(m.name ?? "") && (m.supportedGenerationMethods ?? []).some((x) => /predictLongRunning/i.test(x)))
        .map((m) => (m.name ?? "").replace(/^models\//, ""))
        // Hoogste versie eerst; de gewone boven "fast" (betere kwaliteit).
        .sort((a, b) => b.localeCompare(a, "en", { numeric: true }) || Number(a.includes("fast")) - Number(b.includes("fast")));
      model = veo.find((m) => !m.includes("fast")) ?? veo[0] ?? null;
    }
  } catch {
    model = null;
  }
  veoCache = { model, at: Date.now() };
  return model;
}

export const VEO_GEEN_TOEGANG =
  "Deze Google-sleutel heeft nog geen toegang tot Veo (AI-video). Zet betalen aan in Google AI Studio; daarna verschijnt Veo vanzelf (binnen een half uur).";

/** Start een Veo-clip. Geeft de naam van de lopende bewerking terug. */
export async function veoStart(prompt: string, verhouding: "16:9" | "9:16"): Promise<string> {
  const model = await veoModel();
  if (!model) {
    await zetSlot("video", VEO_GEEN_TOEGANG);
    throw AppError.precondition(VEO_GEEN_TOEGANG);
  }
  const res = await geminiFetch(`models/${model}:predictLongRunning`, { instances: [{ prompt }], parameters: { aspectRatio: verhouding } }, 30_000);
  if (isTegoedFout(res.status, res.text)) {
    await zetSlot("video", TEGOED_MELDING);
    throw AppError.precondition(TEGOED_MELDING);
  }
  if (res.status !== 200) {
    logger.warn("veo start mislukt", { status: res.status, model });
    throw AppError.upstream(`Google kon de video niet starten (${res.status}).`);
  }
  const naam = (JSON.parse(res.text) as { name?: string }).name;
  if (!naam || !isVeoOperatie(naam)) throw AppError.upstream("Google gaf geen geldige bewerking terug.");
  await zetSlot("video", null);
  return naam;
}

export function isVeoOperatie(naam: string): boolean {
  return /^models\/[a-z0-9.-]+\/operations\/[a-z0-9_-]+$/i.test(naam);
}

/** Kijk of een Veo-clip klaar is. Klaar → de MP4-bytes. */
export async function veoStatus(naam: string): Promise<{ klaar: false } | { klaar: true; mp4: Buffer }> {
  if (!isVeoOperatie(naam)) throw AppError.validation("Onbekende video-opdracht.");
  const key = await geminiSleutel();
  if (!key) throw AppError.precondition("Er hangt geen Gemini-sleutel aan ZekerFlex.");
  const res = await fetch(`${API}/${naam}`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw AppError.upstream(`Google gaf een fout (${res.status}) bij het opvragen van de video.`);
  const op = (await res.json()) as {
    done?: boolean;
    error?: { message?: string };
    response?: { generateVideoResponse?: { generatedSamples?: { video?: { uri?: string } }[]; raiMediaFilteredReasons?: string[] } };
  };
  if (!op.done) return { klaar: false };
  if (op.error) throw AppError.upstream(`Google maakte de video niet: ${op.error.message ?? "onbekende fout"}`);
  const uri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) {
    const reden = op.response?.generateVideoResponse?.raiMediaFilteredReasons?.[0];
    throw AppError.upstream(reden ? `Google hield de video tegen: ${reden}` : "Google gaf geen video terug.");
  }
  // Alleen van Google zelf downloaden (de sleutel gaat mee in de kop).
  if (!isGeminiHost(uri)) throw AppError.upstream("De video stond op een onverwacht adres.");
  const dl = await fetch(uri, { headers: { "x-goog-api-key": key }, redirect: "follow", signal: AbortSignal.timeout(120_000) });
  if (!dl.ok) throw AppError.upstream(`Downloaden van de video mislukte (${dl.status}).`);
  return { klaar: true, mp4: Buffer.from(await dl.arrayBuffer()) };
}
