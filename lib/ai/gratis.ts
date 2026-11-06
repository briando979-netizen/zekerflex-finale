import { env } from "@/lib/env";
import { kvGet, kvSet } from "@/lib/storage/kv";

// ---------------------------------------------------------------------------
// "Alles gratis": de AI draait dan op onze eigen server (Ollama op de VPS) in
// plaats van bij een betaalde aanbieder. Aan en uit te zetten in
// Admin → ZekerFlex AI, zonder uitrol — net als de modelkeuze per rol
// (lib/ai/llm-model.ts), met dezelfde sync-leesbare cache omdat
// lib/ai/models.ts en lib/ai/client.ts synchroon zijn.
//
// Staat het aan, dan gaat élke taak naar het eigen model. Dat kost niets en
// de gegevens blijven op onze eigen server; het model is kleiner, dus lange
// of ingewikkelde opdrachten worden eenvoudiger beantwoord.
// ---------------------------------------------------------------------------

const KEY = "ai-node:gratis";
const TTL_MS = 60_000;

export interface GratisStand {
  aan: boolean;
  /** eigen AI-server (OpenAI-compatibel); leeg = afleiden uit de omgeving */
  basis: string;
  /** model voor alle taaltaken op de eigen server */
  model: string;
}

/** Waar onze eigen AI-server draait: de instelling, anders die van de embeddings, anders Ollama naast de app. */
export function eigenBasisUrl(): string {
  const ruw = (env.LLM_EMBED_BASE_URL ?? "").trim();
  const basis = ruw || "http://ollama:11434/v1";
  return basis.replace(/\/+$/, "");
}

export const STANDAARD_GRATIS_MODEL = "qwen2.5:3b";

const leeg = (): GratisStand => ({ aan: false, basis: "", model: "" });
let cache: { v: GratisStand; at: number } = { v: leeg(), at: 0 };

function lees(raw: unknown): GratisStand {
  const r = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    aan: r.aan === true,
    basis: typeof r.basis === "string" ? r.basis.trim().replace(/\/+$/, "") : "",
    model: typeof r.model === "string" ? r.model.trim() : "",
  };
}

/** Sync: staat de gratis stand aan? */
export const gratisAan = (): boolean => cache.v.aan;

/** Sync: de eigen AI-server die nu gebruikt wordt (alleen zinvol als gratisAan()). */
export const gratisBasis = (): string => cache.v.basis || eigenBasisUrl();

/** Sync: het model op de eigen server. Embeddings houden hun eigen model. */
export const gratisModel = (role?: string): string =>
  role === "embed" ? env.LLM_EMBED_MODEL || "nomic-embed-text" : cache.v.model || STANDAARD_GRATIS_MODEL;

/** Async: ververs de cache uit KV (goedkoop, 60s). Wordt vóór elke AI-aanroep gedaan. */
export async function primeGratis(): Promise<void> {
  if (cache.at > 0 && Date.now() - cache.at < TTL_MS) return;
  try {
    cache = { v: lees(await kvGet<unknown>(KEY)), at: Date.now() };
  } catch {
    cache = { v: cache.v, at: Date.now() }; // opslag even weg → laatste waarde houden
  }
}

export async function getGratisStand(): Promise<GratisStand> {
  await primeGratis();
  return { ...cache.v };
}

/** Wat je mag wijzigen; een veld weglaten laat het staan (exactOptionalPropertyTypes: expliciet `| undefined`). */
export type GratisWijziging = {
  aan?: boolean | undefined;
  basis?: string | undefined;
  model?: string | undefined;
};

export async function setGratisStand(next: GratisWijziging): Promise<GratisStand> {
  await primeGratis();
  const v = lees({ ...cache.v, ...next });
  await kvSet(KEY, v);
  cache = { v, at: Date.now() };
  return v;
}
