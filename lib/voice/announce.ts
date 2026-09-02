import type { AnnouncementPriority, VoiceAnnouncement } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { chat } from "@/lib/ai/client";
import { isServerTtsEnabled } from "@/lib/voice/tts";

// ---------------------------------------------------------------------------
// Spoken status updates.
//
// `announce()` records a VoiceAnnouncement (optionally rephrased by the local
// LLM into natural spoken Dutch). A connected admin client polls
// GET /api/voice/stream and speaks anything still unspoken.
// ---------------------------------------------------------------------------

export interface AnnounceInput {
  text: string;
  category: string;
  priority?: AnnouncementPriority;
  source?: string;
  /** Ask the local LLM to make it sound like natural speech (best effort). */
  rephrase?: boolean;
}

const REPHRASE_SYSTEM =
  "Herschrijf de melding als één korte, natuurlijke Nederlandse spreekzin voor een spraakassistent. " +
  "Geen opmaak, geen emoji, geen aanhalingstekens. Max 30 woorden. Behoud alle cijfers en namen.";

async function toSpokenDutch(text: string): Promise<string> {
  try {
    const r = await chat({
      messages: [
        { role: "system", content: REPHRASE_SYSTEM },
        { role: "user", content: text },
      ],
      temperature: 0.3,
      maxTokens: 80,
      timeoutMs: 6000,
    });
    const spoken = r.text.replace(/["\n]+/g, " ").trim();
    return spoken.length >= 3 ? spoken.slice(0, 400) : text;
  } catch {
    return text;
  }
}

export async function announce(
  input: AnnounceInput,
): Promise<VoiceAnnouncement | null> {
  if (!env.VOICE_ENABLED) return null;

  const base = input.text.trim();
  if (!base) return null;

  const text = input.rephrase ? await toSpokenDutch(base) : base.slice(0, 400);

  try {
    const row = await prisma.voiceAnnouncement.create({
      data: {
        text,
        category: input.category,
        priority: input.priority ?? "NORMAL",
        source: input.source ?? "system",
      },
    });
    logger.info("voice announcement queued", {
      id: row.id,
      category: row.category,
      priority: row.priority,
    });
    return row;
  } catch (err) {
    logger.warn("voice announcement failed", { error: (err as Error).message });
    return null;
  }
}

/** Unspoken announcements, highest priority first, then oldest. */
export async function pendingAnnouncements(limit = 10) {
  return prisma.voiceAnnouncement.findMany({
    where: { spokenAt: null },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: limit,
  });
}

export async function markSpoken(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await prisma.voiceAnnouncement.updateMany({
    where: { id: { in: ids }, spokenAt: null },
    data: { spokenAt: new Date() },
  });
}

export interface VoiceCapabilities {
  enabled: boolean;
  serverTts: boolean;
}

export function voiceCapabilities(): VoiceCapabilities {
  return { enabled: env.VOICE_ENABLED, serverTts: isServerTtsEnabled() };
}
