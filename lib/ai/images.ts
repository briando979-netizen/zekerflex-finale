import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

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
  detail?: string;
  models?: string[];
}

export async function imageHealth(): Promise<ImageBackendHealth> {
  const base = env.IMAGE_BASE_URL.replace(/\/+$/, "");
  const common = {
    configured: env.IMAGE_ENABLED,
    backend: env.IMAGE_BACKEND,
    baseUrl: env.IMAGE_BASE_URL,
    local: isLocalImageBackend(),
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

export async function generateImage(input: GenerateImageInput): Promise<GeneratedImage> {
  if (!env.IMAGE_ENABLED) {
    throw AppError.precondition(
      "De beeldgenerator is niet ingeschakeld. Zet IMAGE_ENABLED=true en start een lokale Stable Diffusion-server.",
    );
  }
  if (!isLocalImageBackend()) {
    throw AppError.upstream(
      `Soevereiniteitsgrendel: IMAGE_BASE_URL host "${imageHost()}" is niet lokaal.`,
    );
  }

  // Serialise — one render at a time.
  let held = false;
  try {
    const n = await redis.incr(CONC_KEY);
    if (n === 1) await redis.expire(CONC_KEY, 900);
    held = true;
    if (n > MAX_CONCURRENCY) {
      throw AppError.precondition("Er loopt al een render. Wacht tot die klaar is.");
    }

    const started = Date.now();
    const out =
      env.IMAGE_BACKEND === "a1111"
        ? await genA1111(input)
        : env.IMAGE_BACKEND === "openai"
          ? await genOpenAI(input)
          : await genComfy(input);
    logger.info("image generated", {
      backend: env.IMAGE_BACKEND,
      ms: Date.now() - started,
      purpose: input.purpose ?? "studio",
    });
    return out;
  } catch (err) {
    if (err instanceof AppError) throw err;
    if ((err as Error).name === "TimeoutError") {
      throw AppError.upstream(
        `De render duurde te lang (> ${Math.round(env.IMAGE_TIMEOUT_MS / 1000)}s). Op een CPU kan dit gebeuren — verlaag de resolutie of het aantal stappen.`,
      );
    }
    logger.error("image generation failed", { error: (err as Error).message });
    throw AppError.upstream(`Beeldgenerator niet bereikbaar: ${(err as Error).message}`);
  } finally {
    if (held) await redis.decr(CONC_KEY).catch(() => undefined);
  }
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
