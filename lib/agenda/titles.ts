import { chatJson } from "@/lib/ai/client";
import { redis } from "@/lib/redis";

// ---------------------------------------------------------------------------
// The local LLM only writes a short title and pulls out the location for an
// appointment the rules already found. It never decides dates or times: the
// small self-hosted models get relative dates wrong, and appointments are
// planned without a confirmation step. A location is only kept when it is
// literally in the text. When the model is unreachable the caller's fallback
// title is used and the model is left alone for ten minutes.
// ---------------------------------------------------------------------------

const DOWN_KEY = "agenda:llm-down";
const DOWN_SECONDS = 600;

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

// Small models put "morgen"/"dinsdag" in the title despite the instruction —
// stored, that is wrong the next day, so date and time words are removed.
const WHEN_WORDS =
  /\b(vandaag|vanavond|vanmiddag|vanochtend|morgen\w*|overmorgen|maandag\w*|dinsdag\w*|woensdag\w*|donderdag\w*|vrijdag\w*|zaterdag\w*|zondag\w*|volgende|komende|aanstaande|week|om|uur|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|at)\b|\b\d{1,2}([:.u]\d{2})?\s*(uur|u)?\b/gi;

export function withoutWhen(title: string): string {
  return title.replace(WHEN_WORDS, " ").replace(/\s+/g, " ").replace(/^[\s,–-]+|[\s,–-]+$/g, "").trim();
}

export async function describeAppointment(
  phrase: string,
  context: string,
  fallbackTitle: string,
): Promise<{ title: string; location: string | null; byAi: boolean }> {
  const fallback = { title: fallbackTitle, location: null, byAi: false };
  try {
    if (await redis.get(DOWN_KEY)) return fallback;
  } catch {
    /* no redis — just try the model */
  }
  try {
    const out = await chatJson<{ titel?: unknown; locatie?: unknown }>({
      purpose: "agenda",
      retry: false,
      // runs after the response; a cold self-hosted model needs ~20s to load
      timeoutMs: 30_000,
      maxTokens: 80,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            'Je maakt een korte Nederlandse agendatitel (maximaal 6 woorden) voor een afspraak uit een bericht, en noemt de locatie als die er letterlijk in staat. Antwoord alleen met JSON: {"titel": string, "locatie": string of null}. Verzin niets; noem geen datum of tijd in de titel.',
        },
        { role: "user", content: `Context: ${context}\nBericht: ${phrase}` },
      ],
    });
    const title = typeof out.titel === "string" ? withoutWhen(out.titel) : "";
    const rawLocation = typeof out.locatie === "string" ? out.locatie.trim() : "";
    const location = rawLocation.length >= 3 && norm(phrase).includes(norm(rawLocation)) ? rawLocation.slice(0, 120) : null;
    if (title.length < 3 || title.length > 80) return { ...fallback, location };
    return { title: title.charAt(0).toUpperCase() + title.slice(1), location, byAi: true };
  } catch (err) {
    // slow is not down: only an unreachable model is left alone for a while
    if (!/timed out/i.test((err as Error).message)) {
      await redis.set(DOWN_KEY, "1", "EX", DOWN_SECONDS).catch(() => undefined);
    }
    return fallback;
  }
}
