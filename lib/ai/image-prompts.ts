import { chat } from "@/lib/ai/client";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Marketing image prompts, art-directed for ZekerFlex: real Dutch working
// people, natural light, calm and competent, room for the brand's deep green
// (#0E5C4A) + mint (#4FE0A0) UI around the photo. No third-party logos.
// ---------------------------------------------------------------------------

export const STYLE_SUFFIX =
  "candid editorial photography, natural window light, shallow depth of field, " +
  "muted warm colour grade with soft greens, realistic skin texture, 35mm, " +
  "photographed on Kodak Portra, high detail, no text, no watermark, no logos";

export const NEGATIVE_PROMPT =
  "cartoon, illustration, 3d render, cgi, plastic skin, over-saturated, hdr, " +
  "extra fingers, deformed hands, distorted face, watermark, text, brand logos, " +
  "stock photo cheesy smile, studio white background, lens flare";

export interface PromptPreset {
  key: string;
  label: string;
  slot: string; // matching PhotoKey where relevant
  aspect: "portrait" | "landscape" | "wide";
  base: string;
}

export const PROMPT_PRESETS: PromptPreset[] = [
  {
    key: "hero-freelancer",
    label: "Hero — zzp'er onderweg",
    slot: "hero",
    aspect: "portrait",
    base:
      "a Dutch freelance worker in their late 20s walking through an Amsterdam street in the early evening, " +
      "checking their phone, wearing practical everyday work clothes, relaxed confident expression, " +
      "brick buildings and bicycles softly blurred behind them",
  },
  {
    key: "freelancer-retail",
    label: "Freelancer — winkel/magazijn",
    slot: "freelancer",
    aspect: "landscape",
    base:
      "a Dutch worker in their 30s restocking shelves in a bright modern supermarket, " +
      "focused and capable, wearing a plain apron, mid-action reaching for a product",
  },
  {
    key: "freelancer-hospitality",
    label: "Freelancer — horeca",
    slot: "freelancer",
    aspect: "landscape",
    base:
      "a Dutch hospitality worker in their 20s carrying plates in a warm cafe, " +
      "natural movement, friendly but not posed, wooden interior, afternoon light",
  },
  {
    key: "employer-branch",
    label: "Werkgever — manager op de vloer",
    slot: "employer",
    aspect: "landscape",
    base:
      "a Dutch branch manager in their 40s standing on a retail shop floor holding a tablet, " +
      "reviewing the day's staffing, calm and in control, colleagues working softly out of focus behind",
  },
  {
    key: "team-shift",
    label: "Team — drukke dienst",
    slot: "team",
    aspect: "wide",
    base:
      "three Dutch colleagues of different ages working together during a busy shift in a warehouse, " +
      "coordinated and energetic, warm industrial light, motion in the scene",
  },
];

export function aspectToSize(aspect: PromptPreset["aspect"]): { width: number; height: number } {
  // SDXL-friendly, kept modest so a CPU render is bearable.
  if (aspect === "portrait") return { width: 768, height: 960 };
  if (aspect === "wide") return { width: 1024, height: 576 };
  return { width: 960, height: 720 };
}

export function composePrompt(base: string, extra?: string): string {
  const parts = [base.trim()];
  if (extra?.trim()) parts.push(extra.trim());
  parts.push(STYLE_SUFFIX);
  return parts.join(", ");
}

/** Optionally let the local LLM tighten a rough idea into a full art-directed prompt. */
export async function enhancePrompt(idea: string): Promise<string> {
  const system =
    "Je bent art director voor ZekerFlex, een Nederlands platform voor flexibel werk. " +
    "Zet het idee van de gebruiker om in één Engelstalige beeldprompt voor een fotorealistisch " +
    "diffusion-model. Beschrijf: onderwerp (echte Nederlandse werkende mensen), setting, licht, " +
    "compositie, stemming (rustig, competent). Geen merknamen, geen tekst in beeld, geen studio-wit. " +
    "Antwoord met alleen de prompt, één alinea, max 60 woorden.";
  try {
    const res = await chat({
      purpose: "image-prompt",
      temperature: 0.6,
      maxTokens: 180,
      messages: [
        { role: "system", content: system },
        { role: "user", content: idea },
      ],
    });
    const text = res.text.trim().replace(/^["']|["']$/g, "");
    return text ? composePrompt(text) : composePrompt(idea);
  } catch (err) {
    logger.warn("prompt enhance skipped", { error: (err as Error).message });
    return composePrompt(idea);
  }
}
