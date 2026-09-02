import { z } from "zod";
import { loadLocalEnv } from "@/lib/config/load-env";

// Pull the local .env into process.env first (no-op under Next, which already
// did it) so scripts / seed / tests are self-sufficient.
loadLocalEnv();

/**
 * Centralised, validated environment access. Import `env` instead of reading
 * `process.env` directly so that a misconfigured deployment fails fast at boot
 * rather than deep inside a request handler.
 */
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  // Auth (NextAuth v5 + jose HS256 session tokens).
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.string().url().optional(),

  // Google OAuth (optional - provider is only registered when both are set).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  AUTH_TRUST_HOST: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // Shared secret for internal cron endpoints (matching follow-up worker).
  INTERNAL_CRON_TOKEN: z.string().min(16).optional(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),

  MATCHING_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.55),
  MATCHING_MAX_TRAVEL_MINUTES: z.coerce.number().positive().default(75),
  MATCHING_WEIGHT_RELIABILITY: z.coerce.number().min(0).max(1).default(0.4),
  MATCHING_WEIGHT_TRAVEL: z.coerce.number().min(0).max(1).default(0.35),
  MATCHING_WEIGHT_SKILL: z.coerce.number().min(0).max(1).default(0.25),

  GOOGLE_MAPS_API_KEY: z.string().optional(),
  OPENOV_BASE_URL: z.string().url().default("https://api.openov.nl"),

  // Push: self-hosted Web Push (VAPID / RFC 8291) is the primary channel.
  // Firebase FCM is an optional secondary provider (native apps that still
  // ship the Google SDK). Generate a VAPID keypair with `npm run vapid:keys`.
  WEBPUSH_VAPID_PUBLIC_KEY: z.string().optional(),
  WEBPUSH_VAPID_PRIVATE_KEY: z.string().optional(),
  WEBPUSH_CONTACT: z.string().default("mailto:bounced@zekerflex.com"),

  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  // Self-hosted LLM (OpenAI-compatible: Ollama / vLLM / llama.cpp / LocalAI).
  // No Big-Tech SaaS dependency - points at a model running in the box.
  LLM_BASE_URL: z.string().url().default("http://localhost:11434/v1"),
  LLM_MODEL: z.string().default("llama3.1:8b"),
  // A small, fast model for greetings / short chat / routing. Falls back to
  // LLM_MODEL when unset. Tool work (RAG, console, orchestration) always uses
  // the full LLM_MODEL.
  LLM_FAST_MODEL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_EMBED_MODEL: z.string().optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  // Self-hosted image generation (the marketing Studio). Optional - the Studio
  // shows setup instructions when no backend is configured. Supported backends:
  //   "a1111"  -> AUTOMATIC1111 / Forge  (POST {base}/sdapi/v1/txt2img)
  //   "openai" -> OpenAI-compatible      (POST {base}/images/generations)
  //   "comfyui" -> ComfyUI prompt API    (POST {base}/prompt, needs IMAGE_COMFY_WORKFLOW)
  IMAGE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  IMAGE_BACKEND: z.enum(["a1111", "openai", "comfyui"]).default("a1111"),
  IMAGE_BASE_URL: z.string().url().default("http://localhost:7860"),
  IMAGE_MODEL: z.string().optional(),
  IMAGE_API_KEY: z.string().optional(),
  IMAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  IMAGE_STEPS: z.coerce.number().int().positive().max(60).default(28),
  IMAGE_CFG: z.coerce.number().positive().max(20).default(5.5),
  IMAGE_SAMPLER: z.string().default("DPM++ 2M Karras"),
  IMAGE_COMFY_WORKFLOW: z.string().optional(),

  // Outbound e-mail. Every message is ALWAYS captured in the local mailbox
  // (storage/mail, visible at /admin/mail) so registration never blocks.
  // Set SMTP_HOST to also deliver for real - a local catcher (Mailpit / MailHog
  // on :1025), a self-hosted Postfix, or an external relay.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_TIMEOUT_S: z.coerce.number().int().positive().default(20),
  MAIL_FROM: z.string().default("noreply@zekerflex.com"),
  MAIL_FROM_NAME: z.string().default("ZekerFlex"),
  MAIL_ADMIN: z.string().default("info@zekerflex.com"),
  // Where human replies to system mail should land, and the sender identity for
  // uitzend-/payroll-related notifications. Both are addresses on the ZekerFlex
  // domain (mailbox or alias); the SMTP session still authenticates as SMTP_USER.
  MAIL_REPLY_TO: z.string().default("info@zekerflex.com"),
  MAIL_UITZEND_FROM: z.string().default("uitzendbureau@zekerflex.com"),
  MAIL_NIEUWSBRIEF_FROM: z.string().default("nieuwsbrief@zekerflex.com"),

  // Local speech-to-text for the Jarvis mic (optional, sovereign). An
  // OpenAI-compatible /audio/transcriptions endpoint: faster-whisper-server,
  // whisper.cpp server, speaches, LocalAI. When unset the console uses the
  // browser's built-in Web Speech API (Chrome / Edge).
  WHISPER_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  WHISPER_BASE_URL: z.string().url().default("http://localhost:8000/v1"),
  WHISPER_MODEL: z.string().default("Systran/faster-whisper-base"),
  WHISPER_API_KEY: z.string().optional(),

  // Fail-safe auto-retry so a brief Ollama hiccup (model load, restart) never
  // surfaces as "not reachable". Retries a connection error / 5xx with
  // exponential backoff up to LLM_RETRY_MAX times or LLM_RETRY_MAX_WAIT_MS total.
  LLM_RETRY_MAX: z.coerce.number().int().nonnegative().default(6),
  LLM_RETRY_BASE_MS: z.coerce.number().int().positive().default(600),
  LLM_RETRY_MAX_WAIT_MS: z.coerce.number().int().positive().default(120_000),
  // Passed to Ollama so the model stays resident between requests.
  LLM_KEEP_ALIVE: z.string().default("30m"),

  // Voice / TTS - 100% local. Browser speech synthesis is always available;
  // Piper (https://github.com/rhasspy/piper) gives a natural server-side voice.
  VOICE_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  PIPER_BIN: z.string().optional(),
  PIPER_MODEL: z.string().optional(),

  // Local RAG / total memory (Float[] embeddings + JS cosine; no pgvector).
  RAG_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  RAG_EMBED_DIM: z.coerce.number().int().positive().default(768),
  RAG_MAX_CHUNKS: z.coerce.number().int().positive().default(8000),

  // AI budget governor - local throttling so a runaway loop can never grind
  // tokens or hit a provider limit. Local inference is free; these are guards.
  AI_MAX_CONCURRENCY: z.coerce.number().int().positive().default(2),
  AI_REQUESTS_PER_MIN: z.coerce.number().int().positive().default(30),
  AI_MIN_INTERVAL_MS: z.coerce.number().int().nonnegative().default(0),
  AI_DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().default(3_000_000),
  AI_MAX_WAIT_MS: z.coerce.number().int().positive().default(45_000),
  AI_BUDGET_HARD: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // When false (default) the governor refuses any non-local LLM_BASE_URL host.
  AI_ALLOW_REMOTE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Local upload storage root (relative to cwd or absolute).
  UPLOADS_DIR: z.string().default("./storage/uploads"),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(25_000_000),

  // Speak a status briefing on the first server activity after boot.
  JARVIS_BOOT_BRIEFING: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  SEPA_API_BASE_URL: z.string().url().optional(),
  SEPA_API_KEY: z.string().optional(),
  SEPA_CREDITOR_IBAN: z.string().optional(),
  SEPA_CREDITOR_NAME: z.string().default("ZekerFlex B.V."),

  // KVKBase - Dutch Handelsregister company data & VAT validation.
  KVKBASE_API_URL: z.string().url().default("https://api.kvkbase.nl"),
  KVKBASE_API_KEY: z.string().optional(),

  // Didit - KYC / identity verification.
  DIDIT_BASE_URL: z.string().url().default("https://verification.didit.me"),
  DIDIT_API_KEY: z.string().optional(),
  DIDIT_WEBHOOK_SECRET: z.string().optional(),
  DIDIT_WORKFLOW_ID: z.string().optional(),
  DIDIT_CALLBACK_URL: z.string().url().optional(),

  DBA_MAX_HOURS_PER_CLIENT: z.coerce.number().positive().default(1200),
  DBA_WARN_HOURS_PER_CLIENT: z.coerce.number().positive().default(900),
  DBA_MAX_CONSECUTIVE_WEEKS: z.coerce.number().positive().default(26),
  DBA_MAX_CLIENT_REVENUE_SHARE: z.coerce.number().min(0).max(1).default(0.7),

  // Employer platform fee: a flat amount per billable hour (NOT a % of gross).
  PLATFORM_FEE_PER_HOUR_CENTS: z.coerce.number().int().min(0).default(350),
  // Legacy percentage fee — kept for old invoices / config; per-hour is authoritative.
  PLATFORM_FEE_RATE: z.coerce.number().min(0).max(1).default(0.08),
  VAT_RATE_STANDARD: z.coerce.number().min(0).max(1).default(0.21),

  // Freelancer "laat sneller uitbetalen" fees, withheld from their payout.
  PAYOUT_INSTANT_FEE_RATE: z.coerce.number().min(0).max(1).default(0.04), // bij uren-goedkeuring
  PAYOUT_3DAY_FEE_RATE: z.coerce.number().min(0).max(1).default(0.02), // binnen 3 werkdagen
  // "wachten tot opdrachtgever betaalt" = 0%, binnen 30 dagen
  // Voorschot: fee on the advanced amount, settled against the next payout.
  ADVANCE_FEE_RATE: z.coerce.number().min(0).max(1).default(0.03),
  ADVANCE_MAX_RATE_OF_PENDING: z.coerce.number().min(0).max(1).default(0.8),
});

function loadEnv() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof schema>;
