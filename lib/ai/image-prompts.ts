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

  // --- YoungOnes-genre marketing set: the same bright, candid, energetic
  // lifestyle-at-work look, but an original diverse cast and our own workwear
  // styling (deep green + mint accents, never a competitor's brand or colours).
  {
    key: "bar-night",
    label: "Horeca — bartender in de avond",
    slot: "team",
    aspect: "wide",
    base:
      "a young bartender with short curly hair and tattoos mixing a drink behind a busy cocktail bar at night, " +
      "candid mid-pour, warm amber light, wearing a dark green apron over a plain tee",
  },
  {
    key: "festival-crew",
    label: "Events — festivalcrew",
    slot: "team",
    aspect: "wide",
    base:
      "two event crew members in their early 20s setting up an outdoor festival stage, high-visibility vests over " +
      "casual streetwear, energetic teamwork, golden-hour light, motion in the scene",
  },
  {
    key: "bike-courier",
    label: "Bezorging — fietskoerier",
    slot: "freelancer",
    aspect: "portrait",
    base:
      "a bike courier in their late 20s with a large square delivery backpack waiting at a city crossing, " +
      "catching their breath, determined expression, practical cycling clothes, urban dusk behind them",
  },
  {
    key: "cleaning-morning",
    label: "Schoonmaak — vroege ochtend",
    slot: "freelancer",
    aspect: "landscape",
    base:
      "a cleaning professional in their 40s wiping down a bright modern office in the early morning, calm and thorough, " +
      "plain work polo, soft daylight through large glass windows",
  },
  {
    key: "retail-fashion",
    label: "Retail — modewinkel",
    slot: "freelancer",
    aspect: "landscape",
    base:
      "a retail worker in their 20s folding clothes on a table in a bright fashion store, relaxed and stylish casual outfit, " +
      "natural unposed movement, warm store lighting",
  },
  {
    key: "care-home",
    label: "Zorg — warme ontmoeting",
    slot: "freelancer",
    aspect: "landscape",
    base:
      "a healthcare support worker in their 30s sharing a warm genuine moment with an elderly resident in a sunlit care-home " +
      "common room, plain care tunic, soft and real, not posed",
  },
  {
    key: "construction-plans",
    label: "Bouw — bouwplaats",
    slot: "freelancer",
    aspect: "portrait",
    base:
      "a construction worker in their 30s reading building plans on site, hard hat and hi-vis vest, confident and focused, " +
      "overcast daylight, scaffolding softly out of focus behind",
  },
  {
    key: "break-group",
    label: "Team — pauze buiten",
    slot: "team",
    aspect: "wide",
    base:
      "four young colleagues of different backgrounds laughing together on a short break outside a warehouse, " +
      "a mix of casual workwear, candid group energy, bright daylight",
  },
  {
    key: "hero-logistics-driver",
    label: "Hero — magazijn in beweging",
    slot: "hero",
    aspect: "portrait",
    base:
      "a woman in her late 20s steering a pallet jack down a bright distribution-centre aisle, focused and capable, " +
      "plain workwear, motion blur in the racking around her",
  },
  {
    key: "student-flex",
    label: "Freelancer — student tussen colleges",
    slot: "freelancer",
    aspect: "portrait",
    base:
      "a university student in their early 20s checking shift details on their phone between lectures in a campus courtyard, " +
      "backpack over one shoulder, relaxed everyday clothes, natural daylight",
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
