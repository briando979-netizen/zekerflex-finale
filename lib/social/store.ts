import { randomUUID } from "node:crypto";
import { kvDelete, kvGet, kvListValues, kvSet } from "@/lib/storage/kv";
import { openSecret, sealSecret } from "@/lib/security/sealed-secret";
import { KANAAL_IDS, kanaalDef, type KanaalId } from "@/lib/social/kanalen";
import {
  STANDAARD_AUTOPILOT,
  type AutopilotInstelling,
  type KanaalConfig,
  type SocialPost,
} from "@/lib/social/model";

// ---------------------------------------------------------------------------
// Opslag van het sociale-mediaonderdeel in de KV-tabel (geen migratie). Het token van de
// Meta-koppeling staat verzegeld (AES-GCM, lib/security/sealed-secret.ts) en gaat nooit terug naar
// de browser of in een log; alleen de naam van de pagina en wanneer hij laatst gecontroleerd is.
// ---------------------------------------------------------------------------

const K_POST = "social:post:";
const K_KANAAL = "social:kanaal:";
const K_AUTOPILOT = "social:autopilot";
const K_META = "social:meta";
const SEAL = "social-meta";

export const schoonId = (id: string) => id.replace(/[^a-z0-9-]/gi, "").slice(0, 40);

// --- berichten ------------------------------------------------------------------

export async function savePost(p: SocialPost): Promise<SocialPost> {
  await kvSet(K_POST + p.id, p);
  return p;
}

export function nieuwId(): string {
  return randomUUID().slice(0, 12);
}

export async function getPost(id: string): Promise<SocialPost | null> {
  return kvGet<SocialPost>(K_POST + schoonId(id));
}

export async function listPosts(limit = 400): Promise<SocialPost[]> {
  const rijen = await kvListValues<SocialPost>(K_POST, limit);
  return rijen.sort((a, b) => ((a.plan ?? a.gemaakt) < (b.plan ?? b.gemaakt) ? 1 : -1));
}

export async function deletePost(id: string): Promise<void> {
  await kvDelete(K_POST + schoonId(id));
}

// --- kanalen ---------------------------------------------------------------------

function standaardConfig(id: KanaalId): KanaalConfig {
  return { profielUrl: kanaalDef(id)?.standaardProfiel ?? "", bevestigd: false, notitie: "" };
}

export async function getKanaalConfigs(): Promise<Record<KanaalId, KanaalConfig>> {
  const uit = {} as Record<KanaalId, KanaalConfig>;
  const rijen = await Promise.all(KANAAL_IDS.map((id) => kvGet<KanaalConfig>(K_KANAAL + id).catch(() => null)));
  KANAAL_IDS.forEach((id, i) => {
    uit[id] = { ...standaardConfig(id), ...(rijen[i] ?? {}) };
  });
  return uit;
}

export async function setKanaalConfig(id: KanaalId, c: KanaalConfig): Promise<void> {
  await kvSet(K_KANAAL + id, c);
}

// --- autopilot ----------------------------------------------------------------------

export async function getAutopilot(): Promise<AutopilotInstelling> {
  return { ...STANDAARD_AUTOPILOT, ...((await kvGet<Partial<AutopilotInstelling>>(K_AUTOPILOT).catch(() => null)) ?? {}) };
}

export async function setAutopilot(a: AutopilotInstelling): Promise<void> {
  await kvSet(K_AUTOPILOT, a);
}

// --- Meta (Facebook + Instagram) -----------------------------------------------------

interface MetaOpslag {
  tokenSealed: string;
  pageId: string;
  pageNaam: string;
  igUserId: string | null;
  igNaam: string | null;
  gecontroleerd: string;
}

export interface MetaStatus {
  verbonden: boolean;
  pageId: string | null;
  pageNaam: string | null;
  igUserId: string | null;
  igNaam: string | null;
  gecontroleerd: string | null;
}

export async function getMetaStatus(): Promise<MetaStatus> {
  const m = await kvGet<MetaOpslag>(K_META).catch(() => null);
  return {
    verbonden: Boolean(m),
    pageId: m?.pageId ?? null,
    pageNaam: m?.pageNaam ?? null,
    igUserId: m?.igUserId ?? null,
    igNaam: m?.igNaam ?? null,
    gecontroleerd: m?.gecontroleerd ?? null,
  };
}

export async function setMeta(token: string, v: { pageId: string; pageNaam: string; igUserId: string | null; igNaam: string | null }): Promise<void> {
  const opslag: MetaOpslag = { tokenSealed: sealSecret(token, SEAL), ...v, gecontroleerd: new Date().toISOString() };
  await kvSet(K_META, opslag);
}

/** Het token zelf, alleen voor een oproep naar Meta op de server. Null als er geen koppeling is of hij onleesbaar is. */
export async function metaToken(): Promise<{ token: string; pageId: string; igUserId: string | null } | null> {
  const m = await kvGet<MetaOpslag>(K_META).catch(() => null);
  if (!m) return null;
  try {
    return { token: openSecret(m.tokenSealed, SEAL), pageId: m.pageId, igUserId: m.igUserId };
  } catch {
    return null;
  }
}

export async function wisMeta(): Promise<void> {
  await kvDelete(K_META);
}
