import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors";

// ---------------------------------------------------------------------------
// Gratis AI-foto's via Cloudflare Workers AI (FLUX.1 schnell van Black Forest
// Labs). Elk Cloudflare-account krijgt 10.000 "neurons" per dag gratis; een
// foto van 1024 × 1024 in 4 stappen kost er ongeveer 58 (4 tegels × 4,8 + 4
// stappen × 9,6), dus zo'n 170 foto's per dag. De teller gaat om 00:00 UTC terug.
// Nodig: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_AI_TOKEN (token met Workers AI-recht).
// ---------------------------------------------------------------------------

export const CLOUDFLARE_BEELDMODEL = "@cf/black-forest-labs/flux-1-schnell";

export function cloudflareBeschikbaar(): boolean {
  return Boolean(env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_AI_TOKEN);
}

interface CfAntwoord {
  success?: boolean;
  result?: { image?: string };
  errors?: { code?: number; message?: string }[];
}

/** Maak een foto (JPEG, 1024 × 1024). Gooit een nette AppError als het niet kan. */
export async function cloudflareBeeld(prompt: string, seed?: number): Promise<{ b64: string; mime: "image/jpeg" }> {
  if (!cloudflareBeschikbaar()) throw AppError.precondition("Cloudflare Workers AI is niet gekoppeld (CLOUDFLARE_ACCOUNT_ID en CLOUDFLARE_AI_TOKEN ontbreken).");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID ?? "")}/ai/run/${CLOUDFLARE_BEELDMODEL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.CLOUDFLARE_AI_TOKEN}` },
    body: JSON.stringify({ prompt: prompt.slice(0, 2000), steps: 4, ...(seed !== undefined ? { seed } : {}) }),
    signal: AbortSignal.timeout(90_000),
  });
  const tekst = await res.text();
  let body: CfAntwoord = {};
  try {
    body = JSON.parse(tekst) as CfAntwoord;
  } catch {
    /* geen JSON */
  }
  if (res.status === 429 || /neuron|limit|quota|daily/i.test(body.errors?.[0]?.message ?? "")) {
    throw AppError.precondition("Het gratis dagtegoed van Cloudflare voor AI-foto's is op. Om 01:00 's nachts (00:00 UTC) begint het weer.");
  }
  if (res.status === 401 || res.status === 403) throw AppError.precondition("Cloudflare weigert de sleutel. Controleer CLOUDFLARE_AI_TOKEN (recht: Workers AI) en CLOUDFLARE_ACCOUNT_ID.");
  const image = body.result?.image;
  if (!res.ok || !image) {
    logger.warn("cloudflare beeld mislukt", { status: res.status, fout: body.errors?.[0]?.message?.slice(0, 120) });
    throw AppError.upstream("Cloudflare maakte geen foto. Beschrijf het iets anders of probeer het zo opnieuw.");
  }
  return { b64: image.replace(/^data:image\/\w+;base64,/, ""), mime: "image/jpeg" };
}
