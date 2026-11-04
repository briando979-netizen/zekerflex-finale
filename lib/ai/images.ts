import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";
import { GEMINI_BEELDMODELLEN, geminiBeeld, geminiBeschikbaar, geminiSlot, VERHOUDINGEN, type BeeldGrootte, type GeminiBeeldModel, type Verhouding } from "@/lib/ai/gemini-media";

// ---------------------------------------------------------------------------
// Self-hosted image generation adapter — the same "point at a model in the box"
// pattern as the LLM client. Talks to a local Stable Diffusion backend
// (AUTOMATIC1111 / Forge, an OpenAI-compatible image server, or ComfyUI).
// No cloud, no per-image cost. Never surfaces a raw stack trace.
// ---------------------------------------------------------------------------

const PRIVATE_HOST =
  /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/i;

function imageHost(): string {
  try {
    return new URL(env.IMAGE_BASE_URL).host;
  } catch {
    return env.IMAGE_BASE_URL;
  }
}

export function isLocalImageBackend(): boolean {
  return PRIVATE_HOST.test(imageHost());
}

export interface ImageBackendHealth {
  configured: boolean;
  backend: string;
  baseUrl: string;
  reachable: boolean;
  local: boolean;
  remoteAllowed: boolean;
  detail?: string;
  models?: string[];
  /** Bekende blokkade die het maken (nog) tegenhoudt, bv. geen beeldtegoed bij Google. */
  warning?: string;
}

export type BeeldBackend = "a1111" | "openai" | "comfyui" | "gemini";

/**
 * Welke beeldgenerator er echt draait. Een eigen Stable Diffusion-server gaat
 * voor (IMAGE_ENABLED); staat die uit en draait de live AI op Gemini, dan maakt
 * Gemini (Nano Banana) de foto's. null = er is niets om foto's mee te maken.
 */
export async function beeldBackend(): Promise<BeeldBackend | null> {
  if (env.IMAGE_BACKEND === "gemini") return (await geminiBeschikbaar()) ? "gemini" : null;
  if (env.IMAGE_ENABLED) return env.IMAGE_BACKEND;
  return (await geminiBeschikbaar()) ? "gemini" : null;
}

/** Dichtstbijzijnde verhouding die Gemini kent, bij een breedte en hoogte. */
export function verhoudingVoor(width: number, height: number): Verhouding {
  const doel = width / Math.max(1, height);
  let beste: Verhouding = "1:1";
  let afstand = Infinity;
  for (const v of VERHOUDINGEN) {
    const [a, b] = v.split(":").map(Number);
    const d = Math.abs(Math.log((a ?? 1) / (b ?? 1)) - Math.log(doel));
    if (d < afstand) {
      afstand = d;
      beste = v;
    }
  }
  return beste;
}

export async function imageHealth(): Promise<ImageBackendHealth> {
  if ((await beeldBackend()) === "gemini") {
    const slot = await geminiSlot("beeld");
    return {
      configured: true,
      backend: "gemini",
      baseUrl: "Google Gemini",
      reachable: true,
      local: false,
      remoteAllowed: true,
      models: GEMINI_BEELDMODELLEN.map((m) => `${m.label} (${m.id})`),
      ...(slot ? { warning: slot.melding } : {}),
    };
  }
  const base = env.IMAGE_BASE_URL.replace(/\/+$/, "");
  const common = {
    configured: env.IMAGE_ENABLED,
    backend: env.IMAGE_BACKEND,
    baseUrl: env.IMAGE_BASE_URL,
    local: isLocalImageBackend(),
    remoteAllowed: env.IMAGE_ALLOW_REMOTE,
  };
  if (!env.IMAGE_ENABLED) {
    return { ...common, reachable: false, detail: "IMAGE_ENABLED staat op false" };
  }
  try {
    const probe =
      env.IMAGE_BACKEND === "a1111"
        ? `${base}/sdapi/v1/sd-models`
        : env.IMAGE_BACKEND === "openai"
          ? `${base}/models`
          : `${base}/system_stats`;
    const res = await fetch(probe, {
      signal: AbortSignal.timeout(4000),
      ...(env.IMAGE_API_KEY ? { headers: { Authorization: `Bearer ${env.IMAGE_API_KEY}` } } : {}),
    });
    if (!res.ok) {
      return { ...common, reachable: false, detail: `probe HTTP ${res.status}` };
    }
    let models: string[] | undefined;
    try {
      const body = await res.json();
      if (Array.isArray(body)) {
        models = body
          .map((m: { model_name?: string; title?: string }) => m.model_name ?? m.title)
          .filter((x): x is string => Boolean(x));
      } else if (body?.data) {
        models = body.data.map((m: { id?: string }) => m.id).filter((x: unknown): x is string => Boolean(x));
      }
    } catch {
      /* probe ok is enough */
    }
    return { ...common, reachable: true, ...(models ? { models } : {}) };
  } catch (err) {
    return { ...common, reachable: false, detail: (err as Error).message };
  }
}

export interface GenerateImageInput {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps?: number;
  seed?: number;
  purpose?: string;
  /** Alleen bij Gemini: welk Nano Banana-model en hoe groot. */
  geminiModel?: GeminiBeeldModel;
  geminiGrootte?: BeeldGrootte;
}

export interface GeneratedImage {
  /** raw base64 (no data: prefix) */
  b64: string;
  mimeType: "image/png";
  seed?: number;
  width: number;
  height: number;
  backend: string;
}

const CONC_KEY = "img:gen:concurrency";
const MAX_CONCURRENCY = 1; // a CPU render pins the box; serialise hard

// Gedeelde render-wrapper: sovereiniteitsgrendel (alleen lokaal), één render
// tegelijk (een CPU-render legt de box plat), en nette foutafhandeling. Zowel
// genereren (txt2img) als bewerken (img2img) lopen hier doorheen.
async function runRender<T>(purpose: string, fn: () => Promise<T>): Promise<T> {
  if (!env.IMAGE_ENABLED) {
    throw AppError.precondition(
      "De beeldgenerator is niet ingeschakeld. Zet IMAGE_ENABLED=true en start een lokale Stable Diffusion-server.",
    );
  }
  if (!isLocalImageBackend() && !env.IMAGE_ALLOW_REMOTE) {
    throw AppError.upstream(
      `Soevereiniteitsgrendel: IMAGE_BASE_URL host "${imageHost()}" is niet lokaal. Draai je je eigen server op afstand (bv. je VPS via een tunnel)? Zet dan IMAGE_ALLOW_REMOTE=true.`,
    );
  }

  let held = false;
  try {
    const n = await redis.incr(CONC_KEY);
    if (n === 1) await redis.expire(CONC_KEY, 900);
    held = true;
    if (n > MAX_CONCURRENCY) {
      throw AppError.precondition("Er loopt al een render. Wacht tot die klaar is.");
    }
    const started = Date.now();
    const out = await fn();
    logger.info("image render", { backend: env.IMAGE_BACKEND, ms: Date.now() - started, purpose });
    return out;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if ((err as Error).name === "TimeoutError") {
      throw AppError.upstream(
        `De render duurde te lang (> ${Math.round(env.IMAGE_TIMEOUT_MS / 1000)}s). Op een CPU kan dit gebeuren — verlaag de resolutie of het aantal stappen.`,
      );
    }
    logger.error("image render failed", { error: (err as Error).message });
    throw AppError.upstream(`Beeldgenerator niet bereikbaar: ${(err as Error).message}`);
  } finally {
    if (held) await redis.decr(CONC_KEY).catch(() => undefined);
  }
}

// Gemini geeft meestal PNG; is het iets anders, dan maken we er PNG van zodat
// iedereen die GeneratedImage gebruikt hetzelfde krijgt.
async function viaGemini(input: { prompt: string; width: number; height: number; bron?: string; model?: GeminiBeeldModel; grootte?: BeeldGrootte; purpose: string }): Promise<GeneratedImage> {
  const started = Date.now();
  const bronMime = /^data:(image\/[a-z+]+);base64,/.exec(input.bron ?? "")?.[1] ?? "image/png";
  const beeld = await geminiBeeld({
    prompt: input.prompt,
    verhouding: verhoudingVoor(input.width, input.height),
    grootte: input.grootte ?? "2K",
    ...(input.model ? { model: input.model } : {}),
    ...(input.bron ? { bronnen: [{ b64: input.bron, mime: bronMime }] } : {}),
  });
  let bytes: Buffer = Buffer.from(beeld.b64, "base64");
  if (beeld.mime !== "image/png") bytes = await (await import("sharp")).default(bytes).png().toBuffer();
  const meta = await (await import("sharp")).default(bytes).metadata();
  logger.info("image render", { backend: "gemini", model: beeld.model, ms: Date.now() - started, purpose: input.purpose });
  return { b64: bytes.toString("base64"), mimeType: "image/png", width: meta.width ?? input.width, height: meta.height ?? input.height, backend: "gemini" };
}

export async function generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
  if ((await beeldBackend()) === "gemini") {
    return viaGemini({
      prompt: input.negativePrompt ? `${input.prompt}\n\nVermijd: ${input.negativePrompt}` : input.prompt,
      width: input.width,
      height: input.height,
      purpose: input.purpose ?? "studio",
      ...(input.geminiModel ? { model: input.geminiModel } : {}),
      ...(input.geminiGrootte ? { grootte: input.geminiGrootte } : {}),
    });
  }
  return runRender(input.purpose ?? "studio", () =>
    env.IMAGE_BACKEND === "a1111"
      ? genA1111(input)
      : env.IMAGE_BACKEND === "openai"
        ? genOpenAI(input)
        : genComfy(input),
  );
}

export interface EditImageInput {
  /** Bron-afbeelding als base64 (met of zonder data:-prefix). */
  imageB64: string;
  /** Instructie, bv. "maak de achtergrond wit" of "voeg een helm toe". */
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  /** 0..1: hoeveel er mag veranderen (laag = dicht bij het origineel). */
  denoise?: number;
  steps?: number;
  seed?: number;
  purpose?: string;
}

// Beeld-bewerking (img2img): bestaande foto + instructie → bewerkte foto. De
// self-hosted tegenhanger van "Nano Banana", zonder credits. A1111 ondersteunt
// dit via /sdapi/v1/img2img; voor andere backends volgt een duidelijke melding.
export async function editImage(input: EditImageInput & { geminiModel?: GeminiBeeldModel }): Promise<GeneratedImage> {
  // Gemini bewerkt een foto op instructie (de echte "Nano Banana"): het houdt
  // de foto en verandert alleen wat je vraagt, dus geen denoise nodig.
  if ((await beeldBackend()) === "gemini") {
    return viaGemini({
      prompt: `Bewerk deze foto: ${input.prompt}. Houd al het andere precies zoals het is.`,
      width: input.width,
      height: input.height,
      bron: input.imageB64.startsWith("data:") ? input.imageB64 : `data:image/png;base64,${input.imageB64}`,
      purpose: input.purpose ?? "studio:edit",
      ...(input.geminiModel ? { model: input.geminiModel } : {}),
    });
  }
  if (env.IMAGE_BACKEND !== "a1111") {
    throw AppError.precondition(
      `Beeld-bewerken wordt nu alleen ondersteund op de a1111-backend (IMAGE_BACKEND=a1111). Huidige backend: ${env.IMAGE_BACKEND}.`,
    );
  }
  return runRender(input.purpose ?? "studio:edit", () => editA1111(input));
}

async function genA1111(input: GenerateImageInput): Promise<GeneratedImage> {
  const base = env.IMAGE_BASE_URL.replace(/\/+$/, "");
  const res = await fetch(`${base}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.IMAGE_API_KEY ? { Authorization: `Bearer ${env.IMAGE_API_KEY}` } : {}),
    },
    signal: AbortSignal.timeout(env.IMAGE_TIMEOUT_MS),
    body: JSON.stringify({
      prompt: input.prompt,
      negative_prompt: input.negativePrompt ?? "",
      width: input.width,
      height: input.height,
      steps: input.steps ?? env.IMAGE_STEPS,
      cfg_scale: env.IMAGE_CFG,
      sampler_name: env.IMAGE_SAMPLER,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(env.IMAGE_MODEL ? { override_settings: { sd_model_checkpoint: env.IMAGE_MODEL } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`A1111 HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { images?: string[]; info?: string };
  const b64 = body.images?.[0];
  if (!b64) throw new Error("A1111 gaf geen afbeelding terug");
  let seed: number | undefined;
  try {
    seed = JSON.parse(body.info ?? "{}").seed;
  } catch {
    /* ignore */
  }
  return {
    b64: b64.replace(/^data:image\/\w+;base64,/, ""),
    mimeType: "image/png",
    width: input.width,
    height: input.height,
    backend: "a1111",
    ...(seed !== undefined ? { seed } : {}),
  };
}

async function editA1111(input: EditImageInput): Promise<GeneratedImage> {
  const base = env.IMAGE_BASE_URL.replace(/\/+$/, "");
  const initImage = input.imageB64.replace(/^data:image\/\w+;base64,/, "");
  const denoise = Math.min(1, Math.max(0.05, input.denoise ?? 0.6));
  const res = await fetch(`${base}/sdapi/v1/img2img`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.IMAGE_API_KEY ? { Authorization: `Bearer ${env.IMAGE_API_KEY}` } : {}),
    },
    signal: AbortSignal.timeout(env.IMAGE_TIMEOUT_MS),
    body: JSON.stringify({
      init_images: [initImage],
      prompt: input.prompt,
      negative_prompt: input.negativePrompt ?? "",
      denoising_strength: denoise,
      width: input.width,
      height: input.height,
      steps: input.steps ?? env.IMAGE_STEPS,
      cfg_scale: env.IMAGE_CFG,
      sampler_name: env.IMAGE_SAMPLER,
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(env.IMAGE_MODEL ? { override_settings: { sd_model_checkpoint: env.IMAGE_MODEL } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`A1111 img2img HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { images?: string[]; info?: string };
  const b64 = body.images?.[0];
  if (!b64) throw new Error("A1111 gaf geen bewerkte afbeelding terug");
  let seed: number | undefined;
  try {
    seed = JSON.parse(body.info ?? "{}").seed;
  } catch {
    /* ignore */
  }
  return {
    b64: b64.replace(/^data:image\/\w+;base64,/, ""),
    mimeType: "image/png",
    width: input.width,
    height: input.height,
    backend: "a1111",
    ...(seed !== undefined ? { seed } : {}),
  };
}

async function genOpenAI(input: GenerateImageInput): Promise<GeneratedImage> {
  const base = env.IMAGE_BASE_URL.replace(/\/+$/, "");
  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.IMAGE_API_KEY ? { Authorization: `Bearer ${env.IMAGE_API_KEY}` } : {}),
    },
    signal: AbortSignal.timeout(env.IMAGE_TIMEOUT_MS),
    body: JSON.stringify({
      prompt: input.negativePrompt
        ? `${input.prompt}\n\nNegative: ${input.negativePrompt}`
        : input.prompt,
      n: 1,
      size: `${input.width}x${input.height}`,
      response_format: "b64_json",
      ...(env.IMAGE_MODEL ? { model: env.IMAGE_MODEL } : {}),
    }),
  });
  if (!res.ok) throw new Error(`OpenAI-image HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error("Image-server gaf geen afbeelding terug");
  return {
    b64,
    mimeType: "image/png",
    width: input.width,
    height: input.height,
    backend: "openai",
  };
}

async function genComfy(input: GenerateImageInput): Promise<GeneratedImage> {
  if (!env.IMAGE_COMFY_WORKFLOW) {
    throw AppError.precondition("ComfyUI vereist IMAGE_COMFY_WORKFLOW (pad naar een API-workflow JSON).");
  }
  // Minimal: substitute placeholders in the workflow template and poll history.
  const fs = await import("node:fs/promises");
  const tpl = await fs.readFile(env.IMAGE_COMFY_WORKFLOW, "utf8");
  const workflow = JSON.parse(
    tpl
      .replaceAll("{{PROMPT}}", JSON.stringify(input.prompt).slice(1, -1))
      .replaceAll("{{NEGATIVE}}", JSON.stringify(input.negativePrompt ?? "").slice(1, -1))
      .replaceAll("{{WIDTH}}", String(input.width))
      .replaceAll("{{HEIGHT}}", String(input.height))
      .replaceAll("{{SEED}}", String(input.seed ?? Math.floor(Math.random() * 1e9))),
  );
  const base = env.IMAGE_BASE_URL.replace(/\/+$/, "");
  const q = await fetch(`${base}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!q.ok) throw new Error(`ComfyUI HTTP ${q.status}`);
  const { prompt_id } = (await q.json()) as { prompt_id: string };

  const deadline = Date.now() + env.IMAGE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    const h = await fetch(`${base}/history/${prompt_id}`, { signal: AbortSignal.timeout(10000) });
    if (!h.ok) continue;
    const hist = (await h.json()) as Record<string, { outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }> }>;
    const entry = hist[prompt_id];
    const img = entry?.outputs
      ? Object.values(entry.outputs).flatMap((o) => o.images ?? [])[0]
      : undefined;
    if (img) {
      const view = await fetch(
        `${base}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${img.type}`,
        { signal: AbortSignal.timeout(15000) },
      );
      const buf = Buffer.from(await view.arrayBuffer());
      return {
        b64: buf.toString("base64"),
        mimeType: "image/png",
        width: input.width,
        height: input.height,
        backend: "comfyui",
      };
    }
  }
  throw new Error("ComfyUI render niet op tijd klaar");
}
